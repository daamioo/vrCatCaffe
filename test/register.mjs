// node --import ./test/register.mjs <test>  — headless Three.js: import-map hook + DOM stubs.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);

// Canvas stub: a 2D context whose every method is a no-op (measureText returns a width).
const ctxProxy = () => new Proxy({}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (prop === 'measureText') return (t) => ({ width: String(t).length * 10 });
    if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop() {} });
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return () => {};
  },
  set(target, prop, v) { target[prop] = v; return true; },
});
const makeCanvas = () => ({ width: 300, height: 150, style: {}, getContext: () => ctxProxy(), addEventListener() {}, toDataURL: () => '' });
globalThis.document ??= { createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, addEventListener() {}, appendChild() {} }), createElementNS: () => makeCanvas() };
globalThis.window ??= globalThis;
globalThis.window.addEventListener ??= () => {};

// Deterministic randomness for the tests: cat behaviour and the tests themselves use
// Math.random, so a fixed sequence (reset for every world built) makes runs repeatable.
let seed = 1;
globalThis.__resetRandom = (s = 12345) => { seed = s; };
Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
globalThis.__resetRandom();
