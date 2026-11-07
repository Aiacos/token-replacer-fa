/**
 * Runs the real IndexWorker source in a sandbox, because the term-index builder
 * lives only there and a source-text comparison cannot catch a runtime throw.
 *
 * @module tests/core/IndexWorker.terms
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * Load the worker and return a function that runs one command to completion.
 * @returns {(message: object) => Promise<object>} Resolves with the final message
 */
function loadWorker() {
  let onMessage;
  let settle;
  const self = {
    addEventListener: (type, fn) => {
      if (type === 'message') onMessage = fn;
    },
    postMessage: (msg) => {
      if (['complete', 'error', 'cancelled'].includes(msg.type)) settle(msg);
    },
  };
  const context = vm.createContext({ self, console, setTimeout, Object, Set, Map, Array });
  vm.runInContext(readFileSync('scripts/workers/IndexWorker.js', 'utf8'), context);
  return (message) =>
    new Promise((resolve) => {
      settle = resolve;
      onMessage({ data: message });
    });
}

describe('IndexWorker termIndex', () => {
  it('indexes a path containing a term named like an Object.prototype member', async () => {
    const run = loadWorker();
    const path = 'FA_Pack/Tokens/constructor/Goblin_01.webp';

    const reply = await run({
      command: 'indexPaths',
      data: {
        paths: [path],
        creatureTypeMappings: { humanoid: ['goblin'] },
        excludedFolders: [],
        excludedFilenameTerms: [],
      },
    });

    expect(reply.type).toBe('complete');
    expect(reply.result.termIndex.constructor).toEqual([0]);
    expect(reply.result.termIndex.goblin).toEqual([0]);
  });
});
