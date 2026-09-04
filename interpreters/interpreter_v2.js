/**
 * Befunge-style Logic Gate Interpreter
 *
 * The grid is a 2D program. An instruction pointer (IP) moves through it.
 * Values on the stack are 0 or 1 (single bits) — all operations are bitwise logic gates.
 *
 * NOTE ON BEFUNGE DIFFERENCES
 *   This is NOT standard Befunge-93. Key departures:
 *   - @ is repurposed as the XOR gate (not end-of-program).
 *   - % is the end-of-program instruction (not modulo — use arithmetic as needed).
 *   - : is overloaded: as a bare instruction it duplicates the top of stack;
 *     when immediately followed by '[' it begins a subroutine definition :[name].
 *     The interpreter disambiguates by peeking at the next character.
 *
 * === MOVEMENT ===
 *   >   Move right (default)
 *   <   Move left
 *   ^   Move up
 *   v   Move down
 *   ?   Move in a random direction
 *   #   Trampoline: skip next cell
 *
 * === LOGIC GATES (pop a, b; push result) ===
 *   &   AND gate
 *   |   OR gate
 *   ~   NOT gate (pop a; push ~a & 1)
 *   @   XOR gate  (NOTE: not end-of-program as in standard Befunge)
 *   N   NAND gate
 *   R   NOR gate
 *   X   XNOR gate
 *
 * === STACK ===
 *   0-9 Push digit
 *   [n] Push multi-bit number (e.g. [42])
 *   :   Duplicate top of stack  (when NOT followed by '[' — see SUBROUTINES)
 *   \   Swap top two
 *   $   Pop and discard
 *   +   Add
 *   -   Subtract
 *   *   Multiply
 *   /   Divide (integer)
 *
 * === OUTPUT ===
 *   .   Output top of stack as a decimal number
 *   =   Output top of stack as an ASCII character (e.g. 65 → 'A')
 *   ,   Push pixel: pop x, y, val (0 or 1) — writes pixel at (x, y)
 *   '   Pull pixel: pop x, y — pushes pixel value at (x, y) onto stack
 *   "   Toggle string mode: push ASCII values of each char until next "
 *
 * === CONTROL ===
 *   _        Pop; if 0 go right, if nonzero go left (horizontal if)
 *   !        Pop; if 0 go down, if nonzero go up (vertical conditional)
 *   g        Pop y, pop x; push grid value at (x,y)
 *   p        Pop y, pop x, pop v; store v at (x,y)
 *   %        End program  (NOTE: not modulo as in standard Befunge)
 *
 * === SUBROUTINES ===
 *   :[name]  Define subroutine. IP auto-skips over the body during normal flow.
 *            Body ends with r (return). Nested subroutine definitions are supported.
 *   ;[name]  Call subroutine. Pushes return address onto return stack, jumps to :[name].
 *   r        Return. Pops return address from return stack and resumes.
 *
 * === LOOPS ===
 *   {[name]  Mark top of loop.
 *   }[name]  Pop value; if nonzero jump back to {[name], else continue.
 *
 * Label names can contain any characters except ] (e.g. :[count neighbours])
 */

class BefungeLogicInterpreter {
  constructor(code, pixelWidth = 64, pixelHeight = 64, maxSteps = 1000000) {
    this.grid = this._parseGrid(code);
    this.ip = { x: 0, y: 0 };
    this.dir = { x: 1, y: 0 }; // start going right
    this.stack = [];
    this.returnStack = [];   // {x, y, dir} return addresses for subroutine calls
    this.output = '';        // accumulated text output
    this.pixels = [];        // {x, y, on} pixel output events (for rendering)
    this.pixelMap = {};      // key: "x,y" => 0 or 1 (live pixel state)
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.stringMode = false;
    this.running = false;
    this.steps = 0;
    this.maxSteps = maxSteps;
    this.error = null;

    // Pre-scan for subroutine and loop label positions
    this.labels = {};   // name -> {x, y} of char after :[name]
    this.loops  = {};   // name -> {x, y} of char after {[name]
    this._scanLabels();
  }

  // Scan the entire grid once for :[name] and {[name] markers
  _scanLabels() {
    for (let y = 0; y < this.grid.length; y++) {
      const row = this.grid[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if ((ch === ':' || ch === '{') && row[x + 1] === '[') {
          const kind = ch;
          let name = '';
          let tx = x + 2;
          while (tx < row.length && row[tx] !== ']') {
            name += row[tx++];
          }
          if (row[tx] === ']') {
            const after = this._nextPosition(x, y, tx);
            if (kind === ':') {
              this.labels[name] = { x: after.x, y: after.y };
            } else {
              this.loops[name] = { x: after.x, y: after.y };
            }
          }
        }
      }
    }
  }

  // Given a position, scan forward (right then down) to find a token like :[name], {[name], ;[name], }[name], [n]
  // Returns { kind, name/val, endX, endY } or null
  _scanToken(x, y) {
    const ch = this._getCell(x, y);
    if (ch === '[') {
      // [n] number literal
      let val = '';
      let tx = x + 1;
      let c = this._getCell(tx, y);
      while (c !== ']' && c !== ' ' && val.length < 20) { val += c; tx++; c = this._getCell(tx, y); }
      if (c === ']') return { kind: 'num', val: parseInt(val, 10), endX: tx, endY: y };
    }
    if ((ch === ':' || ch === ';' || ch === '{' || ch === '}') && this._getCell(x + 1, y) === '[') {
      let name = '';
      let tx = x + 2;
      let c = this._getCell(tx, y);
      while (c !== ']' && name.length < 64) { name += c; tx++; c = this._getCell(tx, y); }
      if (c === ']') return { kind: ch, name, endX: tx, endY: y };
    }
    return null;
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

  _setCell(x, y, v) {
    while (this.grid.length <= y) this.grid.push([]);
    const row = this.grid[y];
    while (row.length <= x) row.push(' ');
    row[x] = v;
  }

  _nextPosition(x, y, endX) {
    const row = this.grid[y];
    if (row && endX + 1 < row.length) return { x: endX + 1, y };
    return { x: 0, y: y + 1 };
  }

  _push(v) { this.stack.push(v); }
  _pop() { return this.stack.length ? this.stack.pop() : 0; }
  _peek() { return this.stack.length ? this.stack[this.stack.length - 1] : 0; }

  _formatError(message, cell = null, x = this.ip.x, y = this.ip.y) {
    const stackPreview = this.stack.length ? this.stack.slice(-8).join(', ') : 'empty';
    const instruction = cell === null ? this._getCell(x, y) : cell;
    return `${message} (instruction=${JSON.stringify(instruction)}, position=(${x},${y}), stack=[${stackPreview}])`;
  }

  _fail(message, cell = null, x = this.ip.x, y = this.ip.y) {
    this.error = this._formatError(message, cell, x, y);
    this.running = false;
    return false;
  }

  // Skip forward past a subroutine body (from after :[name] to after the matching r).
  // Tracks nesting depth so that nested subroutine definitions (which each end with
  // their own r) don't prematurely terminate the outer skip.
  _skipSubroutine(x, y) {
    let cx = x, cy = y;
    const rows = this.grid.length;
    let depth = 0; // each nested :[...] increments depth; matching r decrements
    while (cy < rows) {
      const row = this.grid[cy] || [];
      while (cx < row.length) {
        const ch = row[cx];
        // Detect :[name] — nested subroutine definition, push depth
        if (ch === ':' && row[cx + 1] === '[') {
          depth++;
          let tx = cx + 2;
          while (tx < row.length && row[tx] !== ']') tx++;
          cx = tx + 1;
          continue;
        }
        // Skip over other label-style tokens (;[...], {[...], }[...]) without changing depth
        if ((ch === ';' || ch === '{' || ch === '}') && row[cx + 1] === '[') {
          let tx = cx + 2;
          while (tx < row.length && row[tx] !== ']') tx++;
          cx = tx + 1;
          continue;
        }
        // Skip over [n] number literals
        if (ch === '[') {
          let tx = cx + 1;
          while (tx < row.length && row[tx] !== ']') tx++;
          cx = tx + 1;
          continue;
        }
        if (ch === 'r') {
          if (depth === 0) {
            // Found the matching return for the outermost subroutine — resume after it
            return { x: cx + 1, y: cy };
          }
          // 'r' closes a nested subroutine definition
          depth--;
        }
        cx++;
      }
      cy++;
      cx = 0;
    }
    return null; // no matching r found
  }

  _step() {
    const x = this.ip.x, y = this.ip.y;
    const cell = this._getCell(x, y);

    if (this.stringMode) {
      if (cell === '"') {
        this.stringMode = false;
      } else {
        this._push(cell.charCodeAt(0));
      }
      this._advance();
      return true;
    }

    // Check for token-prefix characters
    if ((cell === ':' || cell === ';' || cell === '{' || cell === '}') && this._getCell(x + 1, y) === '[') {
      const tok = this._scanToken(x, y);
      if (tok) {
        const after = this._nextPosition(x, y, tok.endX);

        if (tok.kind === ':') {
          // Subroutine definition — skip body
          const resume = this._skipSubroutine(after.x, after.y);
          if (!resume) return this._fail(`Subroutine :[${tok.name}] has no matching r`, cell, x, y);
          this.ip.x = resume.x;
          this.ip.y = resume.y;
          return true;
        }

        if (tok.kind === ';') {
          // Subroutine call
          const target = this.labels[tok.name];
          if (!target) return this._fail(`Unknown subroutine: [${tok.name}]`, cell, x, y);
          // Push return address (position after ;[name])
          this.returnStack.push({ x: after.x, y: after.y, dir: { ...this.dir } });
          this.ip.x = target.x;
          this.ip.y = target.y;
          return true;
        }

        if (tok.kind === '{') {
          // Loop top marker — just advance past it, position already recorded in this.loops
          this.ip.x = after.x;
          this.ip.y = after.y;
          return true;
        }

        if (tok.kind === '}') {
          // Loop bottom — pop condition
          const cond = this._pop();
          if (cond !== 0) {
            // Jump back to loop top
            const target = this.loops[tok.name];
            if (!target) return this._fail(`Unknown loop: [${tok.name}]`, cell, x, y);
            this.ip.x = target.x;
            this.ip.y = target.y;
          } else {
            this.ip.x = after.x;
            this.ip.y = after.y;
          }
          return true;
        }
      }
    }

    // [n] number literal
    if (cell === '[') {
      const tok = this._scanToken(x, y);
      if (tok && tok.kind === 'num') {
        if (!isNaN(tok.val)) this._push(tok.val);
        const after = this._nextPosition(x, y, tok.endX);
        this.ip.x = after.x;
        this.ip.y = after.y;
        return true;
      }
    }

    switch (cell) {
      // Direction
      case '>': this.dir = { x: 1, y: 0 }; break;
      case '<': this.dir = { x: -1, y: 0 }; break;
      case '^': this.dir = { x: 0, y: -1 }; break;
      case 'v': this.dir = { x: 0, y: 1 }; break;
      case '?': {
        const dirs = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
        this.dir = dirs[Math.floor(Math.random() * 4)];
        break;
      }
      case '#': { this._advance(); break; } // Trampoline

      // Logic Gates
      case '&': { const b = this._pop(), a = this._pop(); this._push(a & b); break; }
      case '|': { const b = this._pop(), a = this._pop(); this._push(a | b); break; }
      case '~': { const a = this._pop(); this._push((~a) & 1); break; }
      case '@': { const b = this._pop(), a = this._pop(); this._push(a ^ b); break; }
      case '%': { this.running = false; return false; }
      case 'N': { const b = this._pop(), a = this._pop(); this._push(~(a & b) & 1); break; }
      case 'R': { const b = this._pop(), a = this._pop(); this._push(~(a | b) & 1); break; }
      case 'X': { const b = this._pop(), a = this._pop(); this._push(~(a ^ b) & 1); break; }

      // Stack
      case '0': this._push(0); break;
      case '1': this._push(1); break;
      case '2': this._push(2); break;
      case '3': this._push(3); break;
      case '4': this._push(4); break;
      case '5': this._push(5); break;
      case '6': this._push(6); break;
      case '7': this._push(7); break;
      case '8': this._push(8); break;
      case '9': this._push(9); break;
      case ':': this._push(this._peek()); break;
      case '\\': { const b = this._pop(), a = this._pop(); this._push(b); this._push(a); break; }
      case '$': this._pop(); break;
      case '+': { const b = this._pop(), a = this._pop(); this._push(a + b); break; }
      case '-': { const b = this._pop(), a = this._pop(); this._push(a - b); break; }
      case '*': { const b = this._pop(), a = this._pop(); this._push(a * b); break; }
      case '/': { const b = this._pop(), a = this._pop(); this._push(b !== 0 ? Math.floor(a / b) : 0); break; }

      // Output
      case '.': { this.output += String(this._pop()) + ' '; break; }
      case '=': { this.output += String.fromCharCode(this._pop()); break; }
      case ',': {
        // push pixel: pop x, y, val (0 or 1); write pixel at (x, y)
        const val = this._pop();
        const py  = this._pop();
        const px  = this._pop();
        const on  = val !== 0;
        this.pixelMap[px + ',' + py] = on ? 1 : 0;
        const existing = this.pixels.findIndex(p => p.x === px && p.y === py);
        const entry = { x: px, y: py, on, value: on ? 1 : 0 };
        if (existing >= 0) this.pixels[existing] = entry;
        else this.pixels.push(entry);
        break;
      }
      case "'": {
        // pull pixel: pop x, y; push pixel value (0 or 1) onto stack
        const py = this._pop();
        const px = this._pop();
        const v  = this.pixelMap[px + ',' + py] || 0;
        this._push(v);
        break;
      }
      case '"': { this.stringMode = true; break; }

      // Control flow
      case '_': { const a = this._pop(); this.dir = a === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 }; break; }
      case '!': { const a = this._pop(); this.dir = a === 0 ? { x: 0, y: 1 } : { x: 0, y: -1 }; break; }

      // Return from subroutine
      case 'r': {
        if (this.returnStack.length === 0) return this._fail('r executed with empty return stack', cell, x, y);
        const ret = this.returnStack.pop();
        this.ip.x = ret.x;
        this.ip.y = ret.y;
        this.dir  = ret.dir;
        return true;
      }

      // Self-modify
      case 'g': { const gy = this._pop(), gx = this._pop(); this._push(this._getCell(gx, gy).charCodeAt(0)); break; }
      case 'p': { const py = this._pop(), px = this._pop(), v = this._pop(); this._setCell(px, py, String.fromCharCode(v)); break; }

      case ' ': break;
      default: break;
    }

    this._advance();
    return true;
  }

  _advance() {
    this.ip.x += this.dir.x;
    this.ip.y += this.dir.y;
    // Wrap Y around the number of rows
    const rows = this.grid.length || 1;
    if (this.ip.y < 0) this.ip.y = rows - 1;
    if (this.ip.y >= rows) this.ip.y = 0;
    // Wrap X within the current row's actual width (per-row, not global max)
    const rowLen = (this.grid[this.ip.y] || []).length || 1;
    if (this.ip.x < 0) this.ip.x = rowLen - 1;
    if (this.ip.x >= rowLen) this.ip.x = 0;
  }

  run() {
    this.running = true;
    this.steps = 0;
    while (this.running && this.steps < this.maxSteps) {
      try {
        if (!this._step()) break;
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
      textOutput: this.output.trimEnd(),
      pixels: this.pixels,
      steps: this.steps,
      error: this.error,
      stack: [...this.stack],
    };
  }
}

// Export for browser use
if (typeof module !== 'undefined') {
  module.exports = BefungeLogicInterpreter;
}
