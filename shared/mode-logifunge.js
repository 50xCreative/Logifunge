/**
 * Ace Editor custom syntax mode for LOGIFUNGE.
 *
 * LOGIFUNGE is a 2D Befunge-style language.
 *
 * Token categories:
 *   movement    > < ^ v ? #
 *   logic gate  & | ~ @ N R X
 *   stack/math  0-9 : \ $ W + - * / l U A s m  and  [n] numeric literals
 *   memory      M S L
 *   output      . = , ' "  (and the string-mode contents of " ... ")
 *   control     _ ! g p %
 *   subroutine  D[name] C[name] r
 *   loop        {[name] }[name]
 *   for-loop    ([name] )[name] G
 *   exponent    P Q
 *   redirect    E
 *   comment     -- ... to end of line
 *               ---!
 *               block comments
 *               !---
 */
define('ace/mode/logifunge_highlight_rules', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextHighlightRules = require('./text_highlight_rules').TextHighlightRules;

var LogifungeHighlightRules = function() {

  this.$rules = {
    start: [
      // ── Multi-line Block Comment ──
      // Must come before single-line to avoid partial matching
      {
        token: 'comment.block.logifunge',
        regex: /^---!$/,
        next: 'block_comment'
      },

      // ── Single-line Comment ──
      {
        token: 'comment.line.logifunge',
        regex: /^\s*--.*$/
      },

      // ── Labeled block openers: D[name] C[name] {[name] }[name] ([name] )[name] ──
      {
        token: ['keyword.control.subroutine.logifunge', 'paren.logifunge', 'entity.name.label.logifunge', 'paren.logifunge'],
        regex: /(D|C)(\[)([^\]\n]*)(\])/
      },
      {
        token: ['keyword.control.loop.logifunge', 'paren.logifunge', 'entity.name.label.logifunge', 'paren.logifunge'],
        regex: /(\{|\})(\[)([^\]\n]*)(\])/
      },
      {
        token: ['keyword.control.forloop.logifunge', 'paren.logifunge', 'entity.name.label.logifunge', 'paren.logifunge'],
        regex: /(\(|\))(\[)([^\]\n]*)(\])/
      },

      // ── Numeric literal [42] ──
      {
        token: ['paren.logifunge', 'constant.numeric.logifunge', 'paren.logifunge'],
        regex: /(\[)(-?\d+)(\])/
      },

      // ── String-mode toggle + contents: " ... " ──
      {
        token: 'string.logifunge',
        regex: /"/,
        next: 'string'
      },

      // ── Movement ──
      { token: 'support.function.movement.logifunge', regex: /[><^v?#]/ },

      // ── Logic gates ──
      { token: 'keyword.operator.logic.logifunge', regex: /[&|~@NRX]/ },

      // ── Exponents ──
      { token: 'keyword.operator.exponent.logifunge', regex: /[PQ]/ },

      // ── Elbow redirect ──
      { token: 'support.function.redirect.logifunge', regex: /E/ },

      // ── Memory ──
      { token: 'variable.parameter.memory.logifunge', regex: /[MSL]/ },

      // ── Output ──
      { token: 'constant.character.output.logifunge', regex: /[.=,']/ },

      // ── Control flow / end ──
      { token: 'keyword.control.flow.logifunge', regex: /[_!gp%]/ },

      // ── Subroutine return ──
      { token: 'keyword.control.subroutine.logifunge', regex: /r/ },

      // ── For-loop index push ──
      { token: 'keyword.control.forloop.logifunge', regex: /G/ },

      // ── Digits (single-cell push) ──
      { token: 'constant.numeric.logifunge', regex: /[0-9]/ },

      // ── Stack manipulation ──
      { token: 'keyword.operator.stack.logifunge', regex: /[:\\$W+\-*\/lUAsmo]/ },

      // ── Whitespace (no-op cell) ──
      { token: 'text', regex: /\s+/ },

      // ── Anything else ──
      { token: 'invalid.illegal.logifunge', regex: /./ }
    ],

    // State for contents of "..."
    string: [
      { token: 'string.logifunge', regex: /"/, next: 'start' },
      { token: 'string.logifunge', regex: /[^"]+/ }
    ],

    // State for contents of ---! ... !---
    block_comment: [
      {
        token: 'comment.block.logifunge',
        regex: /^!---$/,
        next: 'start'
      },
      {
        defaultToken: 'comment.block.logifunge'
      }
    ]
  };
};

oop.inherits(LogifungeHighlightRules, TextHighlightRules);
exports.LogifungeHighlightRules = LogifungeHighlightRules;
});

define('ace/mode/logifunge', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextMode = require('./text').Mode;
var LogifungeHighlightRules = require('./logifunge_highlight_rules').LogifungeHighlightRules;

var Mode = function() {
  this.HighlightRules = LogifungeHighlightRules;
  this.$behaviour = this.$defaultBehaviour;
};
oop.inherits(Mode, TextMode);

(function() {
  this.lineCommentStart = '--'; // Updated from ; to --
  this.$id = 'ace/mode/logifunge';
}).call(Mode.prototype);

exports.Mode = Mode;
});