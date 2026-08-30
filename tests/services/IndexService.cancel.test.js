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
import { readFileSync } from 'node:fs';
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

describe('the cancellation marker survives the wrapping catches', () => {
  it('build() re-throws a cancellation instead of relabelling it', async () => {
    const { service } = createService();
    // buildFromTVA and build() both wrap anything without an errorType into an
    // index_build_failed error, which used to strip the marker one frame above
    // where every caller checks for it.
    service.loadFromCache = vi.fn(async () => false);
    service.buildFromTVA = vi.fn(async () => {
      throw service._cancelledError();
    });

    await expect(service.build()).rejects.toMatchObject({ cancelled: true });
  });

  it('build() still wraps a genuine failure', async () => {
    const { service } = createService();
    service.loadFromCache = vi.fn(async () => false);
    service.buildFromTVA = vi.fn(async () => {
      throw new Error('TVA exploded');
    });

    await expect(service.build()).rejects.toMatchObject({ errorType: 'index_build_failed' });
  });
});

describe('worker cancellation is observable', () => {
  it('yields inside the indexing loops so a cancel message can be dispatched', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('scripts/workers/IndexWorker.js', 'utf8');

    // A worker is single-threaded: a synchronous loop holds the event loop, the
    // cancel message never gets dispatched, and every `if (cancelled)` inside
    // reads a value that cannot have changed. The awaits are what make the
    // checks mean anything, so they are the thing worth pinning.
    expect(source).toMatch(/async function handleIndexPaths\(/);
    expect(source).toMatch(/function yieldToMessages\(\)/);

    const indexingLoop = source.slice(
      source.indexOf('async function handleIndexPaths('),
      source.indexOf('function reportProgress(')
    );
    expect(indexingLoop).toMatch(/await yieldToMessages\(\)/);
  });
});

describe('worker teardown always allows a replacement', () => {
  it('rebuilds after a failed worker build, not just after terminate()', async () => {
    const { service, worker } = createService();
    service._ensureWorker();
    expect(service.worker).toBe(worker);

    // A transient worker failure — a Fuse.js CDN blip, say — used to null the
    // worker while leaving _workerInitialized true, so _ensureWorker() refused
    // to replace it and the whole session fell back to the main thread.
    service.indexPathsWithWorker = vi.fn(async () => {
      throw new Error('worker exploded');
    });
    service._teardownWorker();

    service._ensureWorker();
    expect(service.worker).toBe(worker);
    expect(service._workerInitialized).toBe(true);
  });

  it('survives a terminate() that throws', () => {
    const { service, worker } = createService();
    service._ensureWorker();
    worker.terminate.mockImplementation(() => {
      throw new Error('already dead');
    });

    expect(() => service._teardownWorker()).not.toThrow();
    expect(service.worker).toBeNull();
    expect(service._workerInitialized).toBe(false);
  });

  it('leaves no path that nulls the worker without clearing the flag', () => {
    const source = readFileSync('scripts/services/IndexService.js', 'utf8');
    const orchestrator = readFileSync('scripts/services/SearchOrchestrator.js', 'utf8');

    // Only three assignments are legitimate per file: the constructor, the
    // _ensureWorker() catch (which deliberately leaves the flag false so a
    // transient factory failure can retry), and _teardownWorker() itself.
    for (const [name, text] of [
      ['IndexService', source],
      ['SearchOrchestrator', orchestrator],
    ]) {
      const assignments = text.match(/this\.worker = null/g) ?? [];
      expect(assignments.length, `${name} gained a teardown path outside the helper`).toBe(3);
    }
  });
});
