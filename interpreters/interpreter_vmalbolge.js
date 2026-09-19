/**
 * Malbolge Interpreter (Logifunge engine shape: "vmalbolge")
 *
 * A standard Malbolge implementation wearing the same engine interface as
 * the Logifunge Befunge-style interpreters (v1..v6) and vbrainfrick, so it
 * can be dropped into the shared run page, worker, and Stacks/Memory panel
 * with no changes to any of that code.
 *
 * Malbolge is deliberately the most hostile of the bundled engines: it's a
 * ternary (base-3) virtual machine where every instruction rewrites itself
 * the moment it runs, so a program's own source code is unrecognizable a
 * few steps after it starts. This file implements the language exactly as
 * specified (see https://esolangs.org/wiki/Malbolge and
 * https://en.wikipedia.org/wiki/Malbolge) rather than a simplified variant.
 *
 * === THE MACHINE ===
 *   Three registers, all starting at 0: `A` (the accumulator, used by I/O
 *   and left holding the result of most operations), `C` (the code
 *   pointer — the address of the next instruction), and `D` (the data
 *   pointer, used by the data-manipulation instructions).
 *   Memory is 59049 (3^10) words, addresses 0..59048, each word a 10-trit
 *   number (0..59048). Code and data share this one address space.
 *
 * === LOADING ===
 *   The source is scanned left to right; whitespace is skipped entirely
 *   (it doesn't occupy a memory word). Every other character must be a
 *   printable ASCII value from 33-126 that decodes (see OPCODES below) to
 *   one of the 8 valid instructions *for its address* — Malbolge's opcode
 *   depends on `(address + value) mod 94`, so the same character means a
 *   different thing depending on where it sits. A character that isn't a
 *   valid instruction at its position is a load-time error, matching the
 *   real Malbolge toolchain rather than silently producing undefined
 *   behavior. Once the source is loaded, the rest of memory (positions
 *   progLen..59048) is filled by repeatedly applying the "crazy" operation
 *   (see below) to the previous two words — the same rule used to fill
 *   memory during a normal run, just run ahead of time here.
 *
 * === FETCH / EXECUTE / ENCIPHER / ADVANCE ===
 *   Each step: read `mem[C]`; if it isn't in 33-126, execution halts with
 *   an error (an unencrypted, "fresh" cell always is, but self-modifying
 *   code can wander into an invalid cell, which is a normal way for a
 *   buggy Malbolge program to crash). The opcode is `(C + mem[C]) mod 94`,
 *   decoded via OPCODES below (unmapped codes are a no-op, matching spec).
 *   After the instruction runs — including updating `C` itself, for the
 *   jump instruction — the cell now at `mem[C]` is enciphered in place
 *   (mod-94 substitution, see CIPHER below) if it's still in 33-126. This
 *   ordering is exactly why a jump's *target* gets enciphered instead of
 *   the jump instruction itself: `C` already points at the target by the
 *   time the encipher step runs. Finally both `C` and `D` are incremented
 *   modulo 59049 and the cycle repeats.
 *
 * === THE EIGHT INSTRUCTIONS ===
 *   i (op 4)   C = [D]                       jump
 *   < (op 5)   PRINT(A mod 256)               output
 *   / (op 23)  A = INPUT                      input (10=newline, 59048=EOF)
 *   * (op 39)  [D] = A = rotate_right([D])    rotate one trit right
 *   j (op 40)  D = [D]                        move data pointer
 *   p (op 62)  [D] = A = CRAZY(A, [D])        the "crazy" tritwise op
 *   o (op 68)  nothing                        nop
 *   v (op 81)  halt                           end program
 *   (anything else) nothing — a nop, same as o, but not a legal *source*
 *   character (it can only arise from self-modification at runtime).
 *
 * === CRAZY OPERATION ===
 *   A tritwise operation on A and [D] (see CRAZY table below): each of the
 *   10 trits of the result is looked up from the corresponding trit of
 *   [D] (row) and A (column). It's the only way to write an arbitrary
 *   value into memory, which is what makes Malbolge programming the
 *   multi-step ordeal it's known for.
 *
 * === FEATURES / STACK_PANELS ===
 *   Two static fields, read by the shared IDE template the same way they
 *   are for the other engines (falling back to the v1-v6 defaults when a
 *   class doesn't define them):
 *     `FEATURES`     — declares 'input' (enables terminal-style input) and
 *                      'memory', but not 'pixels' or 'stack', so the IDE
 *                      hides the Pixel/Dual views for this engine.
 *     `STACK_PANELS` — a "Registers" list panel (A, C, and D, each shown
 *                      labeled — "a: 123" — for quick at-a-glance state)
 *                      and a "Memory" sparse panel
 *                      showing only cells the program has actually
 *                      touched at runtime — not the full 59049-word
 *                      address space, almost all of which is
 *                      deterministic filler nobody debugging a program
 *                      needs to see.
 *
 * === EDITOR HIGHLIGHTING ===
 *   The shared IDE expects `this.ip = {x, y}` in editor row/column space
 *   to highlight the active source cell, the same shape the 2D vN engines
 *   and vbrainfrick use. Malbolge's `C` register is a 1D address into a
 *   59049-word space, most of which was never part of the visible source,
 *   so this engine keeps a `_addrToRowCol` map built at load time from
 *   each loaded character's original editor position. Once `C` walks
 *   outside the loaded source region — extremely common in Malbolge, since
 *   almost every real program jumps into its own filler/data area — there
 *   is no source cell to highlight and `ip` becomes `{x:-1, y:-1}`, which
 *   the shared highlighter already treats as "nothing to highlight".
 *   `this.dir` stays fixed, as it does for vbrainfrick: Malbolge's code
 *   pointer has no directionality to display.
 *
 * === INPUT / OUTPUT ===
 *   `/` reads from `this.stdin` (a plain string set on the instance before
 *   run()/step(), same convention as vbrainfrick): '\n' is code 10, and
 *   once `this.stdin` is exhausted every further `/` yields 59048 — the
 *   spec's defined EOF value — rather than looping forever on a sentinel
 *   from ordinary text (59048 cannot arise from a single input character).
 *   `<` appends `String.fromCharCode(A % 256)` to `this.output`.
 *
 * The program ends on `v` (halt), when `C` lands on a cell outside 33-126
 * (a runtime error — the reference interpreter is documented to hang here,
 * but that's a bug in it, not the spec, so this engine reports it as an
 * error instead), or when the step limit is hit.
 */

// Substitution table applied to the cell at [C] after each instruction,
// when that cell's value is in 33-126. Index is (value - 33), exactly as
// the spec states it ("33 is subtracted from the instruction at C, and
// the result is used as an index in the table below") — confirmed against
// Ben Olmstead's original reference interpreter and a Node.js port of it.
const CIPHER = "5z]&gqtyfr$(we4{WP)H-Zn,[%\\3dL+Q;>U!pJS72FhOA1CB6v^=I_0/8|jsb9m<.TVac`uY*MK'X~xDl}REokN:#?G\"i@";

// (C + [C]) % 94 -> instruction letter, matching the reference interpreter's
// in/out assignment (the original written spec has these two swapped; the
// reference implementation — and every practical Malbolge program — uses
// this mapping instead).
const OPCODES = {
  4: 'i',   // C = [D]
  5: '<',   // print A % 256
  23: '/',  // A = input
  39: '*',  // [D] = A = rotate_right([D])
  40: 'j',  // D = [D]
  62: 'p',  // [D] = A = crazy(A, [D])
  68: 'o',  // nop
  81: 'v',  // halt
};

// Tritwise "crazy" operation lookup: CRAZY[dTrit][aTrit] -> result trit.
const CRAZY_TABLE = [
  [1, 0, 0],
  [1, 0, 2],
  [2, 2, 1],
];

const MEM_SIZE = 59049; // 3^10
const TRIT_PLACE_9 = 19683; // 3^9 — the highest trit's place value, used by rotate

class BefungeLogicInterpreter {
  // Capability flags read by the shared IDE template (see FEATURES /
  // STACK_PANELS note above). Not read by this engine itself.
  static FEATURES = ['memory', 'input', 'text'];

  // "Registers" is a small fixed-length list (A, C, D) for at-a-glance
  // state, each entry labeled ("a: 123") rather than a bare number, since
  // this isn't really a data stack and unlabeled numbers wouldn't say
  // which register is which; "Memory" is sparse, keyed by address, showing
  // only cells the program has touched — not the full 59049-word space,
  // which is mostly deterministic filler. No 'stack' panel: Malbolge has
  // no data stack.
  static STACK_PANELS = [
    { id: 'registers', label: 'Registers', ariaLabel: 'Registers', searchLabel: 'registers', source: 'stack', type: 'list' },
    { id: 'memory', label: 'Memory', ariaLabel: 'Memory', searchLabel: 'memory', source: 'memory', type: 'sparse', pointerSource: 'memoryPointer' },
  ];

  constructor(code, pixelWidth = 64, pixelHeight = 64, maxSteps = 1000000) {
    this.sourceCode = code;
    this.grid = this._parseGrid(code); // for editor highlighting only — not the VM's memory
    this.ip = { x: 0, y: 0 };
    this.dir = { x: 1, y: 0 }; // Malbolge's C register has no direction; kept for UI compatibility

    this.pixels = [];          // unused — Malbolge has no pixel output
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.stdin = '';           // input buffer for '/' — filled by provideInput() (or set directly before running)
    this._stdinPos = 0;
    this.interactive = false;  // true = pause for terminal input instead of returning EOF
    this._stdinClosed = false; // set by provideEOF() (Ctrl+D in the terminal)
    this.awaitingInput = null; // { kind: 'char' } while paused waiting for the user to type
    this.output = '';
    this.running = false;
    this.steps = 0;
    this.maxSteps = maxSteps;
    this.error = null;

    // VM registers.
    this.a = 0;
    this.c = 0;
    this.d = 0;

    // Full 59049-word backing memory the VM actually executes against —
    // distinct from `this.grid`, which only exists for source highlighting.
    this._mem = null;

    this._addrToRowCol = null; // built by _load(): address -> {x,y} in the editor, for loaded-source addresses only
    this._load(code);

    // Sparse view of memory exposed to the shared Stacks/Memory panel: only
    // addresses the program has read or written at runtime, so the panel
    // doesn't have to render ~59000 mostly-uninteresting filler cells.
    // Updated incrementally at each touch point in _step() (cheap, O(1))
    // rather than rebuilt from scratch every step, so per-step syncing
    // stays cheap even during a million-step Turbo run.
    this.memory = {};
    this.memoryPointer = this.d;
    this._syncRegisters();
  }

  // ── SOURCE GRID (for editor highlighting only) ─────────────────────

  _parseGrid(code) {
    const lines = code.split('\n');
    return lines.map(l => l.split(''));
  }

  // ── CRAZY OPERATION / ROTATE ────────────────────────────────────────

  _crazy(a, d) {
    let result = 0;
    let mult = 1;
    let aa = a, dd = d;
    for (let i = 0; i < 10; i++) {
      const aTrit = aa % 3; aa = (aa - aTrit) / 3;
      const dTrit = dd % 3; dd = (dd - dTrit) / 3;
      result += CRAZY_TABLE[dTrit][aTrit] * mult;
      mult *= 3;
    }
    return result;
  }

  _rotateRight(v) {
    const lowTrit = v % 3;
    const rest = (v - lowTrit) / 3;
    return rest + lowTrit * TRIT_PLACE_9;
  }

  // ── ENCIPHER ────────────────────────────────────────────────────────

  _encipher(v) {
    // v assumed already known to be in 33..126 by the caller.
    return CIPHER.charCodeAt(v - 33);
  }

  // ── LOADING / VALIDATION ────────────────────────────────────────────
  // Fills `this._mem` from the source, validating each non-whitespace
  // character decodes to one of the 8 legal instructions at its own
  // address (Malbolge's defining, deliberately hostile trait: the same
  // character means something different depending on where it sits). Also
  // records, per loaded address, the {x,y} editor position it came from,
  // so the running VM can still highlight source cells by address later.
  _load(code) {
    this._mem = new Array(MEM_SIZE).fill(0);
    this._addrToRowCol = new Map();

    let addr = 0;
    const lines = code.split('\n');
    for (let y = 0; y < lines.length; y++) {
      const line = lines[y];
      for (let x = 0; x < line.length; x++) {
        const ch = line[x];
        if (/\s/.test(ch)) continue; // whitespace never occupies a memory word
        const value = ch.charCodeAt(0);
        if (value < 33 || value > 126) {
          throw new Error(`Invalid source character ${JSON.stringify(ch)} at line ${y + 1}, column ${x + 1} — Malbolge source must be whitespace or printable ASCII 33-126`);
        }
        const opcode = (addr + value) % 94;
        if (!OPCODES[opcode]) {
          throw new Error(`${JSON.stringify(ch)} at line ${y + 1}, column ${x + 1} (address ${addr}) is not a valid instruction there — (address + value) mod 94 = ${opcode}, which isn't one of Malbolge's 8 opcodes. The same character means different things at different addresses; try moving or swapping it`);
        }
        this._mem[addr] = value;
        this._addrToRowCol.set(addr, { x, y });
        addr++;
      }
    }

    this._progLen = addr;
    if (addr === 0) {
      throw new Error('Empty program — Malbolge needs at least one instruction');
    }

    // Fill the remainder of memory via the crazy operation on the previous
    // two words. (The spec leaves the 1-instruction-program edge case,
    // where word 1 would need a "word -1", undefined; this engine treats
    // the missing second-previous word as 0, which keeps a 1-instruction
    // program like a bare halt loadable instead of throwing.)
    for (let i = addr; i < MEM_SIZE; i++) {
      const prev = this._mem[i - 1];
      const prev2 = i >= 2 ? this._mem[i - 2] : 0;
      this._mem[i] = this._crazy(prev, prev2);
    }
  }

  // ── REGISTERS VIEW SYNC (for the shared Stacks panel) ──────────────

  _syncRegisters() {
    this.memoryPointer = this.d;
    // "Registers" panel: a small fixed, labeled list — easier to scan than
    // digging through the sparse memory dump for A/C/D, and labeled so it's
    // clear at a glance which value is which register (this list is
    // rendered verbatim, so plain strings here show up exactly as written).
    this.stack = [`a: ${this.a}`, `c: ${this.c}`, `d: ${this.d}`];
  }

  // ── I/O ─────────────────────────────────────────────────────────────

  _readInput() {
    if (this._stdinPos < this.stdin.length) {
      const ch = this.stdin.charCodeAt(this._stdinPos++);
      return ch === 13 ? 10 : ch; // normalize a stray CR the way a terminal would
    }
    if (this.interactive && !this._stdinClosed) {
      this.awaitingInput = { kind: 'char' };
      return null; // "no input yet": _step() holds position and retries after provideInput()
    }
    return 59048; // the spec's defined EOF value (2222222222 in ternary)
  }

  // Terminal input: whole line + newline goes in the buffer and is echoed
  // into the output; '/' consumes it one character at a time.
  provideInput(text) {
    this.stdin += String(text) + '\n';
    this.output += String(text) + '\n';
    this.awaitingInput = null;
  }

  // Ctrl+D in the terminal: further '/' reads yield 59048 (EOF).
  provideEOF() {
    this._stdinClosed = true;
    this.awaitingInput = null;
  }

  // ── EDITOR HIGHLIGHTING ─────────────────────────────────────────────

  _ipForAddress(addr) {
    const pos = this._addrToRowCol.get(addr);
    return pos ? { x: pos.x, y: pos.y } : { x: -1, y: -1 }; // outside loaded source — nothing to highlight
  }

  _formatError(message) {
    return `${message} (a=${this.a}, c=${this.c}, d=${this.d})`;
  }

  _fail(message) {
    this.error = this._formatError(message);
    this.running = false;
    return false;
  }

  // ── EXECUTION ───────────────────────────────────────────────────────
  // Returns true to keep running, false if this step ended the program
  // (halt or error) — same convention vbrainfrick's _step() uses, so the
  // shared IDE's single-step button works identically for both engines.
  _step() {
    const mem = this._mem;
    const instrValue = mem[this.c];
    if (instrValue < 33 || instrValue > 126) {
      return this._fail(`Invalid instruction ${instrValue} at address ${this.c} — outside printable ASCII (33-126)`);
    }

    const opcode = (this.c + instrValue) % 94;
    const op = OPCODES[opcode]; // undefined codes execute as nop, per spec

    switch (op) {
      case 'i': // jmp [D] -> C
        this.c = mem[this.d];
        this.memory[this.d] = mem[this.d];
        break;
      case '<': // out A
        this.output += String.fromCharCode(this.a % 256);
        break;
      case '/': { // in -> A
        const v = this._readInput();
        if (v === null) return true; // waiting for terminal input — hold position
        this.a = v;
        break;
      }
      case '*': { // rotr [D]; mov A, [D]
        const v = this._rotateRight(mem[this.d]);
        mem[this.d] = v;
        this.a = v;
        this.memory[this.d] = v;
        break;
      }
      case 'j': // mov D, [D]
        this.d = mem[this.d];
        this.memory[this.d] = mem[this.d];
        break;
      case 'p': { // crz [D], A; mov A, [D]
        const v = this._crazy(this.a, mem[this.d]);
        mem[this.d] = v;
        this.a = v;
        this.memory[this.d] = v;
        break;
      }
      case 'v': // halt
        this.running = false;
        this.ip = this._ipForAddress(this.c);
        this._syncRegisters();
        return true; // this step did run — the caller's steps++ should count it
      case 'o': // nop
      default:  // any other value: also a nop, per spec
        break;
    }

    if (!this.running) return true; // halted mid-switch (only 'v' does this, handled above)

    // Encipher whatever cell C now points at (post-jump, if a jump just
    // happened) — see the class doc comment for why this is what makes a
    // jump's *target* get enciphered instead of the jump instruction.
    const cur = mem[this.c];
    if (cur >= 33 && cur <= 126) {
      mem[this.c] = this._encipher(cur);
      this.memory[this.c] = mem[this.c];
    }

    this.c = (this.c + 1) % MEM_SIZE;
    this.d = (this.d + 1) % MEM_SIZE;

    this.ip = this._ipForAddress(this.c);
    // Refresh the public Registers snapshot every step — not just at the
    // end of run() — so the shared IDE's Step button and animated Run
    // (both of which call _step() directly) show live-updating panels
    // instead of the frozen load-time state. Cheap (3-element array), so
    // no cost even across a million-step Turbo run; `this.memory` itself
    // is already kept live above, incrementally, with no rebuild needed.
    this._syncRegisters();
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
    if (this.running && this.steps >= this.maxSteps) {
      this.error = this._formatError(`Step limit (${this.maxSteps}) reached — possible infinite loop`);
      this.running = false;
    }
    this._syncRegisters();
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