const examples = [
  {
    name: 'AND Gate Truth Table',
    mode: 'text',
    desc: 'All four input combos through AND',
    code: '00&.01&.10&.11&.%',
    expectedOutput: { text: '0 0 0 1' }
  },
  {
    name: 'XOR Gate',
    mode: 'text',
    desc: 'XOR truth table',
    code: '00@.01@.10@.11@.%',
    expectedOutput: { text: '0 1 1 0' }
  },
  {
    name: 'Half Adder',
    mode: 'text',
    desc: 'Sum (XOR) and carry (AND) for 1+1',
    code: '11::@.\\&.%',
    expectedOutput: { text: '0 1' }
  },
  {
    name: 'NOT Loop',
    mode: 'text',
    desc: 'Repeated NOT on 0 produces four ones',
    code: '0~1&.~1&.~1&.~1&.%',
    expectedOutput: { text: '1 1 1 1' }
  },
  {
    name: 'NAND Universality',
    mode: 'text',
    desc: 'AND built from NAND: NAND(NAND(a,b), NAND(a,b)). Push a and b, NAND them, duplicate the result, NAND again.',
    code: '11N:N.%',
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
    code: "001,111,00'.11'.%",
    expectedOutput: {
      pixels: [
        { x: 0, y: 0, on: true, value: 1 },
        { x: 1, y: 1, on: true, value: 1 }
      ]
    }
  },
  {
    name: 'Memory Pointer Demo',
    mode: 'text',
    desc: 'Store and load through a memory pointer using M/S/L',
    code: '5M7SL.%',
    expectedOutput: { text: '7' }
  },
  {
    name: 'For Loop: index counter',
    mode: 'text',
    desc: 'For loop runs 5 times; G pushes the current index each pass (no pop needed at the end label)',
    code: '5([i]G.)[i]%',
    expectedOutput: { text: '0 1 2 3 4' }
  },
  {
    name: 'Pow & Nth Root',
    mode: 'text',
    desc: '2^10 with P, then the cube root of 27 with Q',
    code: '2[10]P.[27]3Q.%',
    expectedOutput: { text: '1024 3' }
  },
  {
    name: 'Elbow Redirect',
    mode: 'text',
    desc: 'E turns 90° clockwise on a popped 0, else keeps going straight',
    code: '90E\n  .\n  %',
    expectedOutput: { text: '9' }
  },
  {
    name: 'Echo Input',
    mode: 'text',
    desc: 'I reads a line from the terminal and pushes every character (first on top). Type a line and press Enter; the loop prints it back',
    code: 'Il([p]=)[p]%',
    expectedOutput: { text: '(whatever you type in the terminal)' }
  }
];

if (typeof module !== 'undefined') {
  module.exports = examples;
}

if (typeof window !== 'undefined') {
  window.examples = examples;
}
