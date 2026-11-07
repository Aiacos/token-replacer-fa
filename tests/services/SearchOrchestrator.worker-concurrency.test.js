/**
 * Concurrent worker searches.
 *
 * parallelSearchCreatures runs up to four creature searches at once, all on the
 * one worker. The worker's replies carry no request id, so every pending search
 * used to resolve with whichever reply arrived first: three creatures out of
 * four were offered another creature's token art, and it was cached that way.
 *
 * @module tests/services/SearchOrchestrator.worker-concurrency
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';

/**
 * A worker that answers each fuzzySearch with one result named after its term.
 * @returns {object} Worker-like object
 */
function createWorker({ reply = true } = {}) {
  const listeners = { message: [], error: [] };
  return {
    postMessage: vi.fn((msg) => {
      if (msg.command !== 'fuzzySearch' || !reply) return;
      const [term] = msg.data.searchTerms;
      queueMicrotask(() =>
        [...listeners.message].forEach((fn) =>
          fn({ data: { type: 'complete', result: [{ path: `${term}.webp`, score: 0.1 }] } })
        )
      );
    }),
    terminate: vi.fn(),
    addEventListener: vi.fn((type, fn) => listeners[type]?.push(fn)),
    removeEventListener: vi.fn((type, fn) => {
      const list = listeners[type];
      if (list?.includes(fn)) list.splice(list.indexOf(fn), 1);
    }),
  };
}

const INDEX = [{ path: 'local/a.webp', name: 'a', fileName: 'a.webp', source: 'local' }];

function createOrchestrator(worker) {
  const orchestrator = new SearchOrchestrator({
    workerFactory: () => worker,
    getSetting: vi.fn(() => 0.3),
  });
  orchestrator._workerClient.ensure();
  return orchestrator;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('concurrent worker searches', () => {
  it('each search resolves with its own results', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const orchestrator = createOrchestrator(createWorker());

    const [wolf, bear] = await Promise.all([
      orchestrator.searchLocalIndexWithWorker(['wolf'], INDEX),
      orchestrator.searchLocalIndexWithWorker(['bear'], INDEX),
    ]);

    expect(wolf.map((r) => r.path)).toEqual(['wolf.webp']);
    expect(bear.map((r) => r.path)).toEqual(['bear.webp']);
  });

  it('a failed search does not block the next one', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = createWorker();
    const orchestrator = createOrchestrator(worker);
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('worker gone');
    });

    await expect(orchestrator.searchLocalIndexWithWorker(['wolf'], INDEX)).rejects.toMatchObject({
      errorType: 'worker_failed',
    });
    // A leftover listener or timer from the failed post would outlive it.
    expect(worker.removeEventListener).toHaveBeenCalledTimes(2);
    const bear = await orchestrator.searchLocalIndexWithWorker(['bear'], INDEX);
    expect(bear.map((r) => r.path)).toEqual(['bear.webp']);
  });

  it('times out cleanly after the worker was torn down by another search', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const orchestrator = createOrchestrator(createWorker({ reply: false }));

    const pending = orchestrator.searchLocalIndexWithWorker(['wolf'], INDEX);
    const outcome = pending.then(
      () => 'resolved',
      (error) => error.errorType
    );
    await vi.advanceTimersByTimeAsync(0);
    orchestrator._workerClient.teardown();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(outcome).resolves.toBe('worker_failed');
  });
});
