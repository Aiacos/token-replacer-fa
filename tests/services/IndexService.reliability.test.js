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
 * @param {object} [depOverrides={}] - Other dependency overrides
 * @returns {{service: IndexService, worker: object}}
 */
function createService(storageOverrides = {}, depOverrides = {}) {
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
    ...depOverrides,
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

describe('a TVA path source that throws', () => {
  it('does not stop the next source from being tried', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const tvaAPI = {
      // An exotic TVA build whose getter explodes used to abort the whole build
      // with index_build_failed, although a later source had the paths.
      get cacheImagePaths() {
        throw new Error('getter exploded');
      },
      getSearchCache: async () => [WOLF],
    };
    const service = new IndexService({
      storageService: {
        load: vi.fn(async () => null),
        save: vi.fn(async () => true),
        remove: vi.fn(async () => true),
        needsMigration: vi.fn(async () => false),
        migrateFromLocalStorage: vi.fn(async () => {}),
      },
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: () => tvaAPI,
    });
    service.index = service.createEmptyIndex();

    await expect(service.buildFromTVA()).resolves.toBe(1);
    expect(service.index.pathList).toEqual([WOLF]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.any(Error));
  });
});

describe('a malformed cached index', () => {
  it('is discarded instead of loaded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const remove = vi.fn(async () => true);
    // termIndex points at id 0 but allPaths is missing: loading it used to
    // succeed, and then every search silently returned nothing.
    const { service } = createService({
      remove,
      load: vi.fn(async () => ({
        version: 15,
        lastUpdate: Date.now(),
        categories: {},
        pathList: [WOLF],
        termIndex: { wolf: [0] },
      })),
    });

    await expect(service.loadFromCache()).resolves.toBe(false);
    expect(service.index).toBeNull();
    expect(remove).toHaveBeenCalled();
  });
});

describe('a cancelled worker build', () => {
  it('is not mistaken for a worker failure: no fallback, no warning, worker kept', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { service, worker } = createService({}, { getTvaAPI: () => ({}) });
    worker.addEventListener.mockImplementation((type, handler) => {
      if (type === 'message') worker.onMessage = handler;
    });
    worker.postMessage.mockImplementation((msg) => {
      if (msg.command === 'indexPaths') worker.onMessage({ data: { type: 'cancelled' } });
    });
    service.index = service.createEmptyIndex();
    ui.notifications.warn.mockClear();

    await expect(service.buildFromTVA(null, [{ path: WOLF, name: 'Wolf' }])).rejects.toMatchObject({
      cancelled: true,
    });
    expect(service.index.pathList).toEqual([]);
    expect(ui.notifications.warn).not.toHaveBeenCalled();
    expect(service.worker).toBe(worker);
  });
});

describe('IndexService.CACHE_KEY', () => {
  it('names the key the index is stored under', async () => {
    const save = vi.fn(async () => true);
    const { service } = createService({ save });
    service.index = service.createEmptyIndex();

    await service.saveToCache();

    expect(save).toHaveBeenCalledWith(IndexService.CACHE_KEY, service.index);
    expect(IndexService.CACHE_KEY).toBe('token-replacer-fa-index-v3');
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
