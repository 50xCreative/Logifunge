const examples = [
  {
    name: 'Hello World',
    mode: 'text',
    desc: 'Plain Python — print() writes straight to the Text output view',
    code: 'print("Hello, World!")',
    expectedOutput: { text: 'Hello, World!\n' }
  },
  {
    name: 'Loops & f-strings',
    mode: 'text',
    desc: 'A standard for-loop building formatted output, just like any other Python runtime',
    code: 'for i in range(5):\n    print(f"square of {i} is {i * i}")',
    expectedOutput: { text: 'square of 0 is 0\nsquare of 1 is 1\nsquare of 2 is 4\nsquare of 3 is 9\nsquare of 4 is 16\n' }
  },
  {
    name: 'Fibonacci',
    mode: 'text',
    desc: 'A short recursive function — Pyodide runs this as real, unmodified CPython',
    code: 'def fib(n):\n    return n if n < 2 else fib(n - 1) + fib(n - 2)\n\nprint([fib(i) for i in range(10)])',
    expectedOutput: { text: '[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n' }
  },
  {
    name: 'Echo Input',
    mode: 'text',
    desc: "Reads one line at a time with input(). Set the Input field (top bar) before running — each line becomes one input() call, in order",
    code: 'name = input("name: ")\nprint(f"hello, {name}!")',
    expectedOutput: { text: '(depends on the Input field)' }
  },
  {
    name: 'Standard Library',
    mode: 'text',
    desc: 'Pyodide ships the Python standard library, so modules like json and math work out of the box',
    code: 'import json, math\nprint(json.dumps({"pi": round(math.pi, 4)}))',
    expectedOutput: { text: '{"pi": 3.1416}\n' }
  },
  {
    name: 'Uncaught Error',
    mode: 'text',
    desc: 'An unhandled exception prints a normal Python traceback to the output, same as a real terminal',
    code: 'print("before the crash")\nresult = 1 / 0\nprint("never reached")',
    expectedOutput: { text: 'before the crash\n(followed by a ZeroDivisionError traceback)' }
  }
];

if (typeof module !== 'undefined') {
  module.exports = examples;
}

if (typeof window !== 'undefined') {
  window.examples = examples;
}
