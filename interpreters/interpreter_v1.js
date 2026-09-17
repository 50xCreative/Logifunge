/**
 * Befunge-style Logic Gate Interpreter
 *
 * The grid is a 2D program. An instruction pointer (IP) moves through it.
 * Values on the stack are 0 or 1 (single bits) — all operations are bitwise logic gates.
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
 *   @   XOR gate (@ symbol)
 *   N   NAND gate
 *   R   NOR gate
 *   X   XNOR gate
 *
 * === STACK ===
 *   0-9 Push digit
 *   [n] Push multi-bit number (e.g. [42])
 *   :   Duplicate top
 *   \   Swap top two
 *   $   Pop and discard
 *   +   Add
 *   -   Subtract
 *   *   Multiply
 *   /   Divide (integer)
 *
 * === OUTPUT ===
 *   .   Output top of stack as number, add to text output
 *   ,   Push pixel: pop x, y, val (0 or 1) — writes pixel at (x, y)
 *   '   Pull pixel: pop x, y — pushes pixel value at (x, y) onto stack
 *   "   Toggle string mode: push ASCII values of each char until next "
 *
 * === CONTROL ===
 *   _        Pop; if 0 go right, if nonzero go left (horizontal if)
 *   !        Pop; if 0 go down, if nonzero go up (vertical conditional)
 *   g        Pop y, pop x; push grid value at (x,y)
 *   p        Pop y, pop x, pop v; store v at (x,y)
 *   %        End program
 *
 * === SUBROUTINES ===
 *   :[name]  Define subroutine. IP auto-skips over the body during normal flow.
 *            Body ends with r (return).
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
  // Capability flags read by the shared IDE template (features.js /
  // _run-template.js) to decide things like whether to show a stdin
  // field ('input') or the Pixel/Dual output views ('pixels'). Not read
  // by this engine itself.
  static FEATURES = ['movement', 'logic-gates', 'stack', 'pixels', 'subroutines', 'loops', 'text'];

  // Which panels the shared IDE's Stacks view renders, and where each one
  // reads its data from on the interpreter instance. This is the default
  // shape (Data Stack + sparse Memory) every vN engine has always shown;
  // an engine with a different shape (see interpreter_vbrainfrick.js) can
  // override this to change what the Stacks view displays for it.
  static STACK_PANELS = [
    { id: 'stack', label: 'Data Stack', ariaLabel: 'Data stack', searchLabel: 'stack', source: 'stack', type: 'list' },
    { id: 'memory', label: 'Memory', ariaLabel: 'Memory', searchLabel: 'memory', source: 'memory', type: 'sparse', pointerSource: 'memoryPointer' },
  ];

  constructor(code, pixelWidth = 64, pixelHeight = 64) {
    this.grid = this._parseGrid(code);
    this.ip = { x: 0, y: 0 };
    this.dir = { x: 1, y: 0 }; // start going right
    this.stack = [];
    this.returnStack = [];   // {x, y, dir} return addresses for subroutine calls
    this.output = [];        // text output tokens
    this.pixels = [];        // {x, y, on} pixel output events (for rendering)
    this.pixelMap = {};      // key: "x,y" => 0 or 1 (live pixel state)
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.stringMode = false;
    this.running = false;
    this.steps = 0;
    this.maxSteps = 1000000;
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

  // Skip forward past a subroutine body (from after :[name] to after the matching r)
  _skipSubroutine(x, y) {
    // Walk right from x,y until we find a bare 'r' (not inside a label)
    // We do a linear scan of the grid row by row from the current position
    let cx = x, cy = y;
    const rows = this.grid.length;
    while (cy < rows) {
      const row = this.grid[cy] || [];
      while (cx < row.length) {
        const ch = row[cx];
        // Skip over nested label tokens
        if ((ch === ':' || ch === ';' || ch === '{' || ch === '}') && row[cx + 1] === '[') {
          let tx = cx + 2;
          while (tx < row.length && row[tx] !== ']') tx++;
          cx = tx + 1;
          continue;
        }
        if (ch === '[') {
          let tx = cx + 1;
          while (tx < row.length && row[tx] !== ']') tx++;
          cx = tx + 1;
          continue;
        }
        if (ch === 'r') {
          // Found the return — resume after it
          return { x: cx + 1, y: cy };
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
      case '.': { this.output.push(String(this._pop())); break; }
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
    // Wrap around
    const rows = this.grid.length || 1;
    const cols = Math.max(...this.grid.map(r => r.length), 1);
    if (this.ip.y < 0) this.ip.y = rows - 1;
    if (this.ip.y >= rows) this.ip.y = 0;
    if (this.ip.x < 0) this.ip.x = cols - 1;
    if (this.ip.x >= cols) this.ip.x = 0;
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
      textOutput: this.output.join(' '),
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
