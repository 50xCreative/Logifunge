/**
 * Ace Editor custom syntax mode for BRAINFRICK (standard Brainfuck).
 *
 * Each of the eight commands gets its own token, so each one gets its
 * own color in the theme rather than sharing a color with its pair:
 *   >   move-right
 *   <   move-left
 *   +   increment
 *   -   decrement
 *   [   loop-start
 *   ]   loop-end
 *   .   output
 *   ,   input
 *   comment     anything else — per the Brainfuck spec, any character
 *               that isn't one of the eight commands above is ignored
 *               at runtime, so it's treated as free-form commentary
 */
define('ace/mode/brainfrick_highlight_rules', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextHighlightRules = require('./text_highlight_rules').TextHighlightRules;

var BrainfrickHighlightRules = function() {

  this.$rules = {
    start: [
      // ── Movement: > < — each direction its own token ──
      { token: 'support.function.moveright.brainfrick', regex: />/ },
      { token: 'support.function.moveleft.brainfrick', regex: /</ },

      // ── Math: + - — each op its own token ──
      { token: 'keyword.operator.increment.brainfrick', regex: /\+/ },
      { token: 'keyword.operator.decrement.brainfrick', regex: /-/ },

      // ── Loop: [ ] — start/end their own token ──
      { token: 'keyword.control.loopstart.brainfrick', regex: /\[/ },
      { token: 'keyword.control.loopend.brainfrick', regex: /\]/ },

      // ── Output: . ──
      { token: 'constant.character.output.brainfrick', regex: /\./ },

      // ── Input: , ──
      { token: 'support.function.input.brainfrick', regex: /,/ },

      // ── Whitespace ──
      { token: 'text', regex: /\s+/ },

      // ── Everything else is commentary (ignored at runtime) ──
      { token: 'comment.line.brainfrick', regex: /[^<>+\-\[\].,\s]+/ }
    ]
  };
};

oop.inherits(BrainfrickHighlightRules, TextHighlightRules);
exports.BrainfrickHighlightRules = BrainfrickHighlightRules;
});

define('ace/mode/brainfrick', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextMode = require('./text').Mode;
var BrainfrickHighlightRules = require('./brainfrick_highlight_rules').BrainfrickHighlightRules;

var Mode = function() {
  this.HighlightRules = BrainfrickHighlightRules;
  this.$behaviour = this.$defaultBehaviour;
};
oop.inherits(Mode, TextMode);

(function() {
  this.$id = 'ace/mode/brainfrick';
}).call(Mode.prototype);

exports.Mode = Mode;
});