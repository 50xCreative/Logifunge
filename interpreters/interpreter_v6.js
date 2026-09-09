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
 *   - : is always a bare duplicate instruction — it is never overloaded with
 *     subroutine definitions. Subroutines use their own dedicated, unambiguous
 *     markers: D[name] for definition and C[name] for call (see SUBROUTINES).
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
 *   :   Duplicate top of stack
 *   \   Swap top two
 *   $   Pop and discard
 *   W   Swap the values at two stack indexes (0 = top, 1 = next, ...)
 *   +   Add
 *   -   Subtract
 *   *   Multiply
 *   /   Divide (integer)
 *   l   Push the stack's current length (measured before this push)
 *   U   Reverse the entire stack in place
 *
 * === MEMORY ===
 *   M   Set the active memory pointer to the popped index
 *   S   Store the top stack value at the active memory pointer
 *   L   Load the value at the active memory pointer onto the stack
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
 *   D[name]  Define subroutine. IP auto-skips over the body during normal flow.
 *            Body ends with r (return). Nested subroutine definitions are supported.
 *   C[name]  Call subroutine. Pushes return address onto return stack, jumps to D[name].
 *   r        Return. Pops return address from return stack and resumes.
 *
 * === LOOPS ===
 *   {[name]  Mark top of loop.
 *   }[name]  Pop value; if nonzero jump back to {[name], else continue.
 *
 * === FOR LOOPS ===
 *   ([name]  For-loop start. Pops a count N off the stack and runs the
 *            body N times. If N <= 0 the body is skipped entirely.
 *   )[name]  For-loop end. Does NOT pop anything (unlike }[name]) — the
 *            interpreter tracks the remaining iteration count internally.
 *            Jumps back to ([name] until N iterations have run, then
 *            continues past )[name].
 *   G        Push the current for-loop's iteration index (0-based: 0 on
 *            the first pass, N-1 on the last). Errors if used outside
 *            an active for loop. With nested for loops, refers to the
 *            innermost one.
 *
 * === EXPONENTS ===
 *   P   Pow: pop exponent b, pop base a; push a ** b (floored if fractional)
 *   Q   Nth root: pop root index n, pop value a; push floor(a ** (1/n))
 *
 * === ELBOW REDIRECT ===
 *   E   Pop a value. If nonzero, keep going straight. If 0, turn 90°
 *       clockwise: Right->Down, Down->Left, Left->Up, Up->Right.
 *
 * Label names can contain any characters except ] (e.g. D[count neighbours])
 *
 * D[name], C[name], {[name], }[name], ([name] and )[name] may each be
 * written either horizontally (the marker char immediately followed by [
 * to its right, e.g. D[name]) or vertically (the marker char immediately
 * followed by [ directly below it, with the name and closing ] continuing
 * downward, one character per row). Whichever orientation is used, the
 * token is parsed as a whole and the IP resumes immediately after the
 * closing ] in that same direction.
 */

class BefungeLogicInterpreter {
  constructor(code, pixelWidth = 64, pixelHeight = 64, maxSteps = 1000000) {
    this.sourceCode = code;
    this.grid = this._parseGrid(code);
    this.ip = { x: 0, y: 0 };
    this.dir = { x: 1, y: 0 }; // start going right
    this.stack = [];
    this.returnStack = [];   // {x, y, dir} return addresses for subroutine calls
    this.memory = {};        // sparse memory store keyed by numeric index
    this.memoryPointer = 0;  // active memory index for S/L
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
    this.forStarts = {}; // name -> {x, y} of char after ([name]
    this.forEnds   = {}; // name -> {x, y} of char after )[name]
    this.forStack  = []; // runtime stack of active for-loop frames: {name, count, executed, start}
    this._scanLabels();
  }

  // Scan the entire grid once for D[name] and {[name] markers. Each marker
  // may be written horizontally (D immediately followed by [ to its right)
  // or vertically (D immediately followed by [ directly below it, with the
  // name and closing ] continuing in that same direction) — see _labelDir.
  _scanLabels() {
    for (let y = 0; y < this.grid.length; y++) {
      const row = this.grid[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch !== 'D' && ch !== '{' && ch !== '(' && ch !== ')') continue;
        const dir = this._labelDir(x, y);
        if (!dir) continue;
        let name = '';
        let tx = x + 2 * dir.dx, ty = y + 2 * dir.dy;
        let c = this._getCell(tx, ty);
        while (c !== ']' && name.length < 64) {
          name += c;
          tx += dir.dx; ty += dir.dy;
          c = this._getCell(tx, ty);
        }
        if (c === ']') {
          const after = this._nextPosition(x, y, tx, ty, dir.dx, dir.dy);
          if (ch === 'D') {
            this.labels[name] = after;
          } else if (ch === '{') {
            this.loops[name] = after;
          } else if (ch === '(') {
            this.forStarts[name] = after;
          } else {
            this.forEnds[name] = after;
          }
        }
      }
    }
  }

  // Returns the direction {dx, dy} in which the [ opening bracket for a
  // D/C/{/} marker at (x,y) is found — either immediately to the right
  // ({dx:1, dy:0}) or immediately below ({dx:0, dy:1}) — or null if the
  // cell isn't a marker char or has no adjacent [ in either direction.
  _labelDir(x, y) {
    const ch = this._getCell(x, y);
    if (ch !== 'D' && ch !== 'C' && ch !== '{' && ch !== '}' && ch !== '(' && ch !== ')') return null;
    if (this._getCell(x + 1, y) === '[') return { dx: 1, dy: 0 };
    if (this._getCell(x, y + 1) === '[') return { dx: 0, dy: 1 };
    return null;
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
    const dir = this._labelDir(x, y);
    if (dir) {
      let name = '';
      let tx = x + 2 * dir.dx, ty = y + 2 * dir.dy;
      let c = this._getCell(tx, ty);
      while (c !== ']' && name.length < 64) { name += c; tx += dir.dx; ty += dir.dy; c = this._getCell(tx, ty); }
      if (c === ']') return { kind: ch, name, endX: tx, endY: ty, dx: dir.dx, dy: dir.dy };
    }
    return null;
  }

  // Scans from (x,y) stepping by (dx,dy) — exactly one of which is nonzero,
  // matching the engine's four cardinal directions — collecting characters
  // until `terminator` (the bracket char being searched for) is found.
  // The value is built from digits in the order actually traversed, so
  // direction and entry point both affect the result, by design.
  _scanNumberInDirection(x, y, dx, dy, terminator) {
    let val = '';
    let tx = x + dx, ty = y + dy;
    let steps = 0;
    while (steps < 20) {
      const c = this._getCell(tx, ty);
      if (c === terminator) return { val: parseInt(val, 10), endX: tx, endY: ty };
      if (c === ' ') return null;
      val += c;
      tx += dx; ty += dy;
      steps++;
    }
    return null;
  }

  // Wraps an arbitrary {x, y} position using the same rule _advance() uses:
  // y wraps across the number of rows, x wraps within the playfield width.
  //
  // The playfield is rectangular: its width is the length of the LONGEST
  // line in the source, not the length of whichever line the IP happens to
  // be on. Lines are conceptually right-padded with spaces out to that
  // width (this is standard Befunge behavior, and _getCell already returns
  // ' ' for any column past the end of a short row). Using each row's own
  // trimmed length here instead would make blank/short lines wrap early,
  // silently shifting the IP's x-coordinate whenever it crosses a line
  // that has no trailing spaces typed on it.
  _wrapXY(pos) {
    const rows = this.grid.length || 1;
    let y = pos.y;
    if (y < 0) y = rows - 1;
    if (y >= rows) y = 0;
    const width = this._gridWidth();
    let x = pos.x;
    if (x < 0) x = width - 1;
    if (x >= width) x = 0;
    return { x, y };
  }

  // Width of the playfield: the length of the longest row in the grid.
  _gridWidth() {
    let width = 1;
    for (const row of this.grid) {
      if (row.length > width) width = row.length;
    }
    return width;
  }

  // Wraps this.ip in place.
  _wrapPosition() {
    const wrapped = this._wrapXY(this.ip);
    this.ip.x = wrapped.x;
    this.ip.y = wrapped.y;
  }

  _parseGrid(code) {
    const lines = code.split('\n');
    return lines.map(l => l.split(''));
  }

  _isLabelToken(x, y) {
    return this._labelDir(x, y) !== null;
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

  // Position immediately after a token that ran from (x,y) to (endX,endY)
  // in direction (dx,dy). For horizontal tokens (dy===0, the default) this
  // keeps the original behavior: stay on the same row if possible, else
  // wrap to the start of the next one. For vertical tokens, simply continue
  // one more step in that direction (wrapped).
  _nextPosition(x, y, endX, endY = y, dx = 1, dy = 0) {
    if (dy === 0) {
      const row = this.grid[y];
      if (row && endX + dx < row.length && endX + dx >= 0) return { x: endX + dx, y };
      return { x: 0, y: y + 1 };
    }
    return this._wrapXY({ x: endX, y: endY + dy });
  }

  // Integer nth root, floored toward zero on the magnitude (e.g. root(10,3) = 2).
  // Starts from a floating-point estimate then nudges it to the exact
  // integer floor, since Math.pow(a, 1/n) can be off by one near perfect powers.
  _integerNthRoot(a, n) {
    if (a === 0) return 0;
    if (a < 0) return -this._integerNthRoot(-a, n); // n is guaranteed odd here (caller checks)
    let guess = Math.round(Math.pow(a, 1 / n));
    if (guess < 0) guess = 0;
    while (Math.pow(guess + 1, n) <= a) guess++;
    while (guess > 0 && Math.pow(guess, n) > a) guess--;
    return guess;
  }

  _integerLog(x, n) {
    x = BigInt(x);
    n = BigInt(n);

    if (n < 2n) throw new RangeError("base n must be >= 2");
    if (x < 1n) throw new RangeError("x must be >= 1");

    let count = 0;
    let value = 1n;

    while (value * n <= x) {
      value *= n;
      count++;
    }

    return count;
  }

  _push(v) { this.stack.push(v); }
  _pop() { return this.stack.length ? this.stack.pop() : 0; }
  _peek() { return this.stack.length ? this.stack[this.stack.length - 1] : 0; }

  _requireStackDepth(depth) {
    return this.stack.length >= depth;
  }

  _requireInteger(value, message) {
    if (!Number.isInteger(value)) return this._fail(message);
    return true;
  }

  // Used by the logic gates and arithmetic ops, which do raw JS operations
  // (a & b, a + b, etc.) and so would otherwise silently coerce a non-number
  // through ToPrimitive/NaN instead of failing loudly.
  _requireNumber(value, message) {
    if (typeof value !== 'number') return this._fail(message);
    return true;
  }

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
    let depth = 0; // each nested D[...] increments depth; matching r decrements
    while (cy < rows) {
      const row = this.grid[cy] || [];
      if (cx >= row.length) { cy++; cx = 0; continue; }
      const ch = row[cx];

      // Detect D[name] / C[name] / {[name] / }[name] / [n] tokens — these
      // may be written horizontally or vertically, so delegate to the same
      // _scanToken logic the main step loop uses, and jump straight past
      // whichever orientation was actually used.
      if (ch === 'D' || ch === 'C' || ch === '{' || ch === '}' || ch === '(' || ch === ')' || ch === '[') {
        const tok = this._scanToken(cx, cy);
        if (tok) {
          if (tok.kind === 'D') depth++; // nested subroutine definition
          const dx = tok.dx ?? 1, dy = tok.dy ?? 0;
          const after = this._nextPosition(cx, cy, tok.endX, tok.endY, dx, dy);
          cx = after.x; cy = after.y;
          continue;
        }
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
    if (this._isLabelToken(x, y)) {
      const tok = this._scanToken(x, y);
      if (tok) {
        const after = this._nextPosition(x, y, tok.endX, tok.endY, tok.dx, tok.dy);

        if (tok.kind === 'D') {
          // Subroutine definition — skip body
          const resume = this._skipSubroutine(after.x, after.y);
          if (!resume) return this._fail(`Subroutine D[${tok.name}] has no matching r`, cell, x, y);
          this.ip.x = resume.x;
          this.ip.y = resume.y;
          return true;
        }

        if (tok.kind === 'C') {
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

        if (tok.kind === '(') {
          // For-loop start — pop the iteration count
          if (!this._requireStackDepth(1)) return this._fail(`For loop ([${tok.name}] requires a count on the stack`, cell, x, y);
          const n = this._pop();
          if (!this._requireInteger(n, 'For loop count must be an integer')) return false;
          if (n <= 0) {
            // Nothing to run — skip straight past the matching )[name]
            const end = this.forEnds[tok.name];
            if (!end) return this._fail(`For loop ([${tok.name}] has no matching )[${tok.name}]`, cell, x, y);
            this.ip.x = end.x;
            this.ip.y = end.y;
            return true;
          }
          this.forStack.push({ name: tok.name, count: n, executed: 0, start: { x: after.x, y: after.y } });
          this.ip.x = after.x;
          this.ip.y = after.y;
          return true;
        }

        if (tok.kind === ')') {
          // For-loop end — never pops; the interpreter tracks the count itself
          if (this.forStack.length === 0) return this._fail(`)[${tok.name}] with no matching ([${tok.name}]`, cell, x, y);
          const frame = this.forStack[this.forStack.length - 1];
          if (frame.name !== tok.name) return this._fail(`Mismatched for loop: expected )[${frame.name}] but found )[${tok.name}]`, cell, x, y);
          frame.executed++;
          if (frame.executed < frame.count) {
            this.ip.x = frame.start.x;
            this.ip.y = frame.start.y;
          } else {
            this.forStack.pop();
            this.ip.x = after.x;
            this.ip.y = after.y;
          }
          return true;
        }
      }
    }

    // [n] number literal — works along whichever axis the IP is actually
    // traveling (horizontal or vertical), and from either end. Whichever
    // bracket char you land on, the rest of the literal necessarily lies
    // further along your current direction of travel (you just walked
    // into one end of it from outside), so we always scan *forward* in
    // this.dir looking for the other bracket, and read the value from the
    // digits in the order actually traversed. That means e.g. a leftward
    // pass over [12] yields 21, not 12 — it reflects what was scanned.
    if (cell === '[' || cell === ']') {
      const dx = this.dir.x, dy = this.dir.y;
      if (dx !== 0 || dy !== 0) {
        const terminator = cell === '[' ? ']' : '[';
        const found = this._scanNumberInDirection(x, y, dx, dy, terminator);
        if (found && !isNaN(found.val)) {
          this._push(found.val);
          this.ip.x = found.endX + dx;
          this.ip.y = found.endY + dy;
          this._wrapPosition();
          return true;
        }
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
      case '&': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'AND requires plain numbers')) return false;
        if (!this._requireNumber(b, 'AND requires plain numbers')) return false;
        this._push(a & b); break;
      }
      case '|': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'OR requires plain numbers')) return false;
        if (!this._requireNumber(b, 'OR requires plain numbers')) return false;
        this._push(a | b); break;
      }
      case '~': {
        const a = this._pop();
        if (!this._requireNumber(a, 'NOT requires a plain number')) return false;
        this._push((~a) & 1); break;
      }
      case '@': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'XOR requires plain numbers')) return false;
        if (!this._requireNumber(b, 'XOR requires plain numbers')) return false;
        this._push(a ^ b); break;
      }
      case '%': { this.running = false; return false; }
      case 'N': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'NAND requires plain numbers')) return false;
        if (!this._requireNumber(b, 'NAND requires plain numbers')) return false;
        this._push(~(a & b) & 1); break;
      }
      case 'R': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'NOR requires plain numbers')) return false;
        if (!this._requireNumber(b, 'NOR requires plain numbers')) return false;
        this._push(~(a | b) & 1); break;
      }
      case 'X': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'XNOR requires plain numbers')) return false;
        if (!this._requireNumber(b, 'XNOR requires plain numbers')) return false;
        this._push(~(a ^ b) & 1); break;
      }

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
      case ':': {
        this._push(this._peek());
        break;
      }
      case '\\': {
        const b = this._pop(), a = this._pop();
        this._push(b); this._push(a); break;
      }
      case '$': { this._pop(); break; }
      case 'W': {
        if (!this._requireStackDepth(2)) return this._fail('Stack swap requires two indexes');
        const idx2 = this._pop();
        const idx1 = this._pop();
        if (!this._requireInteger(idx1, 'Swap index 1 must be an integer')) return false;
        if (!this._requireInteger(idx2, 'Swap index 2 must be an integer')) return false;
        if (idx1 < 0 || idx2 < 0) return this._fail('Swap indexes must be non-negative');
        if (idx1 >= this.stack.length || idx2 >= this.stack.length) return this._fail('Swap index out of bounds');
        const pos1 = this.stack.length - 1 - idx1;
        const pos2 = this.stack.length - 1 - idx2;
        const temp = this.stack[pos1];
        this.stack[pos1] = this.stack[pos2];
        this.stack[pos2] = temp;
        break;
      }
      case '+': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'Add requires plain numbers')) return false;
        if (!this._requireNumber(b, 'Add requires plain numbers')) return false;
        this._push(a + b); break;
      }
      case '-': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'Subtract requires plain numbers')) return false;
        if (!this._requireNumber(b, 'Subtract requires plain numbers')) return false;
        this._push(a - b); break;
      }
      case '*': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'Multiply requires plain numbers')) return false;
        if (!this._requireNumber(b, 'Multiply requires plain numbers')) return false;
        this._push(a * b); break;
      }
      case '/': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'Divide requires plain numbers')) return false;
        if (!this._requireNumber(b, 'Divide requires plain numbers')) return false;
        this._push(b !== 0 ? Math.floor(a / b) : 0); break;
      }

      // Memory pointers
      case 'M': {
        if (!this._requireStackDepth(1)) return this._fail('Memory pointer requires an index on the stack');
        const idx = this._pop();
        if (!this._requireInteger(idx, 'Memory pointer index must be an integer')) return false;
        this.memoryPointer = idx;
        break;
      }
      case 'S': {
        if (!this._requireStackDepth(1)) return this._fail('Memory store requires a value on the stack');
        const value = this._pop();
        this.memory[this.memoryPointer] = value;
        break;
      }
      case 'L': {
        this._push(this.memory[this.memoryPointer] ?? 0);
        break;
      }

      // Output
      case '.': { this.output += String(this._pop()) + ' '; break; }
      case '=': {
        const v = this._pop();
        if (!this._requireNumber(v, 'ASCII output requires a plain number')) return false;
        this.output += String.fromCharCode(v); break;
      }
      case ',': {
        // push pixel: pop x, y, val (0 or 1); write pixel at (x, y)
        if (!this._requireStackDepth(3, 'Pixel write requires x, y, and value')) return false;
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

      case 'l': {this._push(this.stack.length); break}
      case 'U': {this.stack.reverse(); break}

      // For-loop index
      case 'G': {
        if (this.forStack.length === 0) return this._fail('G used outside of an active for loop', cell, x, y);
        this._push(this.forStack[this.forStack.length - 1].executed);
        break;
      }

      // Exponents
      case 'P': {
        const b = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'Pow requires plain numbers')) return false;
        if (!this._requireNumber(b, 'Pow requires plain numbers')) return false;
        const result = Math.pow(a, b);
        this._push(Number.isInteger(result) ? result : Math.floor(result));
        break;
      }
      case 'Q': {
        const n = this._pop(), a = this._pop();
        if (!this._requireNumber(a, 'Root requires plain numbers')) return false;
        if (!this._requireNumber(n, 'Root requires plain numbers')) return false;
        if (!this._requireInteger(n, 'Root index must be an integer')) return false;
        if (n <= 0) return this._fail('Root index must be positive', cell, x, y);
        if (a < 0 && n % 2 === 0) return this._fail('Even root of a negative number is not real', cell, x, y);
        this._push(this._integerNthRoot(a, n));
        break;
      }

      case 'E': {
        const v = this._pop();
        if (v === 0) {
          if (this.dir.x === 1 && this.dir.y === 0) this.dir = { x: 0, y: 1 };        // Right -> Down
          else if (this.dir.x === 0 && this.dir.y === 1) this.dir = { x: -1, y: 0 };  // Down -> Left
          else if (this.dir.x === -1 && this.dir.y === 0) this.dir = { x: 0, y: -1 }; // Left -> Up
          else if (this.dir.x === 0 && this.dir.y === -1) this.dir = { x: 1, y: 0 };  // Up -> Right
        }
        break;
      }

      case 'A': {const v = this._pop(); this._push(Math.abs(v)); break}
      case 'm': {
        if (!this._requireStackDepth(2)) return this._fail('Mod requires mod(a, b)');
        const b = this._pop(), a = this._pop();
        if (b === 0) return this._fail('Mod by zero', cell, x, y);
        this._push(a % b);
        break;
      }
      case 's': {const v = this._pop(); this._push(Math.sign(v)); break;}

      case 'o': {
        if (!this._requireStackDepth(2)) return this._fail('Log requires log(a, b)');
        const b = this._pop(), a = this._pop();
        if (a <= 0) return this._fail('Log requires a positive value', cell, x, y);
        if (b <= 0 || b === 1) return this._fail('Log base must be positive and not equal to 1', cell, x, y);
        const raw = this._integerLog(a, b);
        const rounded = Math.round(raw);
        this._push(Math.abs(raw - rounded) < 1e-9 ? rounded : Math.floor(raw));
        break;
      }

      default: break;
    }

    this._advance();
    return true;
  }

  _advance() {
    this.ip.x += this.dir.x;
    this.ip.y += this.dir.y;
    this._wrapPosition();
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
      memory: { ...this.memory },
      memoryPointer: this.memoryPointer,
    };
  }
}

// Export for browser use
if (typeof module !== 'undefined') {
  module.exports = BefungeLogicInterpreter;
}