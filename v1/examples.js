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
    desc: 'AND built from two NANDs',
    code: '1 1 : : N : : N . %',
    expectedOutput: { text: '1' }
  },
  {
    name: 'Subroutine: XOR via NAND',
    mode: 'text',
    desc: 'A small subroutine that increments a value and returns',
    code: '1 ;[inc] . %:[inc]1+r',
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
    name: 'Pixel Push/Pull Demo',
    mode: 'pixel',
    desc: 'Write pixels with , then read them back with \'',
    code: '0 0 1 , 1 1 1 , 0 0 \' . 1 1 \' . %',
    expectedOutput: {
      pixels: [
        { x: 0, y: 0, on: true, value: 1 },
        { x: 1, y: 1, on: true, value: 1 }
      ]
    }
  }
];

if (typeof module !== 'undefined') {
  module.exports = examples;
}

if (typeof window !== 'undefined') {
  window.examples = examples;
}
