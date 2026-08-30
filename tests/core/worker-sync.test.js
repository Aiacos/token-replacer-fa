/**
 * Worker/main-thread duplication tests.
 *
 * A classic Web Worker cannot share ES module imports with the page, so several
 * functions exist twice — once in the module and once in IndexWorker.js — each
 * marked `SYNC: Keep in sync with ...`. Nothing enforced that marker, and the
 * copies had already drifted: the worker counted a term for every category it
 * was listed under and broke ties by declaration order, while the main thread
 * kept only one category per term and broke ties by scan order. The same image
 * library produced different categories depending on whether the worker was
 * available.
 *
 * Comparing sources is blunt, but it fails on exactly the edit that causes the
 * drift, which no behavioural test of a single copy can do.
 *
 * @module tests/core/worker-sync
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const INDEX = 'scripts/services/IndexService.js';
const WORKER = 'scripts/workers/IndexWorker.js';
const UTILS = 'scripts/core/Utils.js';

const sources = Object.fromEntries(
  [INDEX, WORKER, UTILS].map((file) => [file, readFileSync(file, 'utf8')])
);

/**
 * Extract a top-level declaration together with the JSDoc block above it, which
 * is where the SYNC marker lives.
 * @param {string} source - File contents
 * @param {string} name - Function or constant name
 * @returns {string|null} The declaration, or null when absent
 */
function extractDeclaration(source, name) {
  const start = [`function ${name}(`, `const ${name} =`]
    .map((pattern) => source.indexOf(pattern))
    .find((index) => index !== -1);
  if (start === undefined) return null;

  const docStart = source.lastIndexOf('/**', start);
  const from = docStart === -1 ? start : docStart;
  // Top-level declarations in these files close in column zero.
  const end = ['\n}\n', '\n]);\n'].reduce((closest, terminator) => {
    const index = source.indexOf(terminator, start);
    return index === -1 ? closest : Math.min(closest, index + terminator.length);
  }, Infinity);
  return end === Infinity ? null : source.slice(from, end);
}

/**
 * Normalize a declaration so only its logic is compared: the SYNC marker names
 * the *other* file and therefore legitimately differs between copies.
 * @param {string} code - Declaration source
 * @returns {string} Comparable source
 */
const normalize = (code) =>
  code
    .replace(/SYNC: Keep in sync with [^\n*]*/g, 'SYNC')
    .replace(/\s+/g, ' ')
    .trim();

/** Copies that must match character for character: nothing forces them apart. */
const IDENTICAL = [
  { name: 'compileCategorizer', files: [INDEX, WORKER] },
  { name: 'categorizeWith', files: [INDEX, WORKER] },
];

/**
 * Copies that legitimately differ — the worker's `isExcludedPath` takes the
 * excluded folders as arguments because it cannot import Constants.js — but
 * whose marker must still point a reader at the other copy.
 */
const MARKED_ONLY = [
  { name: 'isExcludedPath', files: [UTILS, WORKER] },
  { name: 'CDN_SEGMENTS', files: [UTILS, WORKER] },
  { name: 'loadFuse', files: [UTILS, WORKER] },
  { name: '_validateFuseShape', files: [UTILS, WORKER] },
];

describe('duplicated worker logic', () => {
  for (const { name, files } of IDENTICAL) {
    it(`${name}() is identical in both copies`, () => {
      const copies = files.map((file) => {
        const code = extractDeclaration(sources[file], name);
        expect(code, `${name}() not found in ${file}`).toBeTruthy();
        return normalize(code);
      });

      expect(copies[1], `${files[1]} has drifted from ${files[0]}`).toBe(copies[0]);
    });
  }

  for (const { name, files } of [...IDENTICAL, ...MARKED_ONLY]) {
    it(`${name} carries the SYNC marker in both copies`, () => {
      for (const file of files) {
        const code = extractDeclaration(sources[file], name) ?? '';
        // The marker is what tells the next reader to change both copies.
        expect(code, `${file} is missing the SYNC marker on ${name}`).toMatch(
          /SYNC: Keep in sync with/
        );
      }
    });
  }
});
