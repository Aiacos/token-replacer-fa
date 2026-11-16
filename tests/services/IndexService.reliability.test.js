/**
 * Index reliability regressions.
 *
 * Each case here once lost a user's index without a visible error: a save that
 * reported success when nothing was written, a failed refresh that discarded a
 * perfectly good cached index, a single folder named "constructor" that broke
 * the whole build, and a cancel pressed before the worker started.
 *
 * @module tests/services/IndexService.reliability
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { IndexService } from '../../scripts/services/IndexService.js';

/**
 * @param {object} [storageOverrides={}] - Storage method overrides
 * @returns {{service: IndexService, worker: object}}
 */
function createService(storageOverrides = {}) {
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
      ...storageOverrides,
    },
    workerFactory: vi.fn(() => worker),
    getSetting: vi.fn(),
    getTvaAPI: vi.fn(),
  });
  return { service, worker };
}

const WOLF = 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('saveToCache', () => {
  it('reports failure when storage could not write the index', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { service } = createService({ save: vi.fn(async () => false) });
    service.index = service.createEmptyIndex();
    service.addImageToIndex(WOLF, 'Wolf');

    await expect(service.saveToCache()).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalled();
  });
});

describe('a failed refresh of a cached index', () => {
  /** A service whose cache holds a valid but stale index. */
  function serviceWithStaleCache() {
    const { service } = createService();
    const cached = service.createEmptyIndex();
    service.loadFromCache = vi.fn(async () => {
      service.index = cached;
      service.addImageToIndex(WOLF, 'Wolf');
      return true;
    });
    service.needsUpdate = vi.fn(() => true);
    return service;
  }

  it('keeps the cached index searchable when the rebuild fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = serviceWithStaleCache();
    service.buildFromTVA = vi.fn(async () => {
      throw new Error('TVA unavailable');
    });

    await expect(service.build()).resolves.toBe(true);
    expect(service.search('wolf').map((r) => r.path)).toEqual([WOLF]);
  });

  it('keeps the cached index when the rebuild finds no images', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = serviceWithStaleCache();
    service.buildFromTVA = vi.fn(async () => {});

    await expect(service.build()).resolves.toBe(true);
    expect(service.search('wolf').map((r) => r.path)).toEqual([WOLF]);
  });

  it('still throws when there was no cached index to fall back on', async () => {
    const { service } = createService();
    service.loadFromCache = vi.fn(async () => false);
    service.buildFromTVA = vi.fn(async () => {
      throw new Error('TVA unavailable');
    });

    await expect(service.build()).rejects.toMatchObject({ errorType: 'index_build_failed' });
    expect(service.isBuilt).toBe(false);
  });
});

describe('terms that collide with Object.prototype', () => {
  it('indexes and finds a path containing "constructor"', () => {
    const { service } = createService();
    service.index = service.createEmptyIndex();
    const path = 'FA_Pack/Tokens/constructor/Goblin_01.webp';

    expect(service.addImageToIndex(path, 'Goblin')).toBe(true);
    service.isBuilt = true;

    expect(service.search('constructor').map((r) => r.path)).toEqual([path]);
    expect(service.search('goblin').map((r) => r.path)).toEqual([path]);
  });

  it('does not crash searching for "constructor" in an index without it', () => {
    const { service } = createService();
    service.index = service.createEmptyIndex();
    service.addImageToIndex(WOLF, 'Wolf');
    service.isBuilt = true;

    expect(service.search('constructor')).toEqual([]);
    expect(service.searchMultiple(['constructor', 'wolf']).map((r) => r.path)).toEqual([WOLF]);
  });
});

describe('cancel before the worker starts', () => {
  it('does not start a build the user already stopped', async () => {
    const { service, worker } = createService();
    service._ensureWorker();
    service.cancelOperation();

    await expect(service.indexPathsWithWorker([WOLF])).rejects.toMatchObject({ cancelled: true });
    const commands = worker.postMessage.mock.calls.map(([msg]) => msg.command);
    expect(commands).not.toContain('indexPaths');
  });
});
