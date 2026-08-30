/**
 * Index build cancellation tests.
 *
 * Cancelling used to be indistinguishable from a worker crash: build() caught
 * the rejection, permanently nulled the worker, warned the user that the
 * background worker had failed, and then ran the *slower* main-thread path the
 * user had just asked it to stop. These tests pin the distinction.
 *
 * @module tests/services/IndexService.cancel
 */
import { describe, it, expect, vi } from 'vitest';
import { IndexService } from '../../scripts/services/IndexService.js';

/**
 * Create an IndexService with a controllable fake worker.
 * @param {object} [overrides={}] - Dependency overrides
 * @returns {{service: IndexService, worker: object}}
 */
function createService(overrides = {}) {
  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const service = new IndexService({
    storageService: {
      load: vi.fn(async () => null),
      save: vi.fn(async () => true),
      remove: vi.fn(async () => true),
      needsMigration: vi.fn(async () => false),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
    workerFactory: vi.fn(() => worker),
    getSetting: vi.fn(),
    getTvaAPI: vi.fn(),
    ...overrides,
  });
  return { service, worker };
}

describe('cancelOperation', () => {
  it('raises the cancel flag even when no worker exists', () => {
    const { service } = createService();

    service.cancelOperation();

    // The main-thread fallback has no worker to message and is the path most in
    // need of an escape hatch, so the flag must not depend on one.
    expect(service._cancelRequested).toBe(true);
  });

  it('messages the worker when there is one', () => {
    const { service, worker } = createService();
    service._ensureWorker();

    service.cancelOperation();

    expect(worker.postMessage).toHaveBeenCalledWith({ command: 'cancel' });
    expect(service._cancelRequested).toBe(true);
  });
});

describe('terminate', () => {
  it('lets a later run build a fresh worker', () => {
    const { service, worker } = createService();
    service._ensureWorker();
    expect(service.worker).toBe(worker);

    service.terminate();
    expect(service.worker).toBeNull();

    // Without resetting _workerInitialized the service would silently stay on
    // the slow main-thread path for the rest of the session.
    service._ensureWorker();
    expect(service.worker).toBe(worker);
  });
});

describe('_cancelledError', () => {
  it('is marked so build() can tell it apart from a worker failure', () => {
    const { service } = createService();

    const error = service._cancelledError();

    expect(error).toBeInstanceOf(Error);
    expect(error.cancelled).toBe(true);
  });
});

describe('indexPathsDirectly', () => {
  it('stops when a cancel arrives mid-build', async () => {
    const { service } = createService();
    service.index = service.createEmptyIndex();
    // Enough paths to cross at least one batch boundary, where the flag is read.
    const paths = Array.from({ length: 3000 }, (_, i) => `modules/fa/tokens/goblin-${i}.webp`);

    const promise = service.indexPathsDirectly(paths, () => service.cancelOperation());

    await expect(promise).rejects.toMatchObject({ cancelled: true });
  });

  it('runs to completion when nothing cancels it', async () => {
    const { service } = createService();
    service.index = service.createEmptyIndex();
    const paths = Array.from({ length: 50 }, (_, i) => `modules/fa/tokens/goblin-${i}.webp`);

    await expect(service.indexPathsDirectly(paths)).resolves.toEqual(expect.any(Number));
    expect(service._cancelRequested).toBe(false);
  });
});

describe('SearchOrchestrator cancellation', () => {
  it('mirrors the IndexService semantics', async () => {
    const { SearchOrchestrator } = await import('../../scripts/services/SearchOrchestrator.js');
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const orchestrator = new SearchOrchestrator({
      workerFactory: vi.fn(() => worker),
      getSetting: vi.fn(),
    });

    // A second worker runs fuzzy search, separate from the indexing one — a
    // cancel that reaches only the indexer leaves this one running.
    orchestrator._ensureWorker();
    orchestrator.cancelOperation();
    expect(orchestrator._cancelRequested).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({ command: 'cancel' });

    expect(orchestrator._cancelledError().cancelled).toBe(true);

    orchestrator.terminate();
    orchestrator._ensureWorker();
    expect(orchestrator.worker).toBe(worker);
  });
});
