/**
 * Worker search-index freshness tests.
 *
 * Sending the index to the Worker only once is the right optimization, but it
 * was gated on a boolean that was never cleared when the index *content*
 * changed — only when the Worker failed, timed out, or was terminated. Since
 * the orchestrator is a singleton, a rescanned library (new artwork, changed
 * search paths) was silently fuzzy-searched against the copy the Worker had
 * received earlier in the session. No error, just missing results until reload.
 *
 * @module tests/services/SearchOrchestrator.worker-index
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';

/**
 * A Worker stub that answers every fuzzySearch with an empty result set.
 * @returns {object} Worker-like object
 */
function createWorker() {
  const listeners = { message: [], error: [] };
  const worker = {
    postMessage: vi.fn((msg) => {
      if (msg.command === 'fuzzySearch') {
        queueMicrotask(() =>
          listeners.message.forEach((fn) => fn({ data: { type: 'complete', result: [] } }))
        );
      }
    }),
    terminate: vi.fn(),
    addEventListener: vi.fn((type, fn) => listeners[type]?.push(fn)),
    removeEventListener: vi.fn((type, fn) => {
      const list = listeners[type];
      if (list) list.splice(list.indexOf(fn), 1);
    }),
  };
  return worker;
}

/** Index entries shaped like buildLocalTokenIndex() output. */
const makeIndex = (n, tag) =>
  Array.from({ length: n }, (_, i) => ({
    path: `local/${tag}/img_${i}.webp`,
    name: `${tag} ${i}`,
    fileName: `img_${i}.webp`,
    category: 'beast',
    source: 'local',
  }));

describe('setSearchIndex freshness', () => {
  let worker;
  let orchestrator;

  beforeEach(() => {
    worker = createWorker();
    orchestrator = new SearchOrchestrator({
      workerFactory: () => worker,
      getSetting: vi.fn(() => 0.3),
    });
    orchestrator._ensureWorker();
  });

  /** Count how many times the index was pushed to the Worker. */
  const indexSends = () =>
    worker.postMessage.mock.calls.filter(([msg]) => msg.command === 'setSearchIndex').length;

  it('sends the index on the first search', async () => {
    await orchestrator.searchLocalIndexWithWorker(['wolf'], makeIndex(3, 'a'));
    expect(indexSends()).toBe(1);
  });

  it('does not resend the same index', async () => {
    const index = makeIndex(3, 'a');

    await orchestrator.searchLocalIndexWithWorker(['wolf'], index);
    await orchestrator.searchLocalIndexWithWorker(['bear'], index);

    // The whole point of persisting it: a second search reuses the copy.
    expect(indexSends()).toBe(1);
  });

  it('resends when the library has been rescanned', async () => {
    await orchestrator.searchLocalIndexWithWorker(['wolf'], makeIndex(3, 'a'));
    // buildLocalTokenIndex() returns a fresh array after a rescan; the Worker
    // must see it or it keeps searching the previous session's artwork.
    await orchestrator.searchLocalIndexWithWorker(['wolf'], makeIndex(5, 'b'));

    expect(indexSends()).toBe(2);
  });

  it('forgets the held index when the worker is terminated', async () => {
    const index = makeIndex(3, 'a');
    await orchestrator.searchLocalIndexWithWorker(['wolf'], index);

    orchestrator.terminate();
    orchestrator._ensureWorker();
    await orchestrator.searchLocalIndexWithWorker(['wolf'], index);

    // A fresh worker holds nothing, even for an index it was sent before.
    expect(indexSends()).toBe(2);
  });
});

describe('search cancellation', () => {
  it('stops parallelSearchCreatures at the next batch boundary', async () => {
    const orchestrator = new SearchOrchestrator({
      workerFactory: () => createWorker(),
      getSetting: vi.fn(() => 0.3),
    });

    const groups = new Map(
      Array.from({ length: 40 }, (_, i) => [
        `creature-${i}`,
        { creatureInfo: { actorName: `Creature ${i}`, type: 'beast' }, tokens: [] },
      ])
    );

    orchestrator.searchTokenArt = vi.fn(async () => {
      // Cancel as soon as the first batch starts working.
      orchestrator.cancelOperation();
      return [];
    });

    const results = await orchestrator.parallelSearchCreatures(groups, []);

    // The batch in flight finishes; the rest are never started.
    expect(results.size).toBeGreaterThan(0);
    expect(results.size).toBeLessThan(groups.size);
  });

  it('clears a stale cancel before a new search phase', async () => {
    const orchestrator = new SearchOrchestrator({
      workerFactory: () => createWorker(),
      getSetting: vi.fn(() => 0.3),
    });
    orchestrator.searchTokenArt = vi.fn(async () => []);

    // A cancel left over from a previous run must not abort the next one.
    orchestrator.cancelOperation();
    const groups = new Map([
      ['wolf', { creatureInfo: { actorName: 'Wolf', type: 'beast' }, tokens: [] }],
    ]);

    const results = await orchestrator.parallelSearchCreatures(groups, []);

    expect(results.size).toBe(1);
    expect(orchestrator._cancelRequested).toBe(false);
  });
});
