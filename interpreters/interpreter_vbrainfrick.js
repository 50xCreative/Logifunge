/**
 * Brainfuck Interpreter (Logifunge engine shape: "vbrainfrick")
 *
 * A standard Brainfuck implementation wearing the same engine interface as
 * the Logifunge Befunge-style interpreters (v1..v6), so it can be dropped
 * into the shared run page, worker, and Stacks/Memory panel with no changes
 * to any of that code.
 *
 * Unlike the vN engines, the instruction pointer here does NOT move in 2D —
 * Brainfuck has no directional commands. The IP simply walks the source in
 * reading order (left to right, top to bottom, wrapping to the next line),
 * and any character that isn't one of the eight commands below is treated
 * as a comment: it's skipped with no effect, same as how the other engines
 * treat a blank space.
 *
 * === COMMANDS ===
 *   >   Move the tape pointer right (no bound — the tape is a sparse,
 *       two-directional integer-indexed array; moving left of 0 is legal)
 *   <   Move the tape pointer left
 *   +   Increment the current cell, wrapping 255 -> 0 (8-bit cells)
 *   -   Decrement the current cell, wrapping 0 -> 255
 *   .   Output the current cell as an ASCII character
 *   ,   Read one character of input into the current cell (see INPUT below)
 *   [   If the current cell is 0, jump forward to just past the matching ]
 *   ]   If the current cell is nonzero, jump back to the matching [
 *
 * Everything else — letters, digits, punctuation, whitespace — is a comment
 * character and is simply passed over.
 *
 * === TAPE / MEMORY ===
 *   The tape is exposed as `this.memory` (sparse object keyed by cell
 *   index) with `this.memoryPointer` as the read/write head, which is
 *   exactly the shape the shared IDE's Memory panel already understands
 *   from the vN engines' M/S/L instructions. Brainfuck has no separate
 *   data stack, so `this.stack` is always empty. Rather than leave a
 *   permanently-empty "Data Stack" panel sitting next to it, this engine
 *   declares `STACK_PANELS` (see below) so the shared IDE's Stacks view
 *   renders just one panel — the tape, labeled "Tape" — for this engine.
 *
 * === FEATURES / STACK_PANELS ===
 *   Two static fields on the class describe this engine to the shared IDE
 *   template, which reads them (falling back to the v1-v6 defaults when a
 *   class doesn't define them) so none of that shared chrome needs to hard
 *   -code anything engine-specific:
 *     `FEATURES`     — capability flags. This engine declares 'input' (so
 *                      the IDE shows a terminal-style input line and feeds `this.stdin` via provideInput())
 *                      and 'memory', but not 'pixels' or 'stack', so the
 *                      IDE hides the Pixel/Dual views for this engine.
 *     `STACK_PANELS` — which panels the Stacks view renders and where each
 *                      one reads its data from on the interpreter instance.
 *
 * === INPUT ===
 *   `,` reads from `this.stdin`, a plain string buffer. In the IDE the
 *   engine runs with `interactive = true`: when the buffer is empty `,`
 *   pauses (`awaitingInput`) and the terminal asks the user, who answers via
 *   provideInput(line) (line + newline is buffered and echoed to the output)
 *   or provideEOF() (Ctrl+D). With `interactive` false (or after EOF),
 *   further `,` reads store 0 in the current cell — the common "EOF is
 *   zero" convention.
 *
 * === OUTPUT ===
 *   `.` appends a character to `this.output` (a plain string, matching the
 *   v6+ engines). There is no pixel output in Brainfuck; `this.pixels`
 *   stays empty, so Pixel/Dual view will simply show a blank canvas.
 *
 * The program ends when the IP walks off the end of the source (there's no
 * dedicated "halt" command in Brainfuck), or when the step limit is hit.
 */

class BefungeLogicInterpreter {
  // Capability flags read by the shared IDE template (see FEATURES /
  // STACK_PANELS note above). Not read by this engine itself.
  static FEATURES = ['memory', 'input', 'text'];

  // Only one panel: the tape, sourced from `this.memory` / `this.memoryPointer`
  // (same sparse-object shape the vN engines use for their Memory panel).
  // No 'stack' panel — this.stack is always empty, so showing it brings
  // nothing to a Brainfuck program.
  static STACK_PANELS = [
    { id: 'memory', label: 'Tape', ariaLabel: 'Tape', searchLabel: 'tape', source: 'memory', type: 'sparse', pointerSource: 'memoryPointer' },
  ];

  constructor(code, pixelWidth = 64, pixelHeight = 64, maxSteps = 1000000) {
    this.sourceCode = code;
    this.grid = this._parseGrid(code);
    this.ip = { x: 0, y: 0 };
    this.dir = { x: 1, y: 0 }; // Brainfuck's IP only ever reads forward; kept for UI compatibility (the "Dir >" indicator)
    this.stack = [];           // Brainfuck has no data stack — always empty
    this.memory = {};          // the tape, sparse, keyed by (possibly negative) integer index
    this.memoryPointer = 0;    // the tape head
    this.output = '';          // accumulated text output
    this.pixels = [];          // unused — Brainfuck has no pixel output
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.stdin = '';           // input buffer for ',' — filled by provideInput() (or set directly before running)
    this._stdinPos = 0;
    this.interactive = false;  // true = pause for terminal input instead of returning EOF
    this._stdinClosed = false; // set by provideEOF() (Ctrl+D in the terminal)
    this.awaitingInput = null; // { kind: 'char' } while paused waiting for the user to type
    this.running = false;
    this.steps = 0;
    this.maxSteps = maxSteps;
    this.error = null;

    this.matchBracket = {};    // "x,y" -> {x,y} of the matching bracket, in either direction
    this._scanBrackets();
  }

  _parseGrid(code) {
    const lines = code.split('\n');
    return lines.map(l => l.split(''));
  }

  _getCell(x, y) {
    const row = this.grid[y];
    if (!row) return ' ';
    return row[x] !== undefined ? row[x] : ' ';
  }

  _forEachCell(cb) {
    for (let y = 0; y < this.grid.length; y++) {
      const row = this.grid[y];
      for (let x = 0; x < row.length; x++) cb(row[x], x, y);
    }
  }

  // Balances [ ] pairs in reading order, same traversal the IP itself uses.
  // Unmatched brackets are left out of the map on purpose — reaching one
  // during execution raises a normal runtime error (with position/stack
  // context) rather than failing silently at parse time.
  _scanBrackets() {
    const open = [];
    this._forEachCell((ch, x, y) => {
      if (ch === '[') {
        open.push({ x, y });
      } else if (ch === ']') {
        const start = open.pop();
        if (start) {
          this.matchBracket[`${start.x},${start.y}`] = { x, y };
          this.matchBracket[`${x},${y}`] = start;
        }
      }
    });
  }

  // Next position in reading order, or null if the IP has walked off the
  // end of the program (normal termination, not an error).
  _nextPos(x, y) {
    const row = this.grid[y];
    if (row && x + 1 < row.length) return { x: x + 1, y };
    const ny = y + 1;
    if (ny < this.grid.length) return { x: 0, y: ny };
    return null;
  }

  _cell() { return this.memory[this.memoryPointer] || 0; }
  _setCell(v) { this.memory[this.memoryPointer] = ((v % 256) + 256) % 256; }

  _readInput() {
    if (this._stdinPos < this.stdin.length) {
      return this.stdin.charCodeAt(this._stdinPos++);
    }
    if (this.interactive && !this._stdinClosed) {
      this.awaitingInput = { kind: 'char' };
      return null; // null = "no input yet": _step() holds position and retries after provideInput()
    }
    return 0; // EOF convention
  }

  // ── TERMINAL INPUT ──────────────────────────────────────────────
  // Called by the IDE when the user presses Enter in the terminal. Like a
  // real (line-buffered) terminal, the whole line plus a newline goes into
  // the buffer and is echoed into the output; ',' then consumes it one
  // character at a time.
  provideInput(text) {
    this.stdin += String(text) + '\n';
    this.output += String(text) + '\n';
    this.awaitingInput = null;
  }

  // Ctrl+D in the terminal: no more input, further ',' reads give 0.
  provideEOF() {
    this._stdinClosed = true;
    this.awaitingInput = null;
  }

  _formatError(message, cell = null, x = this.ip.x, y = this.ip.y) {
    return `${message} (instruction=${JSON.stringify(cell === null ? this._getCell(x, y) : cell)}, position=(${x},${y}), cell=${this._cell()}, pointer=${this.memoryPointer})`;
  }

  _fail(message, cell = null, x = this.ip.x, y = this.ip.y) {
    this.error = this._formatError(message, cell, x, y);
    this.running = false;
    return false;
  }

  _advance() {
    const next = this._nextPos(this.ip.x, this.ip.y);
    if (!next) { this.running = false; return; }
    this.ip = next;
  }

  _step() {
    const x = this.ip.x, y = this.ip.y;
    const cell = this._getCell(x, y);

    switch (cell) {
      case '>': this.memoryPointer += 1; break;
      case '<': this.memoryPointer -= 1; break;
      case '+': this._setCell(this._cell() + 1); break;
      case '-': this._setCell(this._cell() - 1); break;
      case '.': this.output += String.fromCharCode(this._cell()); break;
      case ',': {
        const v = this._readInput();
        if (v === null) return true; // waiting for terminal input — hold position
        this.memory[this.memoryPointer] = v;
        break;
      }

      case '[': {
        if (this._cell() === 0) {
          const partner = this.matchBracket[`${x},${y}`];
          if (!partner) return this._fail('Unmatched [', cell, x, y);
          const after = this._nextPos(partner.x, partner.y);
          if (!after) { this.running = false; return true; }
          this.ip = after;
          return true; // position already resolved — skip the normal advance below
        }
        break;
      }

      case ']': {
        if (this._cell() !== 0) {
          const partner = this.matchBracket[`${x},${y}`];
          if (!partner) return this._fail('Unmatched ]', cell, x, y);
          this.ip = { x: partner.x, y: partner.y }; // re-lands on '[', which re-checks the condition
          return true;
        }
        break;
      }

      default: break; // comment character
    }

    this._advance();
    return true;
  }

  run() {
    this.running = true;
    // run() can be resumed after the engine paused for terminal input, so
    // only the first call resets the step counter.
    if (!this._runStarted) { this._runStarted = true; this.steps = 0; }
    while (this.running && this.steps < this.maxSteps) {
      try {
        if (!this._step()) break;
        if (this.awaitingInput) break; // paused for input — not a completed step
      } catch (err) {
        this.error = this._formatError(`Runtime error: ${err.message}`);
        this.running = false;
        break;
      }
      this.steps++;
    }
    if (this.steps >= this.maxSteps) {
      this.error = this._formatError(`Step limit (${this.maxSteps}) reached — possible infinite loop`);
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

// Export for browser use
if (typeof module !== 'undefined') {
  module.exports = BefungeLogicInterpreter;
}