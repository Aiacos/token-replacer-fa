/**
 * WorkerIndexBuilder lifecycle through a fake worker: complete, cancel,
 * timeout, crash, double build, stale result, and replacement after teardown
 * (Constitution, Article II.4).
 *
 * @module tests/services/index/WorkerIndexBuilder.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerIndexBuilder } from '../../../scripts/services/index/WorkerIndexBuilder.js';
import { CancellationToken } from '../../../scripts/services/index/CancellationToken.js';

/** A worker double that records listeners and lets the test speak for it. */
function fakeWorker() {
  const listeners = { message: new Set(), error: new Set() };
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn((type, fn) => listeners[type].add(fn)),
    removeEventListener: vi.fn((type, fn) => listeners[type].delete(fn)),
    listeners,
    send(data) {
      for (const fn of [...listeners.message]) fn({ data });
    },
    crash(error) {
      for (const fn of [...listeners.error]) fn(error);
    },
  };
}

const RESULT = { categories: {}, pathList: ['a.webp'], allPaths: [{}], termIndex: {} };
const CONFIG = {
  creatureTypeMappings: { beast: ['wolf'] },
  excludedFolders: [],
  excludedFilenameTerms: [],
};

function createBuilder(overrides = {}) {
  const workers = [];
  const workerFactory = vi.fn(() => {
    const worker = fakeWorker();
    workers.push(worker);
    return worker;
  });
  const applyResult = vi.fn(() => true);
  const builder = new WorkerIndexBuilder({
    workerFactory,
    applyResult,
    config: CONFIG,
    timeoutMs: 1000,
    ...overrides,
  });
  return { builder, workers, workerFactory, applyResult };
}

describe('WorkerIndexBuilder', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not create a worker until a build needs one', () => {
    const { builder, workerFactory } = createBuilder();
    expect(workerFactory).not.toHaveBeenCalled();
    expect(builder.worker).toBeNull();
  });

  it('posts paths with the categorization config and adopts the result', async () => {
    const { builder, workers, applyResult } = createBuilder();
    const onProgress = vi.fn();

    const build = builder.build(['a.webp'], onProgress);
    const [worker] = workers;
    expect(worker.postMessage).toHaveBeenCalledWith({
      command: 'indexPaths',
      data: { paths: ['a.webp'], ...CONFIG },
    });

    worker.send({ type: 'progress', processed: 1, total: 1, imagesFound: 1 });
    worker.send({ type: 'pong' });
    worker.send({ type: 'complete', imagesFound: 1, total: 1, result: RESULT });

    await expect(build).resolves.toBe(1);
    expect(onProgress).toHaveBeenCalledWith(1, 1, 1);
    expect(applyResult).toHaveBeenCalledWith(RESULT);
    // Listeners do not pile up across builds.
    expect(worker.listeners.message.size).toBe(0);
    expect(worker.listeners.error.size).toBe(0);
  });

  it('resolves 0 when the index it was built for is gone', async () => {
    const { builder, workers } = createBuilder({ applyResult: () => false });
    const build = builder.build(['a.webp']);
    workers[0].send({ type: 'complete', imagesFound: 5, total: 5, result: RESULT });
    await expect(build).resolves.toBe(0);
  });

  it('rejects with a cancellation when the worker reports one, and keeps the worker', async () => {
    const { builder, workers } = createBuilder();
    const build = builder.build(['a.webp']);

    expect(builder.cancel()).toBe(true);
    expect(workers[0].postMessage).toHaveBeenLastCalledWith({ command: 'cancel' });
    workers[0].send({ type: 'cancelled' });

    await expect(build).rejects.toMatchObject({ cancelled: true });
    expect(builder.worker).toBe(workers[0]);
  });

  it('does not start a build whose token is already cancelled', async () => {
    const { builder, workers } = createBuilder();
    const token = new CancellationToken();
    token.cancel();

    await expect(builder.build(['a.webp'], null, token)).rejects.toMatchObject({ cancelled: true });
    expect(workers[0].postMessage).not.toHaveBeenCalled();
  });

  it('cancel() without a worker creates none', () => {
    const { builder, workerFactory } = createBuilder();
    expect(builder.cancel()).toBe(false);
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it('times out a silent worker, tears it down, and builds with a fresh one next time', async () => {
    vi.useFakeTimers();
    const { builder, workers } = createBuilder();

    const build = builder.build(['a.webp']);
    const assertion = expect(build).rejects.toMatchObject({ errorType: 'worker_failed' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    expect(workers[0].terminate).toHaveBeenCalled();
    expect(builder.worker).toBeNull();

    // A late `complete` from the dead worker settles nothing.
    workers[0].send({ type: 'complete', imagesFound: 1, total: 1, result: RESULT });

    const next = builder.build(['a.webp']);
    expect(workers).toHaveLength(2);
    workers[1].send({ type: 'complete', imagesFound: 1, total: 1, result: RESULT });
    await expect(next).resolves.toBe(1);
  });

  it('clears its timeout once the build settles', async () => {
    vi.useFakeTimers();
    const { builder, workers } = createBuilder();
    const build = builder.build(['a.webp']);
    workers[0].send({ type: 'complete', imagesFound: 1, total: 1, result: RESULT });
    await build;

    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with worker_failed on a crash, settling only once', async () => {
    const { builder, workers } = createBuilder();
    const build = builder.build(['a.webp']);

    workers[0].crash({ message: 'out of memory' });
    workers[0].send({ type: 'error', message: 'late' });

    await expect(build).rejects.toMatchObject({ errorType: 'worker_failed' });
    // The builder never falls back or tears down on its own: the service decides.
    expect(workers[0].terminate).not.toHaveBeenCalled();
  });

  it('rejects with worker_failed when the worker reports an error message', async () => {
    const { builder, workers } = createBuilder();
    const build = builder.build(['a.webp']);
    workers[0].send({ type: 'error', message: 'Fuse failed' });
    await expect(build).rejects.toMatchObject({ errorType: 'worker_failed' });
  });

  it('rejects with worker_failed when postMessage throws', async () => {
    const { builder } = createBuilder({
      workerFactory: () => {
        const worker = fakeWorker();
        worker.postMessage.mockImplementation(() => {
          throw new Error('DataCloneError');
        });
        return worker;
      },
    });
    await expect(builder.build(['a.webp'])).rejects.toMatchObject({ errorType: 'worker_failed' });
  });

  it('rejects a second build while one is running, without disturbing the first', async () => {
    const { builder, workers } = createBuilder();
    const first = builder.build(['a.webp']);

    await expect(builder.build(['b.webp'])).rejects.toMatchObject({ errorType: 'worker_failed' });
    expect(workers[0].postMessage).toHaveBeenCalledTimes(1);

    workers[0].send({ type: 'complete', imagesFound: 1, total: 1, result: RESULT });
    await expect(first).resolves.toBe(1);

    // Sequential builds reuse the same worker.
    const second = builder.build(['b.webp']);
    workers[0].send({ type: 'complete', imagesFound: 2, total: 2, result: RESULT });
    await expect(second).resolves.toBe(2);
    expect(workers).toHaveLength(1);
  });

  it('rejects when no worker can be created', async () => {
    const { builder } = createBuilder({
      workerFactory: () => {
        throw new Error('Worker unsupported');
      },
    });
    await expect(builder.build(['a.webp'])).rejects.toMatchObject({ errorType: 'worker_failed' });
  });

  it('rejects an empty path list with invalid_paths', async () => {
    const { builder } = createBuilder();
    await expect(builder.build([])).rejects.toMatchObject({ errorType: 'invalid_paths' });
  });

  it('teardown() terminates the worker and the next ensureWorker() replaces it', () => {
    const { builder, workers } = createBuilder();
    builder.ensureWorker();
    builder.teardown();
    builder.teardown();

    expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    expect(builder.ensureWorker()).toBe(workers[1]);
  });
});
