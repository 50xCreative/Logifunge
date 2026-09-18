Pyodide 0.26.4 runtime files, served from this site so the Python engine
(interpreters/interpreter_vpython.js) doesn't depend on a CDN at run time.

Source: the official `pyodide@0.26.4` npm package (registry.npmjs.org).
Only the core runtime is included: pyodide.js, pyodide.asm.js,
pyodide.asm.wasm, python_stdlib.zip, pyodide-lock.json. The Python standard
library works; extra packages (numpy, etc.) are NOT included.

To upgrade: put the new version's files in a new pyodide/<version>/ folder,
then update PYODIDE_VERSION in interpreters/interpreter_vpython.js and the
path in _headers.
