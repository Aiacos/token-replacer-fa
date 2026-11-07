/**
 * Article XII, enforced: runtime code is object-oriented and names its pattern.
 *
 * Review alone let module-level helpers and state accumulate in Utils.js and
 * main.js for years; a scan makes the rule as cheap to keep as to state.
 *
 * @module tests/core/architecture
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Every runtime source file under scripts/. */
function sourceFiles(dir = 'scripts') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/**
 * Top-level functions Article XII.2 exempts: helpers duplicated byte-for-byte
 * across the worker boundary and pinned by worker-sync.test.js.
 */
const PINNED_FUNCTIONS = {
  'scripts/services/IndexService.js': ['compileCategorizer', 'categorizeWith'],
  'scripts/workers/IndexWorker.js': [
    'loadFuse',
    '_validateFuseShape',
    'compileCategorizer',
    'categorizeWith',
    'isExcludedPath',
  ],
};

const files = sourceFiles().map((file) => ({ file, source: readFileSync(file, 'utf8') }));

describe('Article XII — object-oriented runtime code', () => {
  it.each(files)('$file names the pattern of every exported class', ({ source }) => {
    const missing = [
      ...source.matchAll(/(\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*)?export (?:default )?class (\w+)/g),
    ]
      .filter(([, doc]) => !doc || !doc.includes('@pattern'))
      .map(([, , name]) => name);
    expect(missing).toEqual([]);
  });

  it.each(files)('$file keeps no mutable module-level state', ({ source }) => {
    expect(source.match(/^(?:let|var) \w+/gm) ?? []).toEqual([]);
  });

  it.each(files)(
    '$file declares no top-level functions beyond the pinned ones',
    ({ file, source }) => {
      const declared = [...source.matchAll(/^(?:export )?(?:async )?function (\w+)/gm)].map(
        ([, name]) => name
      );
      const allowed = PINNED_FUNCTIONS[file.split(path.sep).join('/')] ?? [];
      expect(declared.filter((name) => !allowed.includes(name))).toEqual([]);
    }
  );
});
