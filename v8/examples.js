const examples = [
  {
    name: 'AND Gate Truth Table',
    mode: 'text',
    desc: 'All four input combos through AND',
    code: '0 0 & . 0 1 & . 1 0 & . 1 1 & . %',
    expectedOutput: { text: '0 0 0 1' }
  },
  {
    name: 'XOR Gate',
    mode: 'text',
    desc: 'XOR truth table',
    code: '0 0 @ . 0 1 @ . 1 0 @ . 1 1 @ . %',
    expectedOutput: { text: '0 1 1 0' }
  },
  {
    name: 'Half Adder',
    mode: 'text',
    desc: 'Sum (XOR) and carry (AND) for 1+1',
    code: '1 1 : : @ . \\ & . %',
    expectedOutput: { text: '0 1' }
  },
  {
    name: 'NOT Loop',
    mode: 'text',
    desc: 'Repeated NOT on 0 produces four ones',
    code: '0 ~ 1 & . ~ 1 & . ~ 1 & . ~ 1 & . %',
    expectedOutput: { text: '1 1 1 1' }
  },
  {
    name: 'NAND Universality',
    mode: 'text',
    desc: 'AND built from NAND: NAND(NAND(a,b), NAND(a,b)). Push a and b, NAND them, duplicate the result, NAND again.',
    code: '1 1 N : N . %',
    expectedOutput: { text: '1' }
  },
  {
    name: 'Subroutine: increment',
    mode: 'text',
    desc: 'A small subroutine that increments a value and returns',
    code: '1 C[inc] . %D[inc]1+r',
    expectedOutput: { text: '2' }
  },
  {
    name: 'Loop: count down',
    mode: 'text',
    desc: 'Count from 5 to 1 using a loop',
    code: '>5{[count]:.1-:}[count]$%',
    expectedOutput: { text: '5 4 3 2 1' }
  },
  {
    name: 'ASCII Output',
    mode: 'text',
    desc: 'Print characters using = (pop value, output as ASCII). Spells "Hi!"',
    code: '[72]=[105]=[33]=%',
    expectedOutput: { text: 'Hi!' }
  },
  {
    name: 'Pixel Push/Pull Demo',
    mode: 'pixel',
    desc: "Write pixels with , then read them back with '",
    code: "0 0 1 , 1 1 1 , 0 0 ' . 1 1 ' . %",
    expectedOutput: {
      pixels: [
        { x: 0, y: 0, on: true, value: 1 },
        { x: 1, y: 1, on: true, value: 1 }
      ]
    }
  },
  {
    name: 'Pack/Unpack Stack Values',
    mode: 'text',
    desc: 'Pack five bits into one self-describing value, then unpack it back with no count needed',
    code: '0 0 0 0 1 5 ( ) . . . . . %',
    expectedOutput: { text: '1 0 0 0 0' }
  },
  {
    name: 'Memory Pointer Demo',
    mode: 'text',
    desc: 'Store and load through a memory pointer using M/S/L',
    code: '5 M 7 S L . %',
    expectedOutput: { text: '7' }
  },
  {
    name: 'Hello, Capitalism',
    mode: 'text',
    desc: 'Spells "AI" because the interpreter is contractually obligated to mention it once per session',
    code: '[65]=[73]=%',
    expectedOutput: { text: 'AI' }
  }
];

if (typeof module !== 'undefined') {
  module.exports = examples;
}

if (typeof window !== 'undefined') {
  window.examples = examples;
}
