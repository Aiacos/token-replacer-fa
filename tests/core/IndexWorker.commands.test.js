/**
 * IndexWorker command protocol tests.
 *
 * The worker is a classic script, so it runs here in a `node:vm` sandbox exactly
 * as the browser would load it. Everything is asserted through the messages it
 * posts back — the protocol IndexService and SearchOrchestrator consume — so the
 * suite pins behaviour across any restructuring of the worker's internals.
 *
 * Most historical worker bugs were lifecycle bugs (stale exclusion caches, a
 * cancel that could never be observed), which is what the lifecycle block pins.
 * The cancel test replaces an older source-text check for `await` inside the
 * indexing loop: it fails whenever the loop stops yielding, whatever the code
 * is called.
 *
 * @module tests/core/IndexWorker.commands
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const WORKER_SOURCE = readFileSync('scripts/workers/IndexWorker.js', 'utf8');
const TERMINAL = new Set(['complete', 'error', 'cancelled']);

/**
 * Collect what a worker scope posts and settle waiters on terminal messages.
 * @returns {{scope: object, messages: object[], settled: () => Promise<object>}}
 */
function createScope() {
  const messages = [];
  const waiters = [];
  const scope = {
    listener: null,
    addEventListener(type, fn) {
      if (type === 'message') scope.listener = fn;
    },
    postMessage(msg) {
      messages.push(msg);
      if (TERMINAL.has(msg.type) && waiters.length) waiters.shift()(msg);
    },
  };
  return {
    scope,
    messages,
    /** Resolves with the next terminal message. */
    settled: () => new Promise((resolve) => waiters.push(resolve)),
  };
}

/**
 * Load the real worker source into a fresh sandbox.
 * @returns {{post: (message: object) => void, settled: () => Promise<object>, messages: object[], context: object, log: object}}
 */
function loadWorker() {
  const { scope, messages, settled } = createScope();
  const log = { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() };
  const context = vm.createContext({ self: scope, console: log, setTimeout });
  vm.runInContext(WORKER_SOURCE, context);
  return {
    post: (message) => scope.listener({ data: message }),
    settled,
    messages,
    context,
    log,
  };
}

/** A valid indexPaths payload. */
const indexData = (paths, overrides = {}) => ({
  paths,
  creatureTypeMappings: { humanoid: ['goblin', 'orc'], beast: ['wolf'] },
  excludedFolders: [],
  excludedFilenameTerms: [],
  ...overrides,
});

/** `count` distinct token paths. */
const manyPaths = (count) =>
  Array.from({ length: count }, (_, i) => `FA_Pack/Tokens/Goblin_${i}.webp`);

describe('IndexWorker command dispatch', () => {
  it('answers ping with pong', () => {
    const worker = loadWorker();
    worker.post({ command: 'ping' });
    expect(worker.messages).toEqual([{ type: 'pong' }]);
  });

  it('reports an unknown command as an error and logs it', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({ command: 'reticulate' });

    expect(await done).toEqual({ type: 'error', message: 'Unknown command: reticulate' });
    expect(worker.log.warn).toHaveBeenCalledWith('IndexWorker: unknown command "reticulate"');
  });

  it('does not resolve a command name through Object.prototype', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({ command: 'toString' });

    expect(await done).toEqual({ type: 'error', message: 'Unknown command: toString' });
  });

  it('acknowledges setSearchIndex with the number of entries', () => {
    const worker = loadWorker();
    worker.post({ command: 'setSearchIndex', data: { index: [{ name: 'a' }, { name: 'b' }] } });
    worker.post({ command: 'setSearchIndex', data: { index: null } });

    expect(worker.messages).toEqual([
      { type: 'indexSet', count: 2 },
      { type: 'indexSet', count: 0 },
    ]);
  });

  it('turns a throwing synchronous handler into an error message', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    // setSearchIndex reads data.index, so a missing payload throws inside the handler.
    worker.post({ command: 'setSearchIndex' });

    const reply = await done;
    expect(reply.type).toBe('error');
    expect(worker.log.error).toHaveBeenCalled();
  });
});

describe('IndexWorker indexPaths', () => {
  it('builds categories, interned paths and progress at the documented cadence', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({ command: 'indexPaths', data: indexData(manyPaths(2500)) });
    const reply = await done;

    const progress = worker.messages.filter((m) => m.type === 'progress').map((m) => m.processed);
    expect(progress).toEqual([0, 1000, 2000, 2500]);
    expect(reply).toMatchObject({ type: 'complete', imagesFound: 2500, total: 2500 });
    expect(reply.result.pathList).toHaveLength(2500);
    expect(reply.result.categories.humanoid.goblin).toHaveLength(2500);
    expect(reply.result.categories.beast).toEqual({});
    expect(reply.result.allPaths[0]).toEqual({
      name: 'Goblin 0',
      category: 'humanoid',
      subcategories: ['goblin'],
    });
  });

  it('accepts {path, name} entries and skips duplicates and invalid entries', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({
      command: 'indexPaths',
      data: indexData([{ path: 'a/Wolf.webp', name: 'Dire Wolf' }, 'a/Wolf.webp', 42, null, '']),
    });
    const reply = await done;

    expect(reply.imagesFound).toBe(1);
    expect(reply.result.allPaths).toEqual([
      { name: 'Dire Wolf', category: 'beast', subcategories: ['wolf'] },
    ]);
  });

  it('rejects a malformed payload with an error message', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({ command: 'indexPaths', data: indexData('not-an-array') });

    expect(await done).toEqual({ type: 'error', message: 'paths must be an array' });
  });
});

describe('IndexWorker lifecycle', () => {
  it('stops an indexPaths run when cancel arrives mid-build', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    // Long enough that the build yields to the message queue before finishing.
    worker.post({ command: 'indexPaths', data: indexData(manyPaths(12000)) });
    worker.post({ command: 'cancel' });

    expect(await done).toEqual({ type: 'cancelled' });
    // Let any stray continuation run: none may report completion afterwards.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(worker.messages.some((m) => m.type === 'complete')).toBe(false);
  });

  it('does not carry a previous cancel into the next run', async () => {
    const worker = loadWorker();
    const cancelled = worker.settled();
    worker.post({ command: 'indexPaths', data: indexData(manyPaths(12000)) });
    worker.post({ command: 'cancel' });
    await cancelled;

    const done = worker.settled();
    worker.post({ command: 'indexPaths', data: indexData(manyPaths(10)) });
    expect(await done).toMatchObject({ type: 'complete', imagesFound: 10 });
  });

  it('applies each run its own exclusion settings', async () => {
    const worker = loadWorker();
    const paths = ['Tokens/props/Goblin.webp', 'Tokens/Wolf_tree.webp', 'Tokens/Orc.webp'];

    const first = worker.settled();
    worker.post({
      command: 'indexPaths',
      data: indexData(paths, { excludedFolders: ['props'], excludedFilenameTerms: ['tree'] }),
    });
    expect((await first).result.pathList).toEqual(['Tokens/Orc.webp']);

    // A re-index with relaxed settings must not reuse the first run's compiled rules.
    const second = worker.settled();
    worker.post({ command: 'indexPaths', data: indexData(paths) });
    expect((await second).result.pathList).toEqual(paths);
  });
});

describe('IndexWorker fuzzySearch failure paths', () => {
  it('validates its payload before loading Fuse', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({ command: 'fuzzySearch', data: { searchTerms: 'wolf', index: [], options: {} } });

    expect(await done).toEqual({ type: 'error', message: 'searchTerms must be an array' });
  });

  it('requires an index, persisted or inline', async () => {
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({ command: 'fuzzySearch', data: { searchTerms: ['wolf'], options: {} } });

    expect((await done).message).toMatch(/^index must be an array/);
  });

  it('reports a Fuse.js load failure as an error message', async () => {
    // The sandbox has no dynamic-import loader, so the CDN import fails offline.
    const worker = loadWorker();
    const done = worker.settled();
    worker.post({
      command: 'fuzzySearch',
      data: { searchTerms: ['wolf'], index: [{ name: 'wolf' }], options: { keys: ['name'] } },
    });

    const reply = await done;
    expect(reply.type).toBe('error');
    expect(reply.message).toMatch(/^Failed to load Fuse\.js: /);
    expect(worker.log.error).toHaveBeenCalled();
  });
});

/**
 * Minimal Fuse stand-in: substring match on `name`, score 0. Enough to observe
 * which index the worker searched and how it merges results.
 */
class FakeFuse {
  constructor(items, options) {
    this.items = items;
    this.options = options;
  }

  search(term) {
    return this.items
      .filter((item) => item.name.includes(term))
      .map((item) => ({ item, score: 0 }));
  }
}

/**
 * A runtime built from the worker's own class with an injected Fuse loader —
 * the sandbox cannot reach the CDN, and the tests must not.
 * @param {() => Promise<Function>} fuseLoader
 * @param {object} [context] - Sandbox to take the class from; a fresh one by default
 */
function loadRuntime(fuseLoader, context = loadWorker().context) {
  const { scope, messages, settled } = createScope();
  const Runtime = vm.runInContext('IndexWorkerRuntime', context);
  const runtime = new Runtime(scope, fuseLoader);
  return { handle: (message) => runtime.handle(message), messages, settled };
}

const searchOptions = { keys: ['name'] };

describe('IndexWorker fuzzySearch', () => {
  it('searches the persisted index and merges results by path', async () => {
    const loader = vi.fn(async () => FakeFuse);
    const runtime = loadRuntime(loader);
    runtime.handle({
      command: 'setSearchIndex',
      data: {
        index: [
          { path: 'a/Wolf.webp', name: 'wolf' },
          { path: 'a/Werewolf.webp', name: 'werewolf' },
          { path: 'a/Goblin.webp', name: 'goblin' },
        ],
      },
    });

    const done = runtime.settled();
    // No inline index: the persisted copy is what avoids re-cloning it per search.
    runtime.handle({
      command: 'fuzzySearch',
      data: { searchTerms: ['wolf', 'were'], options: searchOptions },
    });
    const reply = await done;

    expect(reply.type).toBe('complete');
    expect(reply.result).toEqual([
      { path: 'a/Wolf.webp', name: 'wolf', score: 0 },
      { path: 'a/Werewolf.webp', name: 'werewolf', score: 0 },
    ]);
    const progress = runtime.messages.filter((m) => m.type === 'progress');
    expect(progress).toEqual([
      { type: 'progress', current: 0, total: 2, term: '' },
      { type: 'progress', current: 1, total: 2, term: 'wolf' },
      { type: 'progress', current: 2, total: 2, term: 'were' },
    ]);
  });

  it('falls back to the inline index and returns nothing for an empty term list', async () => {
    const runtime = loadRuntime(async () => FakeFuse);
    const done = runtime.settled();
    runtime.handle({
      command: 'fuzzySearch',
      data: { searchTerms: [], index: [{ name: 'wolf' }], options: searchOptions },
    });

    expect(await done).toEqual({ type: 'complete', result: [] });
  });

  it('loads Fuse once across searches', async () => {
    const loader = vi.fn(async () => FakeFuse);
    const runtime = loadRuntime(loader);
    const data = { searchTerms: ['wolf'], index: [{ name: 'wolf' }], options: searchOptions };

    const first = runtime.settled();
    runtime.handle({ command: 'fuzzySearch', data });
    await first;
    const second = runtime.settled();
    runtime.handle({ command: 'fuzzySearch', data });
    await second;

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retries a failed Fuse load on the next search', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to load Fuse.js: offline'))
      .mockResolvedValue(FakeFuse);
    const runtime = loadRuntime(loader);
    const data = { searchTerms: ['wolf'], index: [{ name: 'wolf' }], options: searchOptions };

    const first = runtime.settled();
    runtime.handle({ command: 'fuzzySearch', data });
    expect(await first).toEqual({ type: 'error', message: 'Failed to load Fuse.js: offline' });

    const second = runtime.settled();
    runtime.handle({ command: 'fuzzySearch', data });
    expect((await second).type).toBe('complete');
  });

  it('stops between terms when cancel arrives', async () => {
    const runtime = loadRuntime(async () => FakeFuse);
    const done = runtime.settled();
    runtime.handle({
      command: 'fuzzySearch',
      data: { searchTerms: ['a', 'b', 'c'], index: [{ name: 'abc' }], options: searchOptions },
    });
    runtime.handle({ command: 'cancel' });

    expect(await done).toEqual({ type: 'cancelled' });
  });
});

describe('IndexWorker state ownership', () => {
  it('keeps no mutable state at module level', () => {
    // Article XII.2: state belongs to the runtime instance. A top-level `let`
    // is how the stale-cache bugs of earlier versions crept in.
    expect(WORKER_SOURCE).not.toMatch(/^let /m);
    expect(WORKER_SOURCE).not.toMatch(/^var /m);
  });

  it('gives each runtime instance its own state', async () => {
    const { context } = loadWorker();
    const a = loadRuntime(async () => FakeFuse, context);
    const b = loadRuntime(async () => FakeFuse, context);
    a.handle({ command: 'setSearchIndex', data: { index: [{ name: 'wolf' }] } });

    const done = b.settled();
    b.handle({ command: 'fuzzySearch', data: { searchTerms: ['wolf'], options: searchOptions } });
    expect((await done).message).toMatch(/^index must be an array/);
  });
});
