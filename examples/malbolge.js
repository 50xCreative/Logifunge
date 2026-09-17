const examples = [
  {
    name: 'Hello, World!',
    mode: 'text',
    desc: 'The canonical Malbolge "Hello, world!" program — the first one ever written, found in 1999 by Andrew Cooke\u2019s beam-search program rather than by hand, since writing Malbolge directly is close to impossible',
    code: '(=<`#9]~6ZY327Uv4-QsqpMn&+Ij"\'E%e{Ab~w=_:]Kw%o44Uqp0/Q?xNvL:`H%c#DD2^WV>gY;dts76qKJImZkj',
    expectedOutput: { text: 'Hello, world.' }
  },
  {
    name: 'Hello!',
    mode: 'text',
    desc: 'A shorter, later "Hello!" program — a good one to step through instruction-by-instruction, since every step still lands inside the loaded source instead of wandering off into the crazy-filled memory beyond it',
    code: "(=<`#9]76Z{z2V0/S-Qr*)M:,+*)('&%$#\"!~}|{z(Kw%$t\"Vq0iAm,,j<h'`%",
    expectedOutput: { text: 'Hello!\n' }
  },
  {
    name: 'Truth Machine',
    mode: 'text',
    desc: "Reads one character from the Input field (top bar). Given '0' it prints 0 and halts cleanly. Given '1' it should loop printing 1 forever \u2014 per the language spec, a Malbolge program that reads an undefined value hangs on the reference interpreter rather than erroring, and the '1' branch here depends on exactly that quirk, so this strict, spec-literal engine reports an error after the first '1' instead of hanging. Set Input to 0 or 1 before running",
    code: '(aONMLKJIHGFEDCBA@?>=<;:98765FD21dd!-,O*)y\'&v5#"!DC|Qzf,*vutsrqpF!Clk|ih\ngfed9(T&6KoOHZYXWVUTSRQPONM]KJIHGFEDCBA@?>=<;:9876"\'~g|edybav_zyxwvotsrq\npSnPlOjibKfedcba`_XA??ZYRW:UTSLQ3ONMLK.IHGFE>CBA@?"=<;:38765432s0/.n,+*)\nj!&%f{"!~}|_zyxZvYnsrqpRnmlkjML:f_^GF!',
    expectedOutput: { text: "0 (with Input set to '0')" }
  },
  {
    name: 'Minimal Halt',
    mode: 'text',
    desc: "The smallest possible Malbolge program: one character. 'Q' is 81 in ASCII, and (0 + 81) mod 94 = 81, which is the halt opcode \u2014 so this loads at address 0, executes once, and stops immediately with no output. A good starting point for watching the Stacks/Memory panel before writing anything more ambitious",
    code: 'Q',
    expectedOutput: { text: '(none \u2014 halts immediately)' }
  }
];

if (typeof module !== 'undefined') {
  module.exports = examples;
}

if (typeof window !== 'undefined') {
  window.examples = examples;
}
