const examples = [
  {
    name: 'Hello World',
    mode: 'text',
    desc: 'The classic — builds ASCII values on nearby tape cells, then prints them out',
    code: '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.',
    expectedOutput: { text: 'Hello World!\n' }
  },
  {
    name: 'Cell Doubling',
    mode: 'text',
    desc: 'Loop ten times, adding ten to the next cell each pass, then print it as \'i\' (105)',
    code: '++++++++++[>++++++++++<-]>+++++.',
    expectedOutput: { text: 'i' }
  },
  {
    name: 'Echo Input',
    mode: 'text',
    desc: "Read a character with , and print it with . in a loop until input runs out. Set the Input field (top bar) before running — Brainfuck's , reads from it one character at a time",
    code: ',[.,]',
    expectedOutput: { text: '(whatever you type into Input)' }
  },
  {
    name: 'Move & Increment',
    mode: 'text',
    desc: 'Increment cell 0 to 65 (\'A\'), move right, increment cell 1 to 66 (\'B\'), print both',
    code: '+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.>++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.',
    expectedOutput: { text: 'AB' }
  },
  {
    name: 'Wraparound',
    mode: 'text',
    desc: 'Decrement an empty cell once — wraps 0 to 255, then prints it as ASCII 255',
    code: '-.',
    expectedOutput: { text: '\u00ff' }
  }
];

if (typeof module !== 'undefined') {
  module.exports = examples;
}

if (typeof window !== 'undefined') {
  window.examples = examples;
}
