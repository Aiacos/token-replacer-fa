/**
 * WorkerSearchClient lifecycle: replies, cancellation, timeout, teardown,
 * index hand-off (Constitution, Article II.4).
 * @module tests/services/search/WorkerSearchClient.test
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WorkerSearchClient } from '../../../scripts/services/search/WorkerSearchClient.js';

const INDEX = [{ path: 'a.webp', name: 'a' }];
const OPTIONS = { keys: ['name'], threshold: 0.3 };

/**
 * A worker stub whose fuzzySearch reply is chosen per test.
 * @param {function(Object): (Object|null)} reply - Message to answer with, or null for silence
 */
function createWorker(reply = () => ({ type: 'complete', result: [{ path: 'hit.webp' }] })) {
  const listeners = { message: [], error: [] };
  const worker = {
    postMessage: vi.fn((msg) => {
      if (msg.command !== 'fuzzySearch') return;
      const data = reply(msg);
      if (data) queueMicrotask(() => [...listeners.message].forEach((fn) => fn({ data })));
    }),
    terminate: vi.fn(),
    addEventListener: vi.fn((type, fn) => listeners[type].push(fn)),
    removeEventListener: vi.fn((type, fn) => {
      const list = listeners[type];
      if (list.includes(fn)) list.splice(list.indexOf(fn), 1);
    }),
    crash: (error) => [...listeners.error].forEach((fn) => fn(error)),
    listenerCount: () => listeners.message.length + listeners.error.length,
  };
  return worker;
}

function createClient(worker, { cancelled = false } = {}) {
  const client = new WorkerSearchClient(() => worker, { isCancelled: () => cancelled });
  client.ensure();
  return client;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WorkerSearchClient', () => {
  it('resolves with the worker results and removes its listeners', async () => {
    const worker = createWorker();
    const client = createClient(worker);

    await expect(client.search(['wolf'], INDEX, OPTIONS)).resolves.toEqual([{ path: 'hit.webp' }]);
    expect(worker.listenerCount()).toBe(0);
  });

  it('forwards progress replies', async () => {
    const worker = createWorker();
    worker.postMessage.mockImplementation((msg) => {
      if (msg.command !== 'fuzzySearch') return;
      const [onMessage] = worker.addEventListener.mock.calls
        .find(([type]) => type === 'message')
        .slice(1);
      onMessage({ data: { type: 'progress', current: 1, total: 2 } });
      onMessage({ data: { type: 'complete', result: [] } });
    });
    const client = createClient(worker);
    const onProgress = vi.fn();

    await client.search(['wolf'], INDEX, OPTIONS, onProgress);

    expect(onProgress).toHaveBeenCalledWith(1, 2);
  });

  it('answers [] for an empty index without posting a search', async () => {
    const worker = createWorker();
    const client = createClient(worker);
    expect(await client.search(['wolf'], [], OPTIONS)).toEqual([]);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('rejects with worker_failed when no worker is live', async () => {
    const client = new WorkerSearchClient(
      () => {
        throw new Error('no workers here');
      },
      { isCancelled: () => false }
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    client.ensure();
    await expect(client.search(['wolf'], INDEX, OPTIONS)).rejects.toMatchObject({
      errorType: 'worker_failed',
    });
  });

  it('rejects with a cancellation, not a failure, when the worker says cancelled', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const client = createClient(createWorker(() => ({ type: 'cancelled' })));
    const error = await client.search(['wolf'], INDEX, OPTIONS).catch((e) => e);
    expect(error.cancelled).toBe(true);
    expect(error.errorType).toBeNull();
  });

  it('does not start a search once cancelled', async () => {
    const worker = createWorker();
    const client = createClient(worker, { cancelled: true });
    await expect(client.search(['wolf'], INDEX, OPTIONS)).rejects.toMatchObject({
      cancelled: true,
    });
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('rejects with worker_failed on an error reply or a crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = createClient(createWorker(() => ({ type: 'error', message: 'bad' })));
    await expect(failing.search(['wolf'], INDEX, OPTIONS)).rejects.toMatchObject({
      errorType: 'worker_failed',
    });

    const silent = createWorker(() => null);
    const crashing = createClient(silent);
    const pending = crashing.search(['wolf'], INDEX, OPTIONS);
    await Promise.resolve();
    await Promise.resolve();
    silent.crash(new Error('OOM'));
    await expect(pending).rejects.toMatchObject({ errorType: 'worker_failed' });
    expect(silent.listenerCount()).toBe(0);
  });

  it('times out, terminates the stalled worker, and builds a fresh one next time', async () => {
    vi.useFakeTimers();
    const stalled = createWorker(() => null);
    const factory = vi.fn(() => stalled);
    const client = new WorkerSearchClient(factory, { isCancelled: () => false, timeoutMs: 1000 });
    client.ensure();

    const outcome = client.search(['wolf'], INDEX, OPTIONS).catch((e) => e.errorType);
    await vi.advanceTimersByTimeAsync(1000);

    expect(await outcome).toBe('worker_failed');
    expect(stalled.terminate).toHaveBeenCalledTimes(1);
    expect(client.worker).toBeNull();
    client.ensure();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('cancel() posts to a live worker only', () => {
    const worker = createWorker();
    const client = new WorkerSearchClient(() => worker, { isCancelled: () => false });
    expect(client.cancel()).toBe(false);
    client.ensure();
    expect(client.cancel()).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ command: 'cancel' });
  });

  it('sends the index again after a teardown', async () => {
    const worker = createWorker();
    const client = createClient(worker);
    const sends = () =>
      worker.postMessage.mock.calls.filter(([m]) => m.command === 'setSearchIndex').length;

    await client.search(['wolf'], INDEX, OPTIONS);
    await client.search(['bear'], INDEX, OPTIONS);
    expect(sends()).toBe(1);

    client.teardown();
    client.ensure();
    await client.search(['wolf'], INDEX, OPTIONS);
    expect(sends()).toBe(2);
  });
});
