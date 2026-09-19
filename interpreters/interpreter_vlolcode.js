/**
 * LOLCODE Interpreter (Logifunge engine shape: "lolcode")
 *
 * A JavaScript reimplementation of LOLCODE — the LOLcat-speak esolang —
 * following the semantics of the reference C implementation, lci
 * (https://github.com/justinmeza/lci), closely enough to run its own
 * example programs (HAI/KTHXBYE, VISIBLE/GIMMEH, the SUM OF-style
 * prefix operators, O RLY?/OIC conditionals, WTF?/OMG switches,
 * IM IN YR loops, and HOW IZ I functions including recursion).
 *
 * === WHY THIS ENGINE LOOKS DIFFERENT FROM THE OTHERS ===
 *   v1-v6, brainfrick, and malbolge step through source ONE CHARACTER at
 *   a time — that fits languages whose whole instruction set is
 *   single-character opcodes. LOLCODE's vocabulary is multi-character
 *   *words* ("VISIBLE", "SUM", "OF", "MKAY", ...), so this engine's
 *   `_step()` instead consumes exactly one LEXICAL TOKEN per call — one
 *   word, number, string, or comment — and `this.ip` carries an `endX`
 *   alongside the usual `x`/`y so the shared IDE's active-cell highlight
 *   can span the whole token instead of a single character (see
 *   `highlightActiveCell()` in functions/_run-template.js, which reads
 *   `ip.endX` when present and otherwise falls back to a 1-char span for
 *   every other engine, unchanged).
 *
 *   Internally, execution is a single JS generator (`*_run()`) built from
 *   plain recursive-descent methods — `*_evalExpr()`, `*_runStatement()`,
 *   `*_execLoop()`, etc. — where every `yield` happens inside `_advance()`,
 *   right after consuming one token. `_step()` just calls `.next()` once.
 *   This gets real pause/resume-anywhere behavior, including through
 *   recursive function calls, for free from JS's own generator call
 *   stack — no hand-rolled bytecode VM or explicit continuation stack
 *   needed. Loops and `IF`/`WTF?` branch-skipping work by moving
 *   `this.tp` (the token-stream position) around and re-entering these
 *   same generator methods, the same way the other engines repoint their
 *   own 1D/2D instruction pointer to jump.
 *
 * === BLOCK MATCHING ===
 *   `_buildBlockMap()` does one upfront pass (like brainfrick's bracket
 *   scan) pairing every `O RLY?`/`WTF?` with its `OIC`, every
 *   `IM IN YR` with its `IM OUTTA YR`, and every `HOW IZ I` with its
 *   `IF U SAY SO` — and registers every function's name, parameters, and
 *   body range up front, so forward references and recursion both work
 *   without re-scanning at call time.
 *
 * === VARIABLES / SCOPING ===
 *   Each function call gets its own scope (a Map) with its own `IT`;
 *   `I HAS A` declares into the current scope; a bare identifier looks
 *   outward through enclosing scopes to the global one. `GTFO` and
 *   `FOUND YR` are implemented as thrown `BreakSignal`/`ReturnSignal`
 *   objects, caught by the nearest enclosing loop, switch, or function
 *   call — ordinary JS exception unwinding across the generator chain.
 *
 * === WHAT'S NOT SUPPORTED ===
 *   Arrays (BUKKIT), module bindings (CAN HAS?), and multiple concurrent
 *   threads (BOTH SAEM...MEBBE-style parallelism isn't a real LOLCODE
 *   feature, but some more exotic corners of the spec are skipped too) —
 *   this covers the core imperative language: variables, arithmetic and
 *   boolean prefix operators, string concatenation and casts,
 *   conditionals, switches, loops, and functions/recursion.
 */

// ── VALUES ──────────────────────────────────────────────────────────
// Every LOLCODE value is a small tagged object: { t: 'NUMBR', v: 5 }, etc.
const NOOB = () => ({ t: 'NOOB', v: null });
const TROOF = (b) => ({ t: 'TROOF', v: !!b });
const NUMBR = (n) => ({ t: 'NUMBR', v: Math.trunc(n) });
const NUMBAR = (n) => ({ t: 'NUMBAR', v: n });
const YARN = (s) => ({ t: 'YARN', v: String(s) });

class LolError extends Error {}
class BreakSignal {}
class ReturnSignal { constructor(value) { this.value = value; } }

function parseLolNumber(s) {
  s = s.trim();
  if (/^-?\d+$/.test(s)) return NUMBR(parseInt(s, 10));
  if (/^-?\d+\.\d+$/.test(s)) return NUMBAR(parseFloat(s));
  return null;
}

function toNum(val) {
  switch (val.t) {
    case 'NUMBR': case 'NUMBAR': return val;
    case 'TROOF': return NUMBR(val.v ? 1 : 0);
    case 'NOOB': return NUMBR(0);
    case 'YARN': {
      const n = parseLolNumber(val.v);
      if (!n) throw new LolError(`Cannot use YARN "${val.v}" as a number`);
      return n;
    }
    default: throw new LolError(`Cannot use ${val.t} as a number`);
  }
}

function toYarn(val) {
  switch (val.t) {
    case 'YARN': return val.v;
    case 'NOOB': return 'NOOB';
    case 'TROOF': return val.v ? 'WIN' : 'FAIL';
    case 'NUMBR': return String(val.v);
    case 'NUMBAR': return val.v.toFixed(2);
    default: return String(val.v);
  }
}

function toTroof(val) {
  switch (val.t) {
    case 'NOOB': return false;
    case 'TROOF': return val.v;
    case 'NUMBR': case 'NUMBAR': return val.v !== 0;
    case 'YARN': return val.v.length > 0;
    default: return false;
  }
}

function castTo(type, val) {
  switch (type) {
    case 'NOOB': return NOOB();
    case 'TROOF': return TROOF(toTroof(val));
    case 'NUMBR': { const n = toNum(val); return NUMBR(n.v); }
    case 'NUMBAR': { const n = toNum(val); return NUMBAR(n.v); }
    case 'YARN': return YARN(toYarn(val));
    default: throw new LolError(`Unknown type ${type}`);
  }
}

function arith(a, b, fn) {
  const na = toNum(a), nb = toNum(b);
  const result = fn(na.v, nb.v);
  const isFloat = na.t === 'NUMBAR' || nb.t === 'NUMBAR';
  return isFloat ? NUMBAR(result) : NUMBR(Math.trunc(result));
}

function valuesEqual(a, b) {
  if (a.t !== b.t) {
    // Lenient cross-type compare: cast b to a's type, then compare.
    try { b = castTo(a.t, b); } catch (_) { return false; }
  }
  if (a.t === 'NOOB') return true;
  return a.v === b.v;
}

// ── TOKENIZER ───────────────────────────────────────────────────────
// Flat token array with source positions, used both for execution (the
// interpreter walks it one token at a time) and for the active-cell
// highlight (each token's row/col/endCol becomes a highlighted range).
// Types: 'word' (bare identifier/keyword), 'number', 'string', 'sep'
// (statement separator: newline or comma), 'punct' ('?' or '!'),
// 'comment' (BTW-to-EOL or OBTW..TLDR block), 'unknown' (stray char).
function tokenize(code) {
  const tokens = [];
  let i = 0, row = 0, col = 0;
  const n = code.length;

  function push(type, value, startRow, startCol, endRow, endCol) {
    tokens.push({ type, value, row: startRow, col: startCol, endRow, endCol });
  }

  while (i < n) {
    const ch = code[i];

    if (ch === '\r') { i++; col++; continue; }
    if (ch === '\n') { push('sep', '\n', row, col, row, col + 1); i++; row++; col = 0; continue; }
    if (ch === ' ' || ch === '\t') { i++; col++; continue; }

    if (ch === ',') { push('sep', ',', row, col, row, col + 1); i++; col++; continue; }
    if (ch === '!' || ch === '?') { push('punct', ch, row, col, row, col + 1); i++; col++; continue; }

    if (ch === '"') {
      const startRow = row, startCol = col;
      let out = '';
      i++; col++;
      while (i < n) {
        const c = code[i];
        if (c === '\n') break; // strings don't span lines
        if (c === '"') { i++; col++; break; }
        if (c === ':') {
          const c2 = code[i + 1];
          if (c2 === ')') { out += '\n'; i += 2; col += 2; continue; }
          if (c2 === '>') { out += '\t'; i += 2; col += 2; continue; }
          if (c2 === 'o') { out += '\u0007'; i += 2; col += 2; continue; }
          if (c2 === '"') { out += '"'; i += 2; col += 2; continue; }
          if (c2 === ':') { out += ':'; i += 2; col += 2; continue; }
          out += c; i++; col++; continue;
        }
        out += c; i++; col++;
      }
      push('string', out, startRow, startCol, row, col);
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(code[i + 1] || ''))) {
      const startCol = col;
      let s = ch; i++; col++;
      while (i < n && /[0-9]/.test(code[i])) { s += code[i]; i++; col++; }
      if (code[i] === '.' && /[0-9]/.test(code[i + 1] || '')) {
        s += '.'; i++; col++;
        while (i < n && /[0-9]/.test(code[i])) { s += code[i]; i++; col++; }
      }
      const isFloat = s.includes('.');
      push('number', isFloat ? NUMBAR(parseFloat(s)) : NUMBR(parseInt(s, 10)), row, startCol, row, col);
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const startCol = col;
      let s = ch; i++; col++;
      while (i < n && /[A-Za-z0-9_]/.test(code[i])) { s += code[i]; i++; col++; }

      if (s === 'BTW') {
        const startRow = row;
        let text = 'BTW';
        while (i < n && code[i] !== '\n') { text += code[i]; i++; col++; }
        push('comment', text, startRow, startCol, row, col);
        continue;
      }

      if (s === 'OBTW') {
        const startRow = row, startCol2 = startCol;
        let text = 'OBTW';
        while (i < n) {
          if (/[A-Za-z_]/.test(code[i])) {
            let w = ''; const wStartI = i;
            while (i < n && /[A-Za-z0-9_]/.test(code[i])) { w += code[i]; i++; col++; }
            text += code.slice(wStartI, i);
            if (w === 'TLDR') break;
          } else {
            if (code[i] === '\n') { row++; col = 0; } else { col++; }
            text += code[i]; i++;
          }
        }
        push('comment', text, startRow, startCol2, row, col);
        continue;
      }

      push('word', s, row, startCol, row, col);
      continue;
    }

    push('unknown', ch, row, col, row, col + 1); // stray character — inert, one step
    i++; col++;
  }

  push('sep', '\n', row, col, row, col + 1); // final implicit statement end
  return tokens;
}

// Yielded by *_readInputLine() when GIMMEH has to wait for the user; _step()
// recognises it and holds position instead of counting a step.
const INPUT_WAIT = { inputWait: true };

class BefungeLogicInterpreter {
  // No 'pixels' (LOLCODE has no pixel output here). No 'async' — this
  // engine steps one token at a time, same interactive-debugger shape
  // as v1-v6/brainfrick/malbolge, just at token instead of character
  // granularity.
  static FEATURES = ['text', 'input'];

  // One "Variables" list panel — the current scope's variables, IT
  // shown first — instead of the default Data Stack + Memory pair,
  // since LOLCODE has named variables rather than a numeric tape.
  static STACK_PANELS = [
    { id: 'vars', label: 'Variables', ariaLabel: 'Variables', searchLabel: 'variables', source: 'stack', type: 'list' },
  ];

  constructor(code, pixelWidth = 32, pixelHeight = 32, maxSteps = 1000000) {
    this.sourceCode = code;
    this.tokens = tokenize(code);
    this.tp = 0;
    this.scopes = [new Map()]; // global scope; every scope also holds its own 'IT'
    this.scopes[0].set('IT', NOOB());
    this.functions = new Map(); // name -> {params, bodyStart, headerEnd}
    this._buildBlockMap();

    this.ip = { x: 0, y: 0, endX: 1 }; // token span highlighted this step
    this.dir = { x: 1, y: 0 };         // LOLCODE has no direction; kept for UI compatibility
    this.stack = [];                   // Variables panel — see _syncVars()
    this.memory = {};                  // unused — kept so nothing reading interp.memory breaks
    this.memoryPointer = 0;            // unused, same reason
    this.output = '';
    this.pixels = [];
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.stdin = '';
    this._stdinLines = null;
    this._stdinPos = 0;
    this.interactive = false;  // true = pause for terminal input instead of returning ''
    this._stdinClosed = false; // set by provideEOF() (Ctrl+D in the terminal)
    this.awaitingInput = null; // { kind: 'line' } while paused waiting for the user to type
    this.running = false;
    this.steps = 0;
    this.maxSteps = maxSteps;
    this.error = null;
    this._gen = null;
    this._syncVars();
  }

  // ---- block map: one upfront pass pairing openers with closers ----
  _wordAt(tp) { const t = this.tokens[tp]; return t && t.type === 'word' ? t.value : null; }

  _buildBlockMap() {
    this.blockEnd = new Map(); // openTp (opener's first word) -> closeTp (closer's first word)
    const stack = [];
    let tp = 0;
    while (tp < this.tokens.length) {
      const tok = this.tokens[tp];
      if (tok.type === 'word') {
        const w = tok.value;
        if (w === 'O' && this._wordAt(this._nextWordTp(tp + 1)) === 'RLY') {
          stack.push({ tp }); tp = this._nextWordTp(tp + 1) + 1; continue;
        }
        if (w === 'WTF') { stack.push({ tp }); tp++; continue; }
        if (w === 'IM' && this._wordAt(this._nextWordTp(tp + 1)) === 'IN') {
          stack.push({ tp }); tp = this._nextWordTp(tp + 1) + 1; continue;
        }
        if (w === 'HOW') { stack.push({ tp }); tp++; continue; }
        if (w === 'OIC') {
          const top = stack.pop();
          if (top) this.blockEnd.set(top.tp, tp);
          tp++; continue;
        }
        if (w === 'IM' && this._wordAt(this._nextWordTp(tp + 1)) === 'OUTTA') {
          const top = stack.pop();
          if (top) this.blockEnd.set(top.tp, tp);
          tp++; continue;
        }
        if (w === 'IF' && this._wordAt(this._nextWordTp(tp + 1)) === 'U') {
          const top = stack.pop();
          if (top) this.blockEnd.set(top.tp, tp);
          tp++; continue;
        }
      }
      tp++;
    }

    // Register functions: HOW IZ I <name> [YR p1 (AN YR p2)*] <sep> ... IF U SAY SO
    // Parsed with direct index arithmetic, not _nextWordTp: the header is
    // a single fixed-shape line, and _nextWordTp happily crosses a sep
    // hunting for "the next word" — which, used here, would swallow the
    // header's own terminating newline and start eating the function
    // body as if it were more parameters.
    for (const [openTp, closeTp] of this.blockEnd.entries()) {
      if (this._wordAt(openTp) !== 'HOW') continue;
      let p = openTp + 1; p++; p++; // HOW -> IZ -> I -> name
      const name = this._wordAt(p);
      p++; // -> YR, or the header's trailing sep
      const params = [];
      while (this._wordAt(p) === 'YR') {
        p++; params.push(this._wordAt(p)); p++;
        if (this._wordAt(p) === 'AN') { p++; } else break;
      }
      const bodyStart = this._afterSep(p);
      this.functions.set(name, { params, bodyStart, headerEnd: closeTp });
    }
  }

  _nextWordTp(fromTp) {
    let tp = fromTp;
    while (tp < this.tokens.length && this.tokens[tp].type !== 'word') tp++;
    return tp;
  }

  _afterSep(fromTp) {
    let tp = fromTp;
    while (tp < this.tokens.length && this.tokens[tp].type !== 'sep') tp++;
    return tp + 1;
  }

  // ---- runtime token-stream primitives — every yield here is "1 step" ----
  _cur() { return this.tokens[this.tp]; }

  *_advance() {
    const tok = this.tokens[this.tp];
    this.tp++;
    yield tok;
    return tok;
  }

  *_skipTrivia() {
    while (this.tp < this.tokens.length) {
      const t = this.tokens[this.tp];
      if (t.type === 'sep' || t.type === 'comment' || t.type === 'unknown') yield* this._advance();
      else break;
    }
  }

  *_expectAndConsumeWord(word) {
    yield* this._skipTrivia();
    const t = this._cur();
    if (!t || t.type !== 'word' || t.value !== word) {
      throw new LolError(`Expected ${word} but found ${t ? JSON.stringify(t.value) : 'end of program'}`);
    }
    yield* this._advance();
  }

  *_consumeWords(words) { for (const w of words) yield* this._expectAndConsumeWord(w); }

  *_consumeOptionalPunct(p) {
    yield* this._skipTrivia();
    const t = this._cur();
    if (t && t.type === 'punct' && t.value === p) yield* this._advance();
  }

  *_consumeSep() {
    yield* this._skipTrivia();
    const t = this._cur();
    if (t && t.type === 'sep') yield* this._advance();
  }

  _peekWord() {
    let tp = this.tp;
    while (tp < this.tokens.length && (this.tokens[tp].type === 'sep' || this.tokens[tp].type === 'comment' || this.tokens[tp].type === 'unknown')) tp++;
    const t = this.tokens[tp];
    return t && t.type === 'word' ? t.value : null;
  }

  // True if the CURRENT token (no trivia skip!) could start another
  // expression. Callers must never skip trivia before calling this — a
  // 'sep' token means "end of statement", full stop, never "maybe more
  // on the next line": skipping past it here was the original bug that
  // let a VISIBLE/ALL OF/ANY OF/SMOOSH continuation loop wander into the
  // next statement's leading keyword and misread it as another operand.
  _isExprStart() {
    const t = this._cur();
    if (!t) return false;
    if (t.type === 'number' || t.type === 'string') return true;
    if (t.type === 'word') return t.value !== 'MKAY';
    return false;
  }

  // ---- scope / variables ----
  _declare(name, val) { this.scopes[this.scopes.length - 1].set(name, val); }
  _find(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) if (this.scopes[i].has(name)) return this.scopes[i];
    return null;
  }
  _get(name) {
    if (name === 'IT') return this.scopes[this.scopes.length - 1].get('IT');
    const s = this._find(name);
    if (!s) throw new LolError(`Undeclared variable ${name}`);
    return s.get(name);
  }
  _set(name, val) {
    if (name === 'IT') { this.scopes[this.scopes.length - 1].set('IT', val); return; }
    const s = this._find(name);
    if (!s) throw new LolError(`Undeclared variable ${name}`);
    s.set(name, val);
  }
  _setIT(val) { this.scopes[this.scopes.length - 1].set('IT', val); }

  _syncVars() {
    const scope = this.scopes[this.scopes.length - 1];
    const entries = [`IT: ${toYarn(scope.get('IT') || NOOB())}`];
    for (const [k, v] of scope) {
      if (k === 'IT') continue;
      entries.push(`${k}: ${toYarn(v)}`);
    }
    this.stack = entries;
  }

  // ---- expressions ----
  *_evalExpr() {
    yield* this._skipTrivia();
    const t = this._cur();
    if (!t) throw new LolError('Unexpected end of program while reading an expression');

    if (t.type === 'number') { yield* this._advance(); return t.value; }
    if (t.type === 'string') { yield* this._advance(); return YARN(t.value); }

    if (t.type === 'word') {
      switch (t.value) {
        case 'WIN': yield* this._advance(); return TROOF(true);
        case 'FAIL': yield* this._advance(); return TROOF(false);
        case 'NOOB': yield* this._advance(); return NOOB();
        case 'IT': yield* this._advance(); return this._get('IT');
        case 'SUM': case 'DIFF': case 'PRODUKT': case 'QUOSHUNT': case 'MOD': case 'BIGGR': case 'SMALLR':
          return yield* this._evalMathOp(t.value);
        case 'BOTH': return yield* this._evalBothOrSaem();
        case 'EITHER': return yield* this._evalBinBool((a, b) => a || b);
        case 'WON': return yield* this._evalBinBool((a, b) => a !== b);
        case 'NOT': return yield* this._evalNot();
        case 'ALL': return yield* this._evalVariadicBool(true);
        case 'ANY': return yield* this._evalVariadicBool(false);
        case 'DIFFRINT': return yield* this._evalDiffrint();
        case 'SMOOSH': return yield* this._evalSmoosh();
        case 'MAEK': return yield* this._evalMaek();
        case 'I': return yield* this._evalFuncCall();
        default: // bare identifier — a variable reference
          yield* this._advance();
          return this._get(t.value);
      }
    }
    throw new LolError(`Unexpected token ${JSON.stringify(t.value)} while reading an expression`);
  }

  *_maybeConsumeAN() {
    yield* this._skipTrivia();
    const t = this._cur();
    if (t && t.type === 'word' && t.value === 'AN') yield* this._advance();
  }

  *_evalMathOp(op) {
    yield* this._advance();
    yield* this._expectAndConsumeWord('OF');
    const a = yield* this._evalExpr();
    yield* this._maybeConsumeAN();
    const b = yield* this._evalExpr();
    const fns = {
      SUM: (x, y) => x + y, DIFF: (x, y) => x - y, PRODUKT: (x, y) => x * y,
      QUOSHUNT: (x, y) => x / y, MOD: (x, y) => x % y,
      BIGGR: (x, y) => Math.max(x, y), SMALLR: (x, y) => Math.min(x, y),
    };
    return arith(a, b, fns[op]);
  }

  *_evalBothOrSaem() {
    yield* this._advance(); // BOTH
    yield* this._skipTrivia();
    const t = this._cur();
    if (t && t.type === 'word' && t.value === 'SAEM') {
      yield* this._advance();
      const a = yield* this._evalExpr();
      yield* this._maybeConsumeAN();
      const b = yield* this._evalExpr();
      return TROOF(valuesEqual(a, b));
    }
    yield* this._expectAndConsumeWord('OF');
    const a = yield* this._evalExpr();
    yield* this._maybeConsumeAN();
    const b = yield* this._evalExpr();
    return TROOF(toTroof(a) && toTroof(b));
  }

  *_evalBinBool(fn) {
    yield* this._advance();
    yield* this._expectAndConsumeWord('OF');
    const a = yield* this._evalExpr();
    yield* this._maybeConsumeAN();
    const b = yield* this._evalExpr();
    return TROOF(fn(toTroof(a), toTroof(b)));
  }

  *_evalNot() {
    yield* this._advance();
    const a = yield* this._evalExpr();
    return TROOF(!toTroof(a));
  }

  *_evalVariadicBool(isAll) {
    yield* this._advance();
    yield* this._expectAndConsumeWord('OF');
    const vals = [toTroof(yield* this._evalExpr())];
    while (true) {
      const t = this._cur();
      if (t && t.type === 'word' && t.value === 'MKAY') { yield* this._advance(); break; }
      if (t && t.type === 'word' && t.value === 'AN') { yield* this._advance(); yield* this._skipTrivia(); }
      else if (!this._isExprStart()) break;
      vals.push(toTroof(yield* this._evalExpr()));
    }
    return TROOF(isAll ? vals.every(Boolean) : vals.some(Boolean));
  }

  *_evalDiffrint() {
    yield* this._advance();
    const a = yield* this._evalExpr();
    yield* this._maybeConsumeAN();
    const b = yield* this._evalExpr();
    return TROOF(!valuesEqual(a, b));
  }

  *_evalSmoosh() {
    yield* this._advance();
    let s = toYarn(yield* this._evalExpr());
    while (true) {
      const t = this._cur();
      if (t && t.type === 'word' && t.value === 'MKAY') { yield* this._advance(); break; }
      if (t && t.type === 'word' && t.value === 'AN') { yield* this._advance(); yield* this._skipTrivia(); }
      else if (!this._isExprStart()) break;
      s += toYarn(yield* this._evalExpr());
    }
    return YARN(s);
  }

  *_evalMaek() {
    yield* this._advance();
    const val = yield* this._evalExpr();
    yield* this._skipTrivia();
    let t = this._cur();
    if (t && t.type === 'word' && (t.value === 'A' || t.value === 'AN')) yield* this._advance();
    yield* this._skipTrivia();
    t = this._cur();
    const type = t.value; yield* this._advance();
    return castTo(type, val);
  }

  *_evalFuncCall() {
    yield* this._advance(); // I
    yield* this._expectAndConsumeWord('IZ');
    yield* this._skipTrivia();
    const name = this._cur().value; yield* this._advance();
    const fn = this.functions.get(name);
    if (!fn) throw new LolError(`Unknown function ${name}`);
    const args = [];
    let t = this._cur();
    if (t && t.type === 'word' && t.value === 'YR') {
      while (true) {
        t = this._cur();
        if (!(t && t.type === 'word' && t.value === 'YR')) break;
        yield* this._advance(); // YR
        args.push(yield* this._evalExpr());
        t = this._cur();
        if (t && t.type === 'word' && t.value === 'AN') { yield* this._advance(); } else break;
      }
    }
    t = this._cur();
    if (t && t.type === 'word' && t.value === 'MKAY') yield* this._advance();

    const savedTp = this.tp;
    const scope = new Map();
    scope.set('IT', NOOB());
    fn.params.forEach((p, idx) => scope.set(p, args[idx] || NOOB()));
    this.scopes.push(scope);
    this.tp = fn.bodyStart;
    let ret = NOOB();
    try {
      yield* this._runBlock(['IF']);
    } catch (e) {
      if (e instanceof ReturnSignal) ret = e.value;
      else if (e instanceof BreakSignal) ret = NOOB();
      else { this.scopes.pop(); this.tp = savedTp; throw e; }
    }
    this.scopes.pop();
    this.tp = savedTp;
    return ret;
  }

  // ---- statements ----
  *_runStatement() {
    yield* this._skipTrivia();
    const t = this._cur();
    if (!t) return;
    if (t.type !== 'word') { yield* this._advance(); yield* this._consumeSep(); return; }

    switch (t.value) {
      case 'I': {
        // "I HAS A x [ITZ expr]" declaration, or "I IZ f ... MKAY" as a bare call statement.
        const save = this.tp;
        yield* this._advance();
        yield* this._skipTrivia();
        const t2 = this._cur();
        if (t2 && t2.type === 'word' && t2.value === 'HAS') {
          yield* this._advance();
          yield* this._expectAndConsumeWord('A');
          yield* this._skipTrivia();
          const name = this._cur().value;
          yield* this._advance();
          let val = NOOB();
          yield* this._skipTrivia();
          const t3 = this._cur();
          if (t3 && t3.type === 'word' && t3.value === 'ITZ') { yield* this._advance(); val = yield* this._evalExpr(); }
          this._declare(name, val);
          yield* this._consumeSep();
          return;
        }
        if (t2 && t2.type === 'word' && t2.value === 'IZ') {
          this.tp = save;
          const result = yield* this._evalFuncCall();
          this._setIT(result);
          yield* this._consumeSep();
          return;
        }
        this.tp = save;
        break;
      }
      case 'VISIBLE': {
        yield* this._advance();
        let out = toYarn(yield* this._evalExpr());
        while (true) {
          const t2 = this._cur();
          if (t2 && t2.type === 'word' && t2.value === 'AN') { yield* this._advance(); yield* this._skipTrivia(); }
          else if (t2 && t2.type === 'punct' && t2.value === '!') break;
          else if (!this._isExprStart()) break;
          out += toYarn(yield* this._evalExpr());
        }
        yield* this._skipTrivia();
        let suppressNewline = false;
        const t2 = this._cur();
        if (t2 && t2.type === 'punct' && t2.value === '!') { suppressNewline = true; yield* this._advance(); }
        this.output += out + (suppressNewline ? '' : '\n');
        yield* this._consumeSep();
        return;
      }
      case 'GIMMEH': {
        yield* this._advance();
        yield* this._skipTrivia();
        const name = this._cur().value;
        yield* this._advance();
        const line = yield* this._readInputLine();
        this._set(name, YARN(line));
        yield* this._consumeSep();
        return;
      }
      case 'GTFO': {
        yield* this._advance();
        yield* this._consumeSep();
        throw new BreakSignal();
      }
      case 'FOUND': {
        yield* this._advance();
        yield* this._expectAndConsumeWord('YR');
        const val = yield* this._evalExpr();
        yield* this._consumeSep();
        throw new ReturnSignal(val);
      }
      case 'O': yield* this._execIf(); return;
      case 'WTF': yield* this._execSwitch(); return;
      case 'IM': yield* this._execLoop(); return;
      case 'HOW': yield* this._skipFunctionDef(); return; // already registered by the prescan

      default: {
        // Recast ("x IS NOW A TYPE"), assignment ("x R expr"), or a bare expression statement (sets IT).
        const save = this.tp;
        const maybeIdent = t.value;
        yield* this._advance();
        yield* this._skipTrivia();
        const t2 = this._cur();
        if (t2 && t2.type === 'word' && t2.value === 'R') {
          yield* this._advance();
          const val = yield* this._evalExpr();
          this._set(maybeIdent, val);
          yield* this._consumeSep();
          return;
        }
        if (t2 && t2.type === 'word' && t2.value === 'IS') {
          yield* this._advance();
          yield* this._expectAndConsumeWord('NOW');
          yield* this._skipTrivia();
          const t3 = this._cur();
          if (t3 && t3.type === 'word' && (t3.value === 'A' || t3.value === 'AN')) yield* this._advance();
          yield* this._skipTrivia();
          const type = this._cur().value;
          yield* this._advance();
          this._set(maybeIdent, castTo(type, this._get(maybeIdent)));
          yield* this._consumeSep();
          return;
        }
        this.tp = save;
        const val = yield* this._evalExpr();
        this._setIT(val);
        yield* this._consumeSep();
        return;
      }
    }
  }

  *_runBlock(stopWords) {
    while (true) {
      yield* this._skipTrivia();
      const w = this._peekWord();
      if (w === null || w === 'KTHXBYE' || stopWords.includes(w)) return;
      yield* this._runStatement();
    }
  }

  *_skipBlock() {
    yield* this._skipTrivia();
    const w = this._peekWord();
    if (w && ['O', 'WTF', 'IM', 'HOW'].includes(w) && this.blockEnd.has(this.tp)) {
      const closeTp = this.blockEnd.get(this.tp);
      while (this.tp <= closeTp) yield* this._advance();
      while (this._cur() && this._cur().type === 'word') yield* this._advance(); // rest of closer's words
      yield* this._consumeSep();
      return;
    }
    while (this._cur() && this._cur().type !== 'sep') yield* this._advance();
    yield* this._consumeSep();
  }

  // HOW IZ I ... IF U SAY SO is fully known from the prescan (blockEnd
  // already maps the opener straight to its OIC), so there's no need to
  // walk the header and body one token at a time like _skipBlock() does
  // for O RLY / WTF / IM IN YR. Jump tp straight past the whole
  // definition and surface it as a single step spanning the block, so
  // the UI highlights "HOW IZ I ... IF U SAY SO" once instead of
  // stepping through every token inside a function that isn't running.
  *_skipFunctionDef() {
    yield* this._skipTrivia();
    const openTp = this.tp;
    const openTok = this._cur();
    const closeTp = this.blockEnd.get(openTp);
    if (closeTp === undefined) { yield* this._skipBlock(); return; } // fallback, shouldn't happen
    const closeTok = this.tokens[closeTp];
    this.tp = closeTp + 1;
    while (this._cur() && this._cur().type === 'word') this.tp++; // rest of closer's words, no extra step
    yield { row: openTok.row, col: openTok.col, endCol: closeTok.endCol };
    yield* this._consumeSep();
  }

  *_skipToStopWords(stopWords) {
    while (true) {
      yield* this._skipTrivia();
      const w = this._peekWord();
      if (w === null || stopWords.includes(w)) return;
      yield* this._skipBlock();
    }
  }

  *_execIf() {
    const cond0 = toTroof(this._get('IT'));
    yield* this._consumeWords(['O', 'RLY']);
    yield* this._consumeOptionalPunct('?');
    yield* this._consumeSep();
    yield* this._consumeWords(['YA', 'RLY']);
    yield* this._consumeSep();
    let branchTaken = false;
    if (cond0) { branchTaken = true; yield* this._runBlock(['MEBBE', 'NO', 'OIC']); }
    else yield* this._skipToStopWords(['MEBBE', 'NO', 'OIC']);

    while (this._peekWord() === 'MEBBE') {
      yield* this._expectAndConsumeWord('MEBBE');
      const val = yield* this._evalExpr();
      yield* this._consumeSep();
      if (!branchTaken && toTroof(val)) { branchTaken = true; yield* this._runBlock(['MEBBE', 'NO', 'OIC']); }
      else yield* this._skipToStopWords(['MEBBE', 'NO', 'OIC']);
    }
    if (this._peekWord() === 'NO') {
      yield* this._consumeWords(['NO', 'WAI']);
      yield* this._consumeSep();
      if (!branchTaken) yield* this._runBlock(['OIC']);
      else yield* this._skipToStopWords(['OIC']);
    }
    yield* this._expectAndConsumeWord('OIC');
    yield* this._consumeSep();
  }

  *_execSwitch() {
    const discriminant = this._get('IT');
    yield* this._expectAndConsumeWord('WTF');
    yield* this._consumeOptionalPunct('?');
    yield* this._consumeSep();
    let matched = false, fallthrough = false;

    while (this._peekWord() === 'OMG' || this._peekWord() === 'OMGWTF') {
      if (this._peekWord() === 'OMGWTF') {
        yield* this._expectAndConsumeWord('OMGWTF');
        yield* this._consumeSep();
        if (matched && !fallthrough) {
          // An earlier OMG case already matched and GTFO'd out — the
          // default never runs then, only when nothing matched yet, or
          // a matched case fell through without a GTFO.
          yield* this._skipToStopWords(['OIC']);
        } else {
          matched = true;
          try { yield* this._runBlock(['OIC']); } catch (e) { if (!(e instanceof BreakSignal)) throw e; }
        }
        break;
      }
      yield* this._expectAndConsumeWord('OMG');
      const lit = yield* this._evalExpr();
      yield* this._consumeSep();
      if (fallthrough || (!matched && valuesEqual(lit, discriminant))) {
        matched = true; fallthrough = true;
        try { yield* this._runBlock(['OMG', 'OMGWTF', 'OIC']); }
        catch (e) {
          if (e instanceof BreakSignal) { fallthrough = false; yield* this._skipToStopWords(['OMG', 'OMGWTF', 'OIC']); }
          else throw e;
        }
      } else {
        yield* this._skipToStopWords(['OMG', 'OMGWTF', 'OIC']);
      }
    }
    yield* this._expectAndConsumeWord('OIC');
    yield* this._consumeSep();
  }

  *_execLoop() {
    const loopOpenTp = this.tp; // this loop's own "IM" (of "IM IN YR")
    yield* this._consumeWords(['IM', 'IN', 'YR']);
    yield* this._skipTrivia();
    yield* this._advance(); // label (unused beyond matching IM OUTTA YR, via the block map)
    let changeOp = null, changeVar = null;
    yield* this._skipTrivia();
    let t = this._cur();
    if (t && t.type === 'word' && (t.value === 'UPPIN' || t.value === 'NERFIN')) {
      changeOp = t.value; yield* this._advance();
      yield* this._expectAndConsumeWord('YR');
      yield* this._skipTrivia();
      changeVar = this._cur().value; yield* this._advance();
    }
    let condOp = null, condExprTp = null;
    yield* this._skipTrivia();
    t = this._cur();
    if (t && t.type === 'word' && (t.value === 'TIL' || t.value === 'WILE')) {
      condOp = t.value; yield* this._advance();
      condExprTp = this.tp;
      yield* this._evalExpr(); // consumed once here for correct step-counting; re-evaluated each iteration below
    }
    yield* this._consumeSep();
    const bodyStart = this.tp;
    const bodyEnd = this.blockEnd.get(loopOpenTp);

    while (true) {
      if (condOp) {
        this.tp = condExprTp;
        const truth = toTroof(yield* this._evalExpr());
        if (condOp === 'TIL' && truth) break;
        if (condOp === 'WILE' && !truth) break;
      }
      this.tp = bodyStart;
      try {
        yield* this._runBlock(['IM']);
      } catch (e) {
        if (e instanceof BreakSignal) { this.tp = bodyEnd; break; }
        throw e;
      }
      if (changeOp) {
        const v = toNum(this._get(changeVar));
        this._set(changeVar, NUMBR(changeOp === 'UPPIN' ? v.v + 1 : v.v - 1));
      }
      // No TIL/WILE and no UPPIN/NERFIN counter is a legal infinite loop
      // in LOLCODE, broken only by GTFO — the shared max-steps guard
      // protects the IDE if a program doesn't have one.
    }
    this.tp = bodyEnd;
    yield* this._consumeWords(['IM', 'OUTTA', 'YR']);
    yield* this._skipTrivia();
    if (this._cur() && this._cur().type === 'word') yield* this._advance(); // label
    yield* this._consumeSep();
  }

  _initStdin() {
    if (this._stdinLines === null) this._stdinLines = this.stdin ? this.stdin.split('\n') : [];
  }

  // GIMMEH: hands back the next queued line. In interactive mode, an empty
  // queue pauses the whole generator (yield INPUT_WAIT) until the IDE calls
  // provideInput()/provideEOF() and steps again.
  *_readInputLine() {
    this._initStdin();
    while (this._stdinPos >= this._stdinLines.length) {
      if (!this.interactive || this._stdinClosed) return '';
      this.awaitingInput = { kind: 'line' };
      yield INPUT_WAIT;
    }
    return this._stdinLines[this._stdinPos++];
  }

  // Terminal input: the typed line is queued for GIMMEH and echoed into the output.
  provideInput(text) {
    this._initStdin();
    this._stdinLines.push(String(text));
    this.output += String(text) + '\n';
    this.awaitingInput = null;
  }

  // Ctrl+D in the terminal: further GIMMEH calls read an empty string.
  provideEOF() {
    this._stdinClosed = true;
    this.awaitingInput = null;
  }

  *_run() {
    yield* this._consumeWords(['HAI']);
    yield* this._skipTrivia();
    if (this._cur() && this._cur().type === 'number') yield* this._advance(); // version number
    yield* this._consumeSep();
    yield* this._runBlock(['KTHXBYE']);
    yield* this._skipTrivia();
    if (this._peekWord() === 'KTHXBYE') yield* this._expectAndConsumeWord('KTHXBYE');
  }

  _formatError(message) { return message; }

  // ---- shared-IDE surface: _step()/run(), matching every other engine ----
  _step() {
    if (!this._gen) this._gen = this._run();
    try {
      const r = this._gen.next();
      if (r.done) { this.running = false; return false; }
      if (r.value === INPUT_WAIT) return true; // waiting for terminal input — hold position
      const tok = r.value; // the token _advance() just consumed
      if (tok) this.ip = { x: tok.col, y: tok.row, endX: tok.endCol };
      this._syncVars();
      return true;
    } catch (e) {
      this.error = e instanceof LolError ? e.message : this._formatError(`Runtime error: ${e.message}`);
      this.running = false;
      return false;
    }
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