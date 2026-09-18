/**
 * Python (Pyodide) Interpreter (Logifunge engine shape: "python")
 *
 * Runs real CPython — via Pyodide, a WebAssembly build of CPython — inside
 * the shared LOGIFUNGE IDE. This is the only engine in the site that isn't
 * an esolang: it's plain Python 3, included so the IDE can be used as a
 * quick, install-free Python scratchpad alongside the esoteric languages.
 *
 * === WHY THIS ENGINE LOOKS DIFFERENT FROM THE OTHERS ===
 *   Every other engine here (v1-v6, brainfrick, malbolge) executes one
 *   discrete instruction per `_step()` call, so the shared IDE can drive it
 *   with a synchronous step loop and a real step debugger. Pyodide has no
 *   such hook — a Python program runs as one opaque unit — and loading the
 *   Pyodide runtime itself is an async, one-time network fetch. So instead
 *   of `_step()`/`run()`, this engine exposes a single `runAsync()` method
 *   and declares the `'async'` feature flag. The shared run page (see
 *   functions/_run-template.js) checks for that flag and, for this engine
 *   only, awaits `runAsync()` from the Run button instead of driving the
 *   normal step loop — and hides Step/Speed/Max Steps/Direction/Pixel UI
 *   that don't apply here (also via feature flags: no 'pixels' feature).
 *
 * === OUTPUT ===
 *   `sys.stdout`/`sys.stderr` are redirected to in-memory buffers for the
 *   duration of the run and appended to `this.output` (a plain string,
 *   same shape every other engine uses), so `print()` shows up in the
 *   Text output view exactly like `.` does for the other engines.
 *
 * === INPUT ===
 *   The shared IDE's Input field (`this.stdin`, a plain string — see the
 *   'input' feature) is split into lines. Python's `input()` is patched to
 *   pop one line at a time from that list, raising the normal EOFError
 *   once it's exhausted, matching real Python's behavior when stdin runs
 *   out.
 *
 * === LOADING ===
 *   Pyodide (~10 MB of wasm) is fetched from the jsDelivr CDN the first
 *   time this engine runs on a page and cached by the browser after that;
 *   `onStatus`, if set, receives progress text ("Loading Python runtime…")
 *   so the IDE can surface it in the status bar during that first fetch.
 *   The loaded runtime is cached on `self.pyodide` so repeated runs in the
 *   same tab (or the same Turbo worker) don't reload it.
 *
 * === WHAT'S NOT SUPPORTED ===
 *   No pixel output, no step debugger, no Stacks/Memory panels (Python's
 *   real state lives inside the wasm heap, not in a shape this IDE can
 *   inspect) — the Stacks view simply falls back to the shared IDE's
 *   default empty Data Stack + Memory panels. Only pure-Python packages in
 *   the Pyodide distribution are importable; there's no pip/network access
 *   from inside the running program itself.
 */

class BefungeLogicInterpreter {
  // Capability flags read by the shared IDE template. No 'pixels' -> the
  // Pixel/Dual output views and the W/H dimension fields are hidden.
  // 'async' -> the IDE awaits runAsync() from Run instead of stepping, and
  // hides Step/Speed/Max Steps/Direction, which don't apply to Python.
  static FEATURES = ['text', 'input', 'async'];

  // No engine-specific panels — Python's runtime state isn't something
  // this IDE can inspect, so the Stacks view just falls back to the
  // shared default (always-empty) Data Stack + Memory pair.
  static STACK_PANELS = [];

  // Shared across instances so the (large, one-time) Pyodide download and
  // boot only happens once per page/worker, no matter how many times the
  // user presses Run.
  static _pyodidePromise = null;

  constructor(code, pixelWidth = 32, pixelHeight = 32, maxSteps = 1000000) {
    this.sourceCode = code;
    this.ip = { x: 0, y: 0 };       // unused — kept only so shared UI bits that read interp.ip don't break
    this.dir = { x: 1, y: 0 };      // unused, same reason
    this.stack = [];                // always empty — see STACK_PANELS note above
    this.memory = {};                // always empty, same reason
    this.memoryPointer = 0;
    this.output = '';               // accumulated stdout+stderr text
    this.pixels = [];               // unused — Python has no pixel output here
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.stdin = '';                // fed to input(), one line per call — set before runAsync()
    this.running = false;
    this.steps = 0;
    this.maxSteps = maxSteps;
    this.error = null;
    this.onStatus = null;           // optional (message) => void, for load/run progress text
  }

  _report(message) {
    if (typeof this.onStatus === 'function') {
      try { this.onStatus(message); } catch (_) { /* status callback is best-effort */ }
    }
  }

  // Loads Pyodide once per page (or per Turbo worker) and caches it on
  // `self.pyodide`. Works both on the main thread (injects a <script> tag)
  // and inside a Worker (uses importScripts), since Turbo mode runs this
  // same engine file inside a worker via importScripts().
  static _loadPyodide(onStatus) {
    if (typeof self !== 'undefined' && self.pyodide) return Promise.resolve(self.pyodide);
    if (!BefungeLogicInterpreter._pyodidePromise) {
      BefungeLogicInterpreter._pyodidePromise = (async () => {
        const PYODIDE_VERSION = '0.26.4';
        const indexURL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
        if (typeof onStatus === 'function') onStatus('Loading Python runtime (first run only, then cached)…');

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

        const pyodide = await self.loadPyodide({ indexURL });
        self.pyodide = pyodide;
        return pyodide;
      })();
    }
    return BefungeLogicInterpreter._pyodidePromise;
  }

  async runAsync() {
    this.running = true;
    this.steps = 0;
    this.error = null;
    this.output = '';

    try {
      const pyodide = await BefungeLogicInterpreter._loadPyodide(msg => this._report(msg));
      this._report('Running…');

      const stdinLines = (this.stdin || '').split('\n');
      pyodide.globals.set('_logifunge_stdin_lines', stdinLines);

      // Redirect stdout/stderr to buffers and patch input() to read from
      // the IDE's Input field, one line per call, EOFError once exhausted
      // — this mirrors real Python's stdin-exhausted behavior.
      await pyodide.runPythonAsync(`
import sys, io, builtins
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
_logifunge_stdin_iter = iter(list(_logifunge_stdin_lines))
def _logifunge_input(prompt=''):
    try:
        return next(_logifunge_stdin_iter)
    except StopIteration:
        raise EOFError('EOF when reading a line')
builtins.input = _logifunge_input
`.trim());

      let pyError = null;
      try {
        await pyodide.runPythonAsync(this.sourceCode);
      } catch (err) {
        pyError = err && err.message ? err.message : String(err);
      }

      const stdoutText = pyodide.runPython('sys.stdout.getvalue()');
      const stderrText = pyodide.runPython('sys.stderr.getvalue()');
      this.output = stdoutText + (stderrText || '');
      if (pyError) this.error = pyError;
      this.steps = 1;
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
    };
  }

  // Kept only so nothing that still calls the sync interface outright
  // crashes with "not a function" — Python has no meaningful discrete
  // step, and execution is inherently async, so both just fail clearly
  // and point at runAsync() instead of silently doing the wrong thing.
  _step() {
    this.error = 'Step-by-step execution is not supported for Python — use Run.';
    this.running = false;
    return false;
  }

  run() {
    throw new Error('The Python engine is asynchronous — call runAsync() instead of run().');
  }
}

// Export for browser/worker use
if (typeof module !== 'undefined') {
  module.exports = BefungeLogicInterpreter;
}
