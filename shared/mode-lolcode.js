/**
 * Ace Editor custom syntax mode for LOLCODE.
 *
 * Unlike brainfrick/malbolge (single-character opcodes), LOLCODE's
 * vocabulary is multi-character words, so this mode colors keywords by
 * the same grouping the run page's active-cell highlight follows —
 * see interpreters/interpreter_vlolcode.js for the token-per-word
 * execution model this mirrors:
 *
 *   program       HAI / KTHXBYE — start/end
 *   decl          I HAS A / ITZ / R / IS NOW A / AN — declare, assign, cast
 *   conditional   O RLY? / YA RLY / MEBBE / NO WAI / OIC
 *   switch        WTF? / OMG / OMGWTF
 *   loop          IM IN YR / UPPIN / NERFIN / TIL / WILE / IM OUTTA YR
 *   function      HOW IZ I / IF U SAY SO / FOUND YR / GTFO
 *   logic         BOTH SAEM / BOTH OF / EITHER OF / WON OF / NOT / ALL OF /
 *                 ANY OF / DIFFRINT / MKAY
 *   math          SUM OF / DIFF OF / PRODUKT OF / QUOSHUNT OF / MOD OF /
 *                 BIGGR OF / SMALLR OF / OF
 *   cast          SMOOSH / MAEK
 *   type          NUMBR / NUMBAR / YARN / TROOF / NOOB
 *   literal       WIN / FAIL / IT
 *   io            VISIBLE / GIMMEH
 *   string        "..." (with :) :> :o :: escapes)
 *   number        bare digits, optionally signed/decimal
 *   comment       BTW to end of line, OBTW ... TLDR block
 *   identifier    anything else bare — a variable or function name
 */
define('ace/mode/lolcode_highlight_rules', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextHighlightRules = require('./text_highlight_rules').TextHighlightRules;

var LolcodeHighlightRules = function() {

  this.$rules = {
    start: [
      // ── Block comment: OBTW ... TLDR ──
      { token: 'comment.block.lolcode', regex: /\bOBTW\b/, next: 'blockComment' },

      // ── Line comment: BTW to end of line ──
      { token: 'comment.line.lolcode', regex: /\bBTW\b.*$/ },

      // ── Strings ──
      { token: 'string.lolcode', regex: /"(?:[^"\n]|:.)*"?/ },

      // ── Numbers (bare digits, optionally signed/decimal) ──
      { token: 'constant.numeric.lolcode', regex: /-?\d+(?:\.\d+)?/ },

      // ── Program delimiters: HAI / KTHXBYE ──
      { token: 'keyword.other.program.lolcode', regex: /\b(?:HAI|KTHXBYE)\b/ },

      // ── Declaration / assignment / cast: I HAS A / ITZ / R / IS NOW A / AN ──
      { token: 'variable.parameter.decl.lolcode', regex: /\b(?:I|HAS|A|AN|ITZ|R|IS|NOW)\b/ },

      // ── Conditionals: O RLY? / YA RLY / MEBBE / NO WAI / OIC ──
      { token: 'keyword.control.conditional.lolcode', regex: /\b(?:O|RLY|YA|MEBBE|NO|WAI|OIC)\b/ },

      // ── Switch: WTF? / OMG / OMGWTF ──
      { token: 'keyword.control.switch.lolcode', regex: /\b(?:WTF|OMG|OMGWTF)\b/ },

      // ── Loops: IM IN YR / UPPIN / NERFIN / TIL / WILE / IM OUTTA YR ──
      { token: 'keyword.control.loop.lolcode', regex: /\b(?:IM|IN|YR|OUTTA|UPPIN|NERFIN|TIL|WILE)\b/ },

      // ── Functions / flow control: HOW IZ I / IF U SAY SO / FOUND YR / GTFO ──
      { token: 'keyword.control.function.lolcode', regex: /\b(?:HOW|IZ|IF|SAY|SO|FOUND|GTFO)\b/ },

      // ── Boolean / comparison operators ──
      { token: 'keyword.operator.logic.lolcode', regex: /\b(?:BOTH|SAEM|EITHER|WON|NOT|ALL|ANY|DIFFRINT|MKAY)\b/ },

      // ── Math operators ──
      { token: 'keyword.operator.math.lolcode', regex: /\b(?:SUM|DIFF|PRODUKT|QUOSHUNT|MOD|BIGGR|SMALLR|OF)\b/ },

      // ── String concat / casting: SMOOSH / MAEK ──
      { token: 'support.function.cast.lolcode', regex: /\b(?:SMOOSH|MAEK)\b/ },

      // ── Types: NUMBR / NUMBAR / YARN / TROOF / NOOB ──
      { token: 'support.type.lolcode', regex: /\b(?:NUMBR|NUMBAR|YARN|TROOF|NOOB)\b/ },

      // ── Literal constants: WIN / FAIL / IT ──
      { token: 'constant.language.lolcode', regex: /\b(?:WIN|FAIL|IT)\b/ },

      // ── I/O: VISIBLE / GIMMEH ──
      { token: 'support.function.io.lolcode', regex: /\b(?:VISIBLE|GIMMEH)\b/ },

      // ── Punctuation: ? ! , ──
      { token: 'punctuation.lolcode', regex: /[?!,]/ },

      // ── Bare identifiers — variable or function names ──
      { token: 'entity.name.variable.lolcode', regex: /[A-Za-z_][A-Za-z0-9_]*/ },

      { token: 'text', regex: /\s+/ }
    ],
    blockComment: [
      { token: 'comment.block.lolcode', regex: /\bTLDR\b/, next: 'start' },
      { token: 'comment.block.lolcode', regex: /.*$/ }
    ]
  };
};

oop.inherits(LolcodeHighlightRules, TextHighlightRules);
exports.LolcodeHighlightRules = LolcodeHighlightRules;
});

define('ace/mode/lolcode', function(require, exports) {
"use strict";

var oop = require('../lib/oop');
var TextMode = require('./text').Mode;
var LolcodeHighlightRules = require('./lolcode_highlight_rules').LolcodeHighlightRules;

var Mode = function() {
  this.HighlightRules = LolcodeHighlightRules;
  this.$behaviour = this.$defaultBehaviour;
};
oop.inherits(Mode, TextMode);

(function() {
  this.$id = 'ace/mode/lolcode';
}).call(Mode.prototype);

exports.Mode = Mode;
});
