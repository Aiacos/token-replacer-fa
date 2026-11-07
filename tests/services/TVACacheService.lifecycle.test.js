/**
 * TVACacheService — load/restore/reload lifecycle through its public API.
 * @module tests/services/TVACacheService.lifecycle
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TVACacheService } from '../../scripts/services/TVACacheService.js';

const FILE = 'data/tva-cache.json';

function response(json) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => json,
    headers: { get: () => null },
  };
}

/** In-memory StorageService stand-in, so save → load round-trips. */
function createMemoryStorage() {
  const data = new Map();
  return {
    data,
    load: vi.fn(async (key) => data.get(key) ?? null),
    save: vi.fn(async (key, value) => {
      data.set(key, value);
      return true;
    }),
    remove: vi.fn(async (key) => data.delete(key) || true),
  };
}

function createService(storage) {
  const service = new TVACacheService({
    getTvaAPI: () => ({
      TVA_CONFIG: { staticCache: true, staticCacheFile: FILE },
      isCaching: () => false,
    }),
    getSetting: vi.fn(),
    storageService: storage,
  });
  service.init();
  return service;
}

describe('TVACacheService lifecycle', () => {
  let warn;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Not vi.unstubAllGlobals(): the Foundry mocks stub `game` the same way.
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('loads a cache with malformed entries, skipping them and warning once', async () => {
    globalThis.fetch = vi.fn(async () =>
      response({ Beasts: ['Wolf_01.webp', null, 7, ['Bear.webp', 'Bear']] })
    );
    const service = createService(createMemoryStorage());

    await expect(service.loadTVACache()).resolves.toBe(true);

    expect(service.tvaCacheImages.map((i) => i.path)).toEqual(['Wolf_01.webp', 'Bear.webp']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Skipped 2 malformed entries'));
  });

  it('a second service restores the saved cache without fetching the file', async () => {
    const storage = createMemoryStorage();
    const fetch = vi.fn(async () => response({ Beasts: ['Wolf_01.webp'] }));
    globalThis.fetch = fetch;
    await createService(storage).loadTVACache();
    await vi.waitFor(() => expect(storage.save).toHaveBeenCalled());
    fetch.mockClear();
    fetch.mockImplementation(async () => {
      throw new TypeError('offline');
    });

    const restored = createService(storage);
    await restored.loadTVACache();

    expect(restored.tvaCacheImages.map((i) => i.path)).toEqual(['Wolf_01.webp']);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe('HEAD');
    expect((await restored.searchTVACacheByCategory('beast')).map((r) => r.path)).toEqual([
      'Wolf_01.webp',
    ]);
  });

  it('reload drops the saved copy and rebuilds the category lookup from new data', async () => {
    const storage = createMemoryStorage();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ Beasts: ['Wolf_01.webp'] }))
      .mockResolvedValue(response({ Undead: ['Skeleton_01.webp'] }));
    const service = createService(storage);
    await service.loadTVACache();
    expect(await service.searchTVACacheByCategory('beast')).toHaveLength(1);

    await service.reloadTVACache();

    expect(storage.remove).toHaveBeenCalledWith('tva-cache-v1');
    expect(await service.searchTVACacheByCategory('beast')).toEqual([]);
    expect((await service.searchTVACacheByCategory('undead')).map((r) => r.path)).toEqual([
      'Skeleton_01.webp',
    ]);
  });

  it('a failed persist does not fail the load', async () => {
    const storage = createMemoryStorage();
    storage.save.mockRejectedValue(new Error('quota'));
    globalThis.fetch = vi.fn(async () => response({ Beasts: ['Wolf_01.webp'] }));
    const service = createService(storage);

    await expect(service.loadTVACache()).resolves.toBe(true);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });
});
