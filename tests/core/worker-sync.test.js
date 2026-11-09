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
const FUSE_LOADER = 'scripts/core/FuseLoader.js';
const PATH_FILTER = 'scripts/core/PathFilter.js';

const sources = Object.fromEntries(
  [INDEX, WORKER, FUSE_LOADER, PATH_FILTER].map((file) => [file, readFileSync(file, 'utf8')])
);

/**
 * Extract a declaration together with the JSDoc block above it, which is where
 * the SYNC marker lives. Handles top-level functions and constants (closing in
 * column zero) and class methods (closing at two-space indent).
 * @param {string} source - File contents
 * @param {string} name - Function, constant or method name
 * @returns {string|null} The declaration, or null when absent
 */
function extractDeclaration(source, name) {
  const forms = [
    { pattern: `\nfunction ${name}(`, terminators: ['\n}\n'] },
    { pattern: `\nasync function ${name}(`, terminators: ['\n}\n'] },
    { pattern: `\nconst ${name} =`, terminators: ['\n]);\n', '\n}\n'] },
    { pattern: `\n  ${name}(`, terminators: ['\n  }\n'] },
    { pattern: `\n  async ${name}(`, terminators: ['\n  }\n'] },
    { pattern: `\n  static ${name}(`, terminators: ['\n  }\n'] },
  ];
  for (const { pattern, terminators } of forms) {
    const start = source.indexOf(pattern);
    if (start === -1) continue;

    const docStart = source.lastIndexOf('/**', start);
    const from = docStart === -1 ? start : docStart;
    const end = terminators.reduce((closest, terminator) => {
      const index = source.indexOf(terminator, start + 1);
      return index === -1 ? closest : Math.min(closest, index + terminator.length);
    }, Infinity);
    return end === Infinity ? null : source.slice(from, end);
  }
  return null;
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
 * Copies that legitimately differ — the main-thread side is now a class
 * (PathFilter, FuseLoader) holding its cache as instance state, and the worker
 * receives its configuration as arguments because it cannot import
 * Constants.js — but whose marker must still point a reader at the other copy.
 * Each entry pairs `[file, declaration name]`, since the names differ too.
 */
const MARKED_ONLY = [
  {
    label: 'isExcludedPath',
    copies: [
      [PATH_FILTER, 'isExcluded'],
      [WORKER, 'isExcludedPath'],
    ],
  },
  {
    label: 'CDN_SEGMENTS',
    copies: [
      [PATH_FILTER, 'CDN_SEGMENTS'],
      [WORKER, 'CDN_SEGMENTS'],
    ],
  },
  {
    label: 'loadFuse',
    copies: [
      [FUSE_LOADER, 'load'],
      [WORKER, 'loadFuse'],
    ],
  },
  {
    label: '_validateFuseShape',
    copies: [
      [FUSE_LOADER, '_validateFuseShape'],
      [WORKER, '_validateFuseShape'],
    ],
  },
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

  const marked = [
    ...IDENTICAL.map(({ name, files }) => ({
      label: name,
      copies: files.map((file) => [file, name]),
    })),
    ...MARKED_ONLY,
  ];
  for (const { label, copies } of marked) {
    it(`${label} carries the SYNC marker in both copies`, () => {
      for (const [file, name] of copies) {
        const code = extractDeclaration(sources[file], name);
        expect(code, `${name} not found in ${file}`).toBeTruthy();
        // The marker is what tells the next reader to change both copies.
        expect(code, `${file} is missing the SYNC marker on ${name}`).toMatch(
          /SYNC: Keep in sync with/
        );
      }
    });
  }

  for (const { label, copies } of marked) {
    it(`${label}'s SYNC markers name the file that holds the other copy`, () => {
      // A marker pointing at a deleted or renamed file sends the next reader
      // nowhere — exactly what happened when Utils.js was split into classes.
      for (const [file, name] of copies) {
        const code = extractDeclaration(sources[file], name) ?? '';
        const target = code.match(/SYNC: Keep in sync with (\S+\.js)/)?.[1];
        const others = copies.filter(([other]) => other !== file).map(([other]) => other);
        expect(
          others.map((other) => other.split('/').pop()),
          `${file} ${name}: marker names ${target}`
        ).toContain(target);
      }
    });
  }

  it('finds a class method, not just a top-level function', () => {
    // Guards the extractor itself: a pattern that silently matched nothing
    // would make every marker check above vacuous.
    const code = extractDeclaration(sources[PATH_FILTER], 'isExcluded');
    expect(code).toContain('isExcluded(path) {');
    expect(code).toContain('return result;');
    expect(code).not.toContain('_remember(path, excluded) {');
  });
});
