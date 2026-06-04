# cpuprofile-compare

A browser-based tool for loading multiple `.cpuprofile` files and comparing function-level CPU time side by side.

## Usage

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, then drag and drop two or more `.cpuprofile` files onto the page.

To create a production build:

```bash
npm run build
```

The output is written to `dist/`. Preview it locally with `npm run preview`.

## What you see

| Column | Description |
|---|---|
| **Function** | Function name (or `(anonymous)`) |
| **File : Line** | Source file and line number |
| **Self %** | % of total profile time spent exclusively in this function |
| **Total %** | % of total profile time where this function appeared anywhere in the call stack |
| **Total ms** | Absolute total time in milliseconds |
| **Δ Total %** | Difference in Total % between the 2nd and 1st profile (green = faster, red = slower) |

The delta column only appears when two or more profiles are loaded.

## Controls

- **Sort by** — order rows by Self %, Total %, Total ms, or delta
- **Filter** — search by function name or file path
- **Top N** — limit the number of rows shown
- **Hide idle / GC** — suppress `(idle)`, `(program)`, and `(garbage collector)` entries

## Generating profiles

From Node.js (using the built-in inspector):

```js
const inspector = require('inspector');
const fs = require('fs');
const session = new inspector.Session();
session.connect();

session.post('Profiler.enable', () => {
  session.post('Profiler.start', () => {
    // ... run the code you want to profile ...
    session.post('Profiler.stop', (err, { profile }) => {
      fs.writeFileSync('output.cpuprofile', JSON.stringify(profile));
      session.disconnect();
    });
  });
});
```

Chrome DevTools and the `--cpu-prof` Node.js flag also produce compatible files.

## Profile format

Standard V8 CPU profile JSON (`nodes`, `samples`, `timeDeltas`). Compatible with any `.cpuprofile` produced by Node.js, Chrome DevTools, or `clinic.js`.
