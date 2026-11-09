/**
 * ParallelSearchRunner: batching, failure isolation, cancellation, progress.
 * @module tests/services/search/ParallelSearchRunner.test
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ParallelSearchRunner } from '../../../scripts/services/search/ParallelSearchRunner.js';
import { ModuleError } from '../../../scripts/core/ModuleError.js';

const logger = { log: vi.fn() };

/** `n` creature groups keyed `c0…c(n-1)`. */
const makeGroups = (n) =>
  new Map(
    Array.from({ length: n }, (_, i) => [
      `c${i}`,
      { creatureInfo: { actorName: `Creature ${i}` }, tokens: [`t${i}`] },
    ])
  );

afterEach(() => vi.restoreAllMocks());

describe('ParallelSearchRunner', () => {
  it('searches every group and records matches, tokens and creatureInfo', async () => {
    const runner = new ParallelSearchRunner({ batchSize: 2, isCancelled: () => false, logger });
    const groups = makeGroups(3);

    const results = await runner.run(groups, async (info) => [{ path: `${info.actorName}.webp` }]);

    expect([...results.keys()]).toEqual(['c0', 'c1', 'c2']);
    expect(results.get('c1')).toEqual({
      matches: [{ path: 'Creature 1.webp' }],
      tokens: ['t1'],
      creatureInfo: groups.get('c1').creatureInfo,
    });
  });

  it('returns an empty map for no groups', async () => {
    const runner = new ParallelSearchRunner({ batchSize: 4, isCancelled: () => false, logger });
    const search = vi.fn();
    expect((await runner.run(new Map(), search)).size).toBe(0);
    expect(search).not.toHaveBeenCalled();
  });

  it('isolates a failing group and warns once for it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runner = new ParallelSearchRunner({ batchSize: 4, isCancelled: () => false, logger });

    const results = await runner.run(makeGroups(3), async (info) => {
      if (info.actorName === 'Creature 1') throw new Error('index exploded');
      return [];
    });

    expect([...results.keys()]).toEqual(['c0', 'c2']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('stops between batches once cancelled, without reporting failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let cancelled = false;
    const runner = new ParallelSearchRunner({
      batchSize: 2,
      isCancelled: () => cancelled,
      logger,
    });
    const search = vi.fn(async () => {
      cancelled = true;
      throw ModuleError.cancelled();
    });

    const results = await runner.run(makeGroups(6), search);

    // The first batch (2 groups) ran; the other two batches never started.
    expect(search).toHaveBeenCalledTimes(2);
    expect(results.size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports progress before each batch', async () => {
    const runner = new ParallelSearchRunner({ batchSize: 2, isCancelled: () => false, logger });
    const progress = vi.fn();

    await runner.run(makeGroups(3), async () => [], progress);

    expect(progress.mock.calls.map(([p]) => p)).toEqual([
      { type: 'batch', completed: 0, total: 3, currentBatch: ['Creature 0', 'Creature 1'] },
      { type: 'batch', completed: 2, total: 3, currentBatch: ['Creature 2'] },
    ]);
  });
});
