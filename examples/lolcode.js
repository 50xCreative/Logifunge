const examples = [
  {
    name: 'Hello World',
    mode: 'text',
    desc: 'HAI opens the program, VISIBLE prints a value plus a trailing newline, KTHXBYE ends it',
    code: 'HAI 1.2\nVISIBLE "HELLO WORLD!"\nKTHXBYE',
    expectedOutput: { text: 'HELLO WORLD!\n' }
  },
  {
    name: 'Variables & Math',
    mode: 'text',
    desc: 'I HAS A ITZ declares a variable with a starting value; SUM OF ... AN ... is the prefix-style add',
    code: 'HAI 1.2\nI HAS A X ITZ 5\nI HAS A Y ITZ 10\nVISIBLE SUM OF X AN Y\nKTHXBYE',
    expectedOutput: { text: '15\n' }
  },
  {
    name: 'Conditionals',
    mode: 'text',
    desc: 'A bare expression statement sets IT, then O RLY? branches on it with YA RLY / NO WAI / OIC',
    code: 'HAI 1.2\nI HAS A AGE ITZ 20\nBOTH SAEM AGE AN 20\nO RLY?\n    YA RLY\n        VISIBLE "TWENTY!"\n    NO WAI\n        VISIBLE "NOT TWENTY"\nOIC\nKTHXBYE',
    expectedOutput: { text: 'TWENTY!\n' }
  },
  {
    name: 'Loop',
    mode: 'text',
    desc: 'IM IN YR ... UPPIN YR ... TIL ... / IM OUTTA YR — a counting loop that prints each value',
    code: 'HAI 1.2\nI HAS A COUNT ITZ 0\nIM IN YR LOOP UPPIN YR COUNT TIL BOTH SAEM COUNT AN 5\n    VISIBLE COUNT\nIM OUTTA YR LOOP\nKTHXBYE',
    expectedOutput: { text: '0\n1\n2\n3\n4\n' }
  },
  {
    name: 'Recursion',
    mode: 'text',
    desc: 'HOW IZ I ... IF U SAY SO defines a function; FOUND YR returns; I IZ ... MKAY calls it, recursively here',
    code: 'HAI 1.2\nHOW IZ I FACTORIAL YR N\n    BOTH SAEM N AN 0\n    O RLY?\n        YA RLY\n            FOUND YR 1\n        NO WAI\n            FOUND YR PRODUKT OF N AN I IZ FACTORIAL YR DIFF OF N AN 1 MKAY\n    OIC\nIF U SAY SO\nVISIBLE I IZ FACTORIAL YR 5 MKAY\nKTHXBYE',
    expectedOutput: { text: '120\n' }
  },
  {
    name: 'Echo Input',
    mode: 'text',
    desc: "GIMMEH reads one line into a variable. The run pauses there — type your answer in the terminal and press Enter",
    code: 'HAI 1.2\nI HAS A NAME\nGIMMEH NAME\nVISIBLE "HAI " AN NAME\nKTHXBYE',
    expectedOutput: { text: '(depends on what you type)' }
  }
];

if (typeof module !== 'undefined') {
  module.exports = examples;
}

if (typeof window !== 'undefined') {
  window.examples = examples;
}
