/**
 * Python (Pyodide) Interpreter (Logifunge engine shape: "python")
 *
 * Runs real CPython — via Pyodide, a WebAssembly build of CPython — inside
 * the shared LOGIFUNGE IDE, set up the same way the LOLCODE engine is: a
 * plain synchronous `_step()` / `run()` pair, the same Step / Speed /
 * Max Steps controls, a single "Variables" panel in the Stacks view, and an
 * active-cell highlight (`ip.endX`) that spans the whole line being executed.
 *
 * === HOW STEPPING WORKS ===
 *   LOLCODE is our own interpreter, so it can pause anywhere with a JS
 *   generator. Python here is real CPython inside wasm, and a running
 *   Pyodide call can't be paused from synchronous JS. So this engine
 *   records first and replays second:
 *
 *   1. `prepare()` (async, called once by the IDE before the first step)
 *      loads Pyodide if needed, then runs the whole program once under
 *      `sys.settrace`. For every line CPython is about to execute, it
 *      records the line number, how much output exists so far, and the
 *      variables in scope. The trace is capped at `maxSteps` line events, so
 *      an infinite loop ends with a "Step limit reached" error instead of
 *      hanging the tab.
 *   2. `_step()` then replays that trace ONE LINE PER CALL, synchronously,
 *      exactly like every other engine: it moves `ip` to the next line,
 *      truncates `output` to what had been printed by that point, and
 *      swaps in that moment's variables. `run()` is the same loop the other
 *      engines use, so Turbo mode (which runs `run()` in a worker) works too.
 *
 *   The one place this differs from a live debugger: the program has already
 *   finished by the time you press Step, so side effects such as an infinite
 *   `print` loop are cut off at the step cap rather than by Stop. (input()
 *   still pauses for you — see INPUT below.)
 *
 * === WHAT THE IDE SHOWS ===
 *   - Highlight: the whole source line about to run (the line is highlighted
 *     BEFORE it executes, like `pdb`; its effects appear on the next step).
 *   - Variables panel: the current scope's variables as `name: value`. At
 *     module level that's the globals; inside a function it's that call's
 *     locals, with an `in fname()` header first. Modules, functions and
 *     classes are left out to keep the list readable, and values are
 *     abbreviated (long strings/collections are cut off).
 *   - Output: `print()` and stderr, interleaved in the order they happened,
 *     growing as you step. An uncaught exception adds a normal Python
 *     traceback at the end and sets the error shown in the status bar.
 *
 * === INPUT ===
 *   input() behaves like a terminal. The prompt text is written to the
 *   output, and when the program asks for a line the engine pauses
 *   (`awaitingInput`) while the IDE shows a blinking input right after the
 *   prompt. Enter calls provideInput(line); Ctrl+D calls provideEOF(), after
 *   which input() raises the usual EOFError. The typed line is echoed into
 *   the output, exactly as a console would.
 *
 *   Because the program is recorded rather than run live (see above), a
 *   pause works by "record, stop at input(), ask, re-record": input() raises
 *   an internal exception when it has no line, the recording ends there, and
 *   after the user answers the program is recorded again with the extra line.
 *   The recording is identical up to that point (`random` is seeded with a
 *   fixed per-run seed so it stays that way), so replay carries on where it
 *   left off. Side effects other than print() — clocks, files, network —
 *   will be repeated on each re-run.
 *
 * === INSTANT RUN ===
 *   The Speed menu's "Instant" option (feature flag 'instant') skips the
 *   trace/replay above and calls `runInstant()`, which just executes the
 *   program at full CPython speed and reports the final output and
 *   variables — the original, pre-stepping behavior. There's no step
 *   cap, so an infinite loop will hang the tab, same as it always did.
 *
 * === LOADING ===
 *   Pyodide (~10 MB of wasm) is served from this site's own /pyodide/<ver>/
 *   folder (see PYODIDE_VERSION below); jsDelivr is only a fallback if that
 *   copy can't be loaded. The browser caches it after the first run;
 *   `onStatus`, if set, receives progress text for the status bar. The
 *   runtime is cached on `self.pyodide`, so repeat runs in a tab (or a
 *   Turbo worker) skip the download.
 *
 * === WHAT'S NOT SUPPORTED ===
 *   No pixel output. Only pure-Python packages in the Pyodide distribution
 *   are importable, and there's no pip/network access from inside a run.
 *   Only the code you type is traced — lines inside standard-library or
 *   other imported modules count as part of the line that called them.
 */

// Runs inside Pyodide. Defines _logifunge_trace(src, stdin_lines, max_steps),
// which executes `src` once under sys.settrace and returns the recording.
// (String.raw keeps the "\n" escapes below as Python escapes, not JS ones.)
const PY_TRACE_RUNNER = String.raw`
import sys, builtins, reprlib, traceback, types, linecache, random

_lf_short = reprlib.Repr()
_lf_short.maxstring = 60
_lf_short.maxother = 60
_lf_short.maxlong = 40
_lf_short.maxlist = 12
_lf_short.maxtuple = 12
_lf_short.maxset = 12
_lf_short.maxdict = 8
_lf_short.maxlevel = 2
_lf_hidden = (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, type)

def _lf_show(value):
    try:
        return _lf_short.repr(value)
    except Exception:
        return '<unprintable>'

def _lf_entries(mapping, header=None):
    entries = [header] if header else []
    for name, value in list(mapping.items()):
        if name.startswith('__') and name.endswith('__'):
            continue
        if isinstance(value, _lf_hidden):
            continue
        entries.append(name + ': ' + _lf_show(value))
    return entries

class _LfOut:
    def __init__(self):
        self.parts = []
        self.n = 0
    def write(self, s):
        s = str(s)
        self.parts.append(s)
        self.n += len(s)
        return len(s)
    def flush(self):
        pass
    def isatty(self):
        return False

# Raised by input() when the terminal has no line for it yet. It derives from
# BaseException so a program's own "except Exception" can't swallow it. The
# JS side shows the prompt, waits for the user, then re-runs the program with
# the extra line (see "INPUT" in the header comment).
class _LfNeedInput(BaseException):
    pass

def _lf_make_input(stdin_lines, closed, out):
    stdin_iter = iter(list(stdin_lines))
    def fake_input(prompt=''):
        # Like a real terminal: the prompt is printed, then the typed line is
        # echoed, so the output reads exactly as it would in a console.
        if prompt != '':
            out.write(str(prompt))
        try:
            line = next(stdin_iter)
        except StopIteration:
            if closed:
                raise EOFError('EOF when reading a line') from None
            raise _LfNeedInput() from None
        out.write(line + '\n')
        return line
    return fake_input

_LF_USER = '<user>'

# One-line description of an exception, e.g. "ZeroDivisionError: division
# by zero (line 3)", where the line is the last one in the user's own code.
def _lf_describe(exc):
    line = None
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == _LF_USER:
            line = tb.tb_lineno
        tb = tb.tb_next
    if line is None and isinstance(exc, SyntaxError):
        line = exc.lineno
    text = type(exc).__name__
    detail = exc.msg if isinstance(exc, SyntaxError) else str(exc)
    if detail:
        text += ': ' + str(detail)
    if line is not None:
        text += ' (line ' + str(line) + ')'
    return text

# A traceback showing only the user's own frames (hides this runner, the
# patched input(), and Pyodide's internals).
def _lf_user_traceback(exc):
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == _LF_USER]
    text = ''
    if frames:
        text = 'Traceback (most recent call last):\n' + ''.join(traceback.format_list(frames))
    return text + ''.join(traceback.format_exception_only(type(exc), exc))

# --- instant run: no tracing. begin() redirects output/input, the coroutine
# runs the program, end() restores everything and returns the results.
_lf_instant = {}

def _logifunge_instant_begin(src, stdin_lines, closed=False, seed=0):
    out = _LfOut()
    _lf_instant['out'] = out
    _lf_instant['need'] = False
    random.seed(seed)
    _lf_instant['saved'] = (sys.stdout, sys.stderr, builtins.input)
    sys.stdout = sys.stderr = out
    builtins.input = _lf_make_input(stdin_lines, closed, out)
    linecache.cache[_LF_USER] = (len(src), None, src.splitlines(True), _LF_USER)

async def _logifunge_instant_run(src, ns):
    from pyodide.code import eval_code_async
    try:
        await eval_code_async(src, ns, filename=_LF_USER)
    except SystemExit:
        return None
    except _LfNeedInput:
        _lf_instant['need'] = True
        return None
    except BaseException as exc:
        _lf_instant['out'].write(_lf_user_traceback(exc))
        return _lf_describe(exc)
    return None

def _logifunge_instant_end(ns):
    sys.stdout, sys.stderr, builtins.input = _lf_instant['saved']
    linecache.cache.pop(_LF_USER, None)
    return {
        'output': ''.join(_lf_instant['out'].parts),
        'final': _lf_entries(ns),
        'need': _lf_instant['need'],
    }

# --- traced run: executes src under sys.settrace and returns the recording
def _logifunge_trace(src, stdin_lines, max_steps, closed=False, seed=0):
    USER = _LF_USER
    random.seed(seed)  # same seed every re-run, so replays are identical

    class StepLimit(BaseException):
        pass

    out = _LfOut()
    lines, outlens, varidx = [], [], []
    varsets = [[]]
    state = {'count': 0, 'last': None}

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != USER:
            return None
        if event == 'line':
            if state['count'] >= max_steps:
                raise StepLimit()
            state['count'] += 1
            name = frame.f_code.co_name
            header = None if name == '<module>' else 'in ' + name + '()'
            snap = _lf_entries(frame.f_locals, header)
            if snap != state['last']:
                varsets.append(snap)
                state['last'] = snap
            lines.append(frame.f_lineno)
            outlens.append(out.n)
            varidx.append(len(varsets) - 1)
        return tracer

    ns = {'__name__': '__main__', '__builtins__': builtins}
    error = None
    need = False
    saved = (sys.stdout, sys.stderr, builtins.input)
    sys.stdout = sys.stderr = out
    builtins.input = _lf_make_input(stdin_lines, closed, out)
    linecache.cache[USER] = (len(src), None, src.splitlines(True), USER)
    try:
        try:
            code = compile(src, USER, 'exec')
        except SyntaxError as exc:
            error = _lf_describe(exc)
            out.write(''.join(traceback.format_exception_only(type(exc), exc)))
        else:
            sys.settrace(tracer)
            try:
                exec(code, ns)
            except StepLimit:
                error = 'Step limit (' + str(max_steps) + ') reached - possible infinite loop'
            except SystemExit:
                pass
            except _LfNeedInput:
                need = True
            except BaseException as exc:
                error = _lf_describe(exc)
                out.write(_lf_user_traceback(exc))
            finally:
                sys.settrace(None)
    finally:
        sys.stdout, sys.stderr, builtins.input = saved
        linecache.cache.pop(USER, None)

    return {
        'lines': lines,
        'outlens': outlens,
        'varidx': varidx,
        'varsets': varsets,
        'output': ''.join(out.parts),
        'final': _lf_entries(ns),
        'error': error,
        'need': need,
    }
`;

class BefungeLogicInterpreter {
  // No 'pixels' (Python has no pixel output here). Like LOLCODE this engine
  // is driven by the shared step loop; the only async part is prepare(),
  // which the IDE awaits once before stepping starts. 'instant' adds the
  // "Instant" entry to the Speed menu, which calls runInstant() instead.
  static FEATURES = ['text', 'input', 'instant'];

  // Where the Pyodide runtime lives. The files are served from this site at
  // /pyodide/<PYODIDE_VERSION>/ (see pyodide/<ver>/README.txt); jsDelivr is
  // only tried if that copy fails to load.
  static PYODIDE_VERSION = '0.26.4';

  // One "Variables" list panel — the current scope's variables — instead
  // of the default Data Stack + Memory pair, same as LOLCODE.
  static STACK_PANELS = [
    { id: 'vars', label: 'Variables', ariaLabel: 'Variables', searchLabel: 'variables', source: 'stack', type: 'list' },
  ];

  // Shared across instances so the (large, one-time) Pyodide download and
  // boot only happens once per page/worker.
  static _pyodidePromise = null;

  constructor(code, pixelWidth = 32, pixelHeight = 32, maxSteps = 1000000) {
    this.sourceCode = code;
    this._srcLines = String(code).split('\n');

    this.ip = { x: 0, y: 0, endX: 1 }; // line span highlighted this step
    this.dir = { x: 1, y: 0 };         // Python has no direction; kept for UI compatibility
    this.stack = [];                   // Variables panel — swapped in by _step()
    this.memory = {};                  // unused — kept so nothing reading interp.memory breaks
    this.memoryPointer = 0;            // unused, same reason
    this.output = '';
    this.pixels = [];
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.stdin = '';                   // legacy: pre-supplied lines for input() (the IDE now uses provideInput())
    this.interactive = false;          // kept for parity with the other engines; input() always pauses when out of lines
    this.awaitingInput = null;         // { kind: 'line' } while paused waiting for the user to type
    this._inputLines = null;           // lines typed so far (lazily seeded from `stdin`)
    this._eof = false;                 // Ctrl+D pressed: input() now raises EOFError
    this._seed = Math.floor(Math.random() * 2147483647); // fixed per run so re-recordings match
    this._runStarted = false;
    this.running = false;
    this.steps = 0;
    this.maxSteps = maxSteps;
    this.error = null;
    this.onStatus = null;              // optional (message) => void, for load/run progress text

    this._trace = null;                // recording from prepare(); replayed by _step()
    this._pos = 0;
  }

  _report(message) {
    if (typeof this.onStatus === 'function') {
      try { this.onStatus(message); } catch (_) { /* status callback is best-effort */ }
    }
  }

  // Directory URL of the copy of Pyodide served by this site. Needs an
  // absolute origin because in Turbo mode this file runs inside a blob:
  // worker, where a bare "/pyodide/..." path wouldn't resolve.
  static _localIndexURL() {
    const loc = typeof self !== 'undefined' ? self.location : null;
    const origin = loc && loc.origin && loc.origin !== 'null' ? loc.origin : '';
    return `${origin}/pyodide/${BefungeLogicInterpreter.PYODIDE_VERSION}/`;
  }

  // Loads the runtime from one directory URL. Works on the main thread
  // (injects a <script> tag) and inside a Worker (uses importScripts).
  static async _loadPyodideFrom(indexURL) {
    if (typeof importScripts === 'function') {
      // Worker context (Turbo mode) — synchronous script load.
      importScripts(indexURL + 'pyodide.js');
    } else if (typeof self.loadPyodide !== 'function') {
      // Main-thread context — inject the loader script once.
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = indexURL + 'pyodide.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load Pyodide from ${script.src}`));
        document.head.appendChild(script);
      });
    }
    return self.loadPyodide({ indexURL });
  }

  // Loads Pyodide once per page (or per Turbo worker) and caches it on
  // `self.pyodide`: this site's own copy first, jsDelivr only as a fallback.
  static _loadPyodide(onStatus) {
    if (typeof self !== 'undefined' && self.pyodide) return Promise.resolve(self.pyodide);
    if (!BefungeLogicInterpreter._pyodidePromise) {
      BefungeLogicInterpreter._pyodidePromise = (async () => {
        const say = msg => { if (typeof onStatus === 'function') onStatus(msg); };
        say('Loading Python runtime (first run only, then cached)…');

        let pyodide;
        try {
          pyodide = await BefungeLogicInterpreter._loadPyodideFrom(BefungeLogicInterpreter._localIndexURL());
        } catch (localErr) {
          say('Local Python runtime unavailable — trying the CDN…');
          const cdn = `https://cdn.jsdelivr.net/pyodide/v${BefungeLogicInterpreter.PYODIDE_VERSION}/full/`;
          try {
            pyodide = await BefungeLogicInterpreter._loadPyodideFrom(cdn);
          } catch (cdnErr) {
            throw new Error(`${cdnErr.message} (the copy on this site failed too: ${localErr.message})`);
          }
        }
        self.pyodide = pyodide;
        return pyodide;
      })().catch(err => {
        // Don't cache a failed download — let the next run try again.
        BefungeLogicInterpreter._pyodidePromise = null;
        throw err;
      });
    }
    return BefungeLogicInterpreter._pyodidePromise;
  }

  // Async setup the IDE awaits before the first _step()/run(): load Pyodide,
  // then execute the program once under sys.settrace and keep the recording.
  // Never throws — failures land in `this.error`, like runtime errors do.
  async prepare() {
    if (this._trace || this.error) return;
    await this._record();
  }

  _lines() {
    if (this._inputLines === null) this._inputLines = this.stdin ? String(this.stdin).split('\n') : [];
    return this._inputLines;
  }

  // Records the whole program once under sys.settrace with the lines typed
  // so far. If input() runs out of lines, the recording simply ends there
  // and is flagged `need` — see _step() and provideInput().
  async _record() {
    try {
      const pyodide = await BefungeLogicInterpreter._loadPyodide(msg => this._report(msg));
      this._report('Running…');

      pyodide.runPython(PY_TRACE_RUNNER);
      const runner = pyodide.globals.get('_logifunge_trace');
      const stdinLines = pyodide.toPy(this._lines());
      const proxy = runner(this.sourceCode, stdinLines, this.maxSteps, this._eof, this._seed);
      this._trace = proxy.toJs({ dict_converter: Object.fromEntries });
      proxy.destroy();
      stdinLines.destroy();
      runner.destroy();
    } catch (err) {
      this.error = `Pyodide error: ${err && err.message ? err.message : String(err)}`;
      this.running = false;
    }
  }

  // ── TERMINAL INPUT ──────────────────────────────────────────────
  // The IDE calls these when the user presses Enter / Ctrl+D in the
  // terminal. Stepping engines can't be paused mid-line (see the header
  // comment), so once a recording exists we re-record with the extra line;
  // the new recording starts with the same events, so replay just carries
  // on from where it stopped. Async — callers must await.
  async provideInput(text) {
    this._lines().push(String(text));
    this.awaitingInput = null;
    if (this._trace) await this._record();
  }

  async provideEOF() {
    this._eof = true;
    this.awaitingInput = null;
    if (this._trace) await this._record();
  }

  // Instant mode: run the program once at full speed, no tracing and no
  // step cap (the original pre-stepping behavior). Resolves with the same
  // result shape run() returns; never throws.
  async runInstant() {
    this.running = true;
    this.steps = 0;
    this.error = null;
    this.output = '';
    this.stack = [];
    this.awaitingInput = null;

    try {
      const pyodide = await BefungeLogicInterpreter._loadPyodide(msg => this._report(msg));
      this._report('Running…');

      pyodide.runPython(PY_TRACE_RUNNER);
      const begin = pyodide.globals.get('_logifunge_instant_begin');
      const runProgram = pyodide.globals.get('_logifunge_instant_run');
      const end = pyodide.globals.get('_logifunge_instant_end');
      const stdinLines = pyodide.toPy(this._lines());
      const ns = pyodide.globals.get('dict')();
      ns.set('__name__', '__main__');

      begin(this.sourceCode, stdinLines, this._eof, this._seed);
      // Resolves to an error description if the program raised, else undefined.
      const pyError = await runProgram(this.sourceCode, ns);
      const proxy = end(ns);
      const result = proxy.toJs({ dict_converter: Object.fromEntries });

      this.output = result.output;
      this.stack = result.final;
      this.awaitingInput = result.need ? { kind: 'line' } : null;
      if (pyError) this.error = pyError;
      this.steps = 1;

      proxy.destroy();
      ns.destroy();
      stdinLines.destroy();
      begin.destroy();
      runProgram.destroy();
      end.destroy();
    } catch (err) {
      this.error = `Pyodide error: ${err && err.message ? err.message : String(err)}`;
    } finally {
      this.running = false;
    }

    return {
      textOutput: this.output,
      pixels: this.pixels,
      steps: this.steps,
      error: this.error,
      stack: [...this.stack],
      memory: { ...this.memory },
      memoryPointer: this.memoryPointer,
      awaitingInput: this.awaitingInput,
    };
  }

  // ---- shared-IDE surface: _step()/run(), matching every other engine ----
  // Replays one recorded line event per call. Returns false once the
  // recording is exhausted (and applies the final output, variables, and
  // any error at that point).
  _step() {
    const t = this._trace;
    if (!t) {
      if (!this.error) this.error = 'Python runtime not ready — the IDE must await prepare() before stepping.';
      this.running = false;
      return false;
    }

    if (this._pos < t.lines.length) {
      const i = this._pos++;
      const row = t.lines[i] - 1;
      const text = this._srcLines[row] || '';
      const x = text.length - text.trimStart().length;
      this.ip = { x, y: row, endX: Math.max(text.trimEnd().length, x + 1) };
      this.output = t.output.slice(0, t.outlens[i]);
      this.stack = t.varsets[t.varidx[i]];
      return true;
    }

    this.output = t.output;
    this.stack = t.final;
    if (t.need) {
      // The program reached an input() with no line typed yet: the prompt is
      // already in the output, so hold here until provideInput() re-records.
      this.awaitingInput = { kind: 'line' };
      return true;
    }
    if (t.error) this.error = t.error;
    this.running = false;
    return false;
  }

  run() {
    this.running = true;
    // run() can be resumed after pausing for terminal input, so only the
    // first call resets the step counter.
    if (!this._runStarted) { this._runStarted = true; this.steps = 0; }
    while (this.running && this.steps < this.maxSteps) {
      try {
        if (!this._step()) break;
        if (this.awaitingInput) break; // paused for input — not a completed step
      } catch (err) {
        this.error = `Runtime error: ${err.message}`;
        this.running = false;
        break;
      }
      this.steps++;
    }
    if (this.running && this.steps >= this.maxSteps) {
      this.error = `Step limit (${this.maxSteps}) reached — possible infinite loop`;
      this.running = false;
    }
    return {
      textOutput: this.output,
      pixels: this.pixels,
      steps: this.steps,
      error: this.error,
      stack: [...this.stack],
      memory: { ...this.memory },
      memoryPointer: this.memoryPointer,
      awaitingInput: this.awaitingInput,
    };
  }
}

// Export for browser/worker use
if (typeof module !== 'undefined') {
  module.exports = BefungeLogicInterpreter;
}
