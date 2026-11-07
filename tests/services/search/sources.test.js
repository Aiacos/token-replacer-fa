/**
 * The four SearchSource strategies: answers, empty input, throwing dependency.
 * @module tests/services/search/sources.test
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import Fuse from 'fuse.js';
import { IndexSource } from '../../../scripts/services/search/IndexSource.js';
import { TvaCacheSource } from '../../../scripts/services/search/TvaCacheSource.js';
import { ForgeBazaarSource } from '../../../scripts/services/search/ForgeBazaarSource.js';
import { LocalIndexSource } from '../../../scripts/services/search/LocalIndexSource.js';
import { ModuleError } from '../../../scripts/core/ModuleError.js';

const noExclusions = { isExcluded: (path) => !path };
const logger = { log: vi.fn() };
const boom = () => {
  throw new Error('dependency exploded');
};

afterEach(() => vi.restoreAllMocks());

describe('IndexSource', () => {
  const index = {
    isBuilt: true,
    search: vi.fn(() => [{ path: 'a/wolf.webp' }]),
    searchMultiple: vi.fn(() => [{ path: 'a/dwarf.webp' }]),
    searchByCategory: vi.fn(() => [{ path: 'a/beast.webp' }]),
  };

  it('routes each query kind to the index', async () => {
    const source = new IndexSource(index);
    expect(await source.search({ kind: 'term', value: 'wolf' })).toEqual([{ path: 'a/wolf.webp' }]);
    expect(await source.search({ kind: 'terms', value: ['dwarf'] })).toEqual([
      { path: 'a/dwarf.webp' },
    ]);
    expect(await source.search({ kind: 'category', value: 'beast' })).toEqual([
      { path: 'a/beast.webp' },
    ]);
  });

  it('is available only once the index is built', () => {
    expect(new IndexSource(index).isAvailable()).toBe(true);
    expect(new IndexSource({ isBuilt: false }).isAvailable()).toBe(false);
  });

  it('answers an empty query without touching the index', async () => {
    const search = vi.fn();
    const source = new IndexSource({ isBuilt: true, search, searchMultiple: search });
    expect(await source.search({ kind: 'term', value: '' })).toEqual([]);
    expect(await source.search({ kind: 'terms', value: [] })).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });

  it('propagates an index failure', async () => {
    const source = new IndexSource({ isBuilt: true, searchByCategory: boom });
    await expect(source.search({ kind: 'category', value: 'beast' })).rejects.toThrow(
      'dependency exploded'
    );
  });
});

describe('TvaCacheSource', () => {
  const makeTva = (overrides = {}) => ({
    hasTVA: true,
    tvaAPI: { doImageSearch: vi.fn(async () => []) },
    tvaCacheLoaded: true,
    searchTVACacheDirect: vi.fn(async () => [{ path: 'tva/wolf.webp', source: 'tva' }]),
    searchTVACacheMultiple: vi.fn(async () => [{ path: 'tva/dwarf.webp', source: 'tva' }]),
    searchTVACacheByCategory: vi.fn(async () => [{ path: 'tva/beast.webp', source: 'tva' }]),
    ...overrides,
  });
  const make = (tva) => new TvaCacheSource(tva, { pathFilter: noExclusions, logger });

  it('reads the loaded cache for every query kind', async () => {
    const source = make(makeTva());
    expect(await source.search({ kind: 'term', value: 'wolf' })).toEqual([
      { path: 'tva/wolf.webp', source: 'tva' },
    ]);
    expect((await source.search({ kind: 'terms', value: ['dwarf'] }))[0].path).toBe(
      'tva/dwarf.webp'
    );
    expect((await source.search({ kind: 'category', value: 'beast' }))[0].path).toBe(
      'tva/beast.webp'
    );
  });

  it('parses the API answer while the cache is not loaded, dropping excluded paths', async () => {
    const tva = makeTva({ tvaCacheLoaded: false });
    tva.tvaAPI.doImageSearch.mockResolvedValue(
      new Map([['wolf', [{ path: 'tva/wolf.webp' }, { path: 'tva/excluded/x.webp' }]]])
    );
    const source = new TvaCacheSource(tva, {
      pathFilter: { isExcluded: (p) => p.includes('excluded') },
      logger,
    });

    const results = await source.search({ kind: 'term', value: 'wolf' });

    expect(results).toEqual([{ path: 'tva/wolf.webp', name: 'wolf', source: 'tva', score: 0.5 }]);
  });

  it('answers [] without TVA and for an empty query', async () => {
    expect(await make(makeTva({ hasTVA: false })).search({ kind: 'term', value: 'wolf' })).toEqual(
      []
    );
    const tva = makeTva();
    expect(await make(tva).search({ kind: 'term', value: '' })).toEqual([]);
    expect(tva.searchTVACacheDirect).not.toHaveBeenCalled();
  });

  it('logs and answers [] when the API throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tva = makeTva({ tvaCacheLoaded: false });
    tva.tvaAPI.doImageSearch.mockRejectedValue(new Error('TVA down'));

    expect(await make(tva).search({ kind: 'term', value: 'wolf' })).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('propagates a cache failure', async () => {
    const source = make(makeTva({ searchTVACacheByCategory: vi.fn(async () => boom()) }));
    await expect(source.search({ kind: 'category', value: 'beast' })).rejects.toThrow(
      'dependency exploded'
    );
  });
});

describe('ForgeBazaarSource', () => {
  it('tags results with their source', async () => {
    const source = new ForgeBazaarSource({
      isServiceAvailable: () => true,
      search: vi.fn(async () => [{ path: 'forge://x.webp' }]),
      browseCategory: vi.fn(async () => [{ path: 'forge://beast.webp' }]),
    });
    expect(await source.search({ kind: 'term', value: 'wolf' })).toEqual([
      { path: 'forge://x.webp', source: 'forge-bazaar' },
    ]);
    expect(await source.search({ kind: 'category', value: 'beast' })).toEqual([
      { path: 'forge://beast.webp', source: 'forge-bazaar' },
    ]);
  });

  it('is unavailable without a service, and answers [] for an empty query', async () => {
    expect(new ForgeBazaarSource(null).isAvailable()).toBe(false);
    expect(await new ForgeBazaarSource(null).search({ kind: 'term', value: '' })).toEqual([]);
  });

  it('propagates a service failure', async () => {
    const source = new ForgeBazaarSource({ isServiceAvailable: () => true, search: boom });
    await expect(source.search({ kind: 'term', value: 'wolf' })).rejects.toThrow(
      'dependency exploded'
    );
  });
});

describe('LocalIndexSource', () => {
  const index = [
    { path: 'FA/Beasts/wolf.webp', name: 'Wolf', fileName: 'wolf', category: 'Beasts' },
    { path: 'FA/Humanoids/dwarf.webp', name: 'Dwarf', fileName: 'dwarf', category: 'Humanoids' },
    { path: 'FA/excluded/wolf2.webp', name: 'Wolf', fileName: 'wolf2', category: 'Beasts' },
  ];
  const noWorker = { ensure: () => null, teardown: vi.fn(), search: vi.fn() };
  const make = (overrides = {}) =>
    new LocalIndexSource(overrides.worker ?? noWorker, {
      fuseLoader: { load: async () => Fuse },
      pathFilter: { isExcluded: (p) => p.includes('excluded') },
      getSetting: () => 0.3,
      isCancelled: overrides.isCancelled ?? (() => false),
      logger,
      notify: overrides.notify ?? vi.fn(),
    });

  it('matches a term in the chosen fields, skipping excluded folders', async () => {
    const results = await make().search(
      { kind: 'term', value: 'WOLF' },
      { index, fields: LocalIndexSource.FIELDS.NAME }
    );
    expect(results.map((r) => r.path)).toEqual(['FA/Beasts/wolf.webp']);
  });

  it('matches a creature category through the type mappings', async () => {
    const results = await make().search({ kind: 'category', value: 'humanoid' }, { index });
    expect(results.map((r) => r.path)).toEqual(['FA/Humanoids/dwarf.webp']);
  });

  it('skips excluded folders in a category match', async () => {
    const results = await make().search({ kind: 'category', value: 'beast' }, { index });
    expect(results.map((r) => r.path)).toEqual(['FA/Beasts/wolf.webp']);
  });

  it('fuzzy-searches on the main thread when no worker can be built', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const results = await make().search({ kind: 'terms', value: ['wolf'] }, { index });
    expect(results.map((r) => r.path)).toEqual(['FA/Beasts/wolf.webp']);
    expect(results[0].source).toBe('local');
  });

  it('answers [] for an empty query or an empty index', async () => {
    const source = make();
    expect(await source.search({ kind: 'term', value: '' }, { index })).toEqual([]);
    expect(await source.search({ kind: 'terms', value: ['wolf'] }, { index: [] })).toEqual([]);
    expect(await source.search({ kind: 'terms', value: ['wolf'] }, { index: null })).toEqual([]);
  });

  it('falls back to the main thread and tells the user when the worker throws', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notify = vi.fn();
    const worker = { ensure: () => ({}), teardown: vi.fn(), search: vi.fn(async () => boom()) };

    const results = await make({ worker, notify }).fuzzy(['wolf'], index);

    expect(worker.teardown).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.path)).toEqual(['FA/Beasts/wolf.webp']);
  });

  it('tells the user once while the worker keeps failing, and again after it recovers', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const notify = vi.fn();
    const search = vi.fn(async () => boom());
    const source = make({ worker: { ensure: () => ({}), teardown: vi.fn(), search }, notify });

    // A CDN failure inside the worker fails every search of a batch.
    await source.fuzzy(['wolf'], index);
    await source.fuzzy(['dwarf'], index);
    await source.fuzzy(['wolf'], index);
    expect(notify).toHaveBeenCalledTimes(1);

    search.mockResolvedValueOnce([]);
    await source.fuzzy(['wolf'], index);
    await source.fuzzy(['wolf'], index);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('does not recover a cancelled worker search on the main thread', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const worker = {
      ensure: () => ({}),
      teardown: vi.fn(),
      search: vi.fn(async () => {
        throw ModuleError.cancelled();
      }),
    };

    await expect(make({ worker }).fuzzy(['wolf'], index)).rejects.toMatchObject({
      cancelled: true,
    });
    expect(worker.teardown).not.toHaveBeenCalled();
  });

  it('stops the main-thread fuzzy search once cancelled', async () => {
    await expect(
      make({ isCancelled: () => true }).fuzzyDirect(['wolf'], index)
    ).rejects.toMatchObject({ cancelled: true });
  });

  it('filters worker hits by creature type', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const worker = {
      ensure: () => ({}),
      teardown: vi.fn(),
      search: vi.fn(async () => [
        { path: 'FA/Beasts/wolf.webp', category: 'Beasts' },
        { path: 'FA/Humanoids/dwarf.webp', category: 'Humanoids' },
        { path: 'loose.webp' },
      ]),
    };

    const results = await make({ worker }).fuzzyWithWorker(['x'], index, 'beast');

    expect(results.map((r) => r.path)).toEqual(['FA/Beasts/wolf.webp', 'loose.webp']);
  });
});
