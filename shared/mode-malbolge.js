/**
 * Ace Editor custom syntax mode for MALBOLGE.
 *
 * Malbolge's instruction set is position-dependent — the same source
 * character means something different depending on where it lands
 * (opcode = (address + character code) mod 94), and the source is
 * enciphered in place as it runs. A static highlighter can't know
 * what a character actually does without simulating the whole
 * program, so this draws a line at what's visible from the text
 * alone:
 *
 *   opcode      i j p / < > o v *  — the eight characters that are
 *               themselves valid, un-enciphered instruction names
 *               (the ones documented in the language spec), which
 *               also happen to be the letters most hand-written
 *               Malbolge relies on
 *   ciphertext  any other printable ASCII 33-126 — still a valid
 *               instruction at *some* address, just not one of the
 *               eight canonical spellings
 *   comment     whitespace — skipped entirely at load time and
 *               doesn't occupy a memory word
 *   invalid     anything outside printable ASCII 33-126 — a
 *               load-time error per the spec
 */
define('ace/mode/malbolge_highlight_rules', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextHighlightRules = require('./text_highlight_rules').TextHighlightRules;

var MalbolgeHighlightRules = function() {

  this.$rules = {
    start: [
      // ── Canonical, un-enciphered opcode letters: i j p / < > o v * ──
      { token: 'keyword.operator.opcode.malbolge', regex: /[ijpov*\/<>]/ },

      // ── Whitespace (skipped at load time, no memory word) ──
      { token: 'comment.line.malbolge', regex: /\s+/ },

      // ── Any other printable ASCII 33-126: valid ciphertext at
      //    some address, just not one of the eight bare opcodes ──
      { token: 'text.ciphertext.malbolge', regex: /[\x21-\x7e]/ },

      // ── Outside printable ASCII 33-126: load-time error ──
      { token: 'invalid.illegal.malbolge', regex: /./ }
    ]
  };
};

oop.inherits(MalbolgeHighlightRules, TextHighlightRules);
exports.MalbolgeHighlightRules = MalbolgeHighlightRules;
});

define('ace/mode/malbolge', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextMode = require('./text').Mode;
var MalbolgeHighlightRules = require('./malbolge_highlight_rules').MalbolgeHighlightRules;

var Mode = function() {
  this.HighlightRules = MalbolgeHighlightRules;
  this.$behaviour = this.$defaultBehaviour;
};
oop.inherits(Mode, TextMode);

(function() {
  this.$id = 'ace/mode/malbolge';
}).call(Mode.prototype);

exports.Mode = Mode;
});
