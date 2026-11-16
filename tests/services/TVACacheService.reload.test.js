/**
 * A forced reload must not be satisfied by a load that started before it.
 *
 * loadTVACache() joins any load already in flight, so a reload issued while the
 * ready hook's load was still running used to resolve with that older data —
 * the very data the reload was asked to replace.
 *
 * @module tests/services/TVACacheService.reload
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { TVACacheService } from '../../scripts/services/TVACacheService.js';

const response = (json) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: vi.fn(async () => json),
  headers: { get: vi.fn(() => null) },
});

const OLD = { Humanoid: ['FA_Pack/Tokens/Humanoid/Goblin_Old_01.webp'] };
const NEW = { Humanoid: ['FA_Pack/Tokens/Humanoid/Goblin_New_01.webp'] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reloadTVACache', () => {
  it('fetches fresh data even while an earlier load is still running', async () => {
    let releaseFirstFetch;
    const firstFetch = new Promise((resolve) => {
      releaseFirstFetch = () => resolve(response(OLD));
    });
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => firstFetch)
      .mockResolvedValue(response(NEW));
    vi.stubGlobal('fetch', fetch);

    const tvaAPI = {
      TVA_CONFIG: { staticCache: true, staticCacheFile: 'data/tva-cache.json' },
      isCaching: vi.fn(() => false),
    };
    const service = new TVACacheService({
      getTvaAPI: () => tvaAPI,
      getSetting: vi.fn(),
      storageService: {
        load: vi.fn(async () => null),
        save: vi.fn(async () => true),
        remove: vi.fn(async () => true),
      },
    });
    service.init();

    const firstLoad = service.loadTVACache();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const reload = service.reloadTVACache();
    releaseFirstFetch();
    await firstLoad;
    await reload;

    expect(service.tvaCacheImages.map((image) => image.path)).toEqual([
      'FA_Pack/Tokens/Humanoid/Goblin_New_01.webp',
    ]);
  });
});
