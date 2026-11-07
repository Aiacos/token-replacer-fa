/**
 * TvaPathSourceChain and its sources: order, skip-on-empty, a throwing source
 * that is logged and skipped, and each source's own lookup.
 *
 * @module tests/services/index/TvaPathSourceChain.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TvaPathSourceChain } from '../../../scripts/services/index/TvaPathSourceChain.js';
import {
  PreloadedCacheSource,
  CacheImagePathsSource,
  SearchCacheSource,
  TvaConfigSource,
  GameSettingsSource,
  InternalCacheSource,
} from '../../../scripts/services/index/TvaPathSources.js';

const WOLF = 'FA/Beasts/Wolf_01.webp';
const BEAR = 'FA/Beasts/Bear_01.webp';

/** A source double answering with a fixed value. */
const source = (label, answer) => ({ label, find: vi.fn(async () => answer) });

describe('TvaPathSourceChain', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns the first non-empty answer and asks nobody after it', async () => {
    const first = source('first', []);
    const second = source('second', [WOLF]);
    const third = source('third', [BEAR]);
    const context = { tvaAPI: {} };

    const paths = await new TvaPathSourceChain([first, second, third]).resolve(context);

    expect(paths).toEqual([WOLF]);
    expect(first.find).toHaveBeenCalledWith(context);
    expect(third.find).not.toHaveBeenCalled();
  });

  it('skips sources that answer empty, null or a non-array', async () => {
    const chain = new TvaPathSourceChain([
      source('empty', []),
      source('null', null),
      source('object', { paths: [WOLF] }),
      source('real', [BEAR]),
    ]);

    await expect(chain.resolve({ tvaAPI: {} })).resolves.toEqual([BEAR]);
  });

  it('logs a throwing source and moves on to the next', async () => {
    const broken = {
      label: 'broken',
      find: () => {
        throw new Error('getter exploded');
      },
    };
    const rejecting = { label: 'rejecting', find: async () => Promise.reject(new Error('no')) };

    const paths = await new TvaPathSourceChain([broken, rejecting, source('ok', [WOLF])]).resolve({
      tvaAPI: {},
    });

    expect(paths).toEqual([WOLF]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('"broken" failed'),
      expect.any(Error)
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('"rejecting" failed'),
      expect.any(Error)
    );
  });

  it('returns an empty list when no source has paths', async () => {
    const chain = new TvaPathSourceChain([source('a', []), source('b', [])]);
    await expect(chain.resolve({ tvaAPI: {} })).resolves.toEqual([]);
  });

  it('the default chain prefers the pre-loaded cache over TVA internals', async () => {
    const tvaAPI = { cacheImagePaths: { x: [BEAR] }, getSearchCache: vi.fn(async () => [BEAR]) };
    const chain = TvaPathSourceChain.createDefault({ getSetting: vi.fn(), globals: {} });

    const paths = await chain.resolve({
      tvaAPI,
      tvaCacheImages: [{ path: WOLF, name: 'Wolf', category: 'beast', extra: 1 }],
    });

    expect(paths).toEqual([{ path: WOLF, name: 'Wolf', category: 'beast' }]);
    expect(tvaAPI.getSearchCache).not.toHaveBeenCalled();
  });

  it('the default chain walks every source in order when all are empty', async () => {
    const getSetting = vi.fn(() => null);
    const chain = TvaPathSourceChain.createDefault({ getSetting, globals: {} });

    await expect(chain.resolve({ tvaAPI: {}, tvaCacheImages: [] })).resolves.toEqual([]);
    // GameSettingsSource, fifth in line, was reached.
    expect(getSetting).toHaveBeenCalledWith('token-variants', 'staticCache');
  });
});

describe('TVA path sources', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('PreloadedCacheSource is empty without pre-loaded images', () => {
    const preloaded = new PreloadedCacheSource();
    expect(preloaded.find({ tvaCacheImages: null })).toEqual([]);
    expect(preloaded.find({ tvaCacheImages: [] })).toEqual([]);
  });

  it('CacheImagePathsSource reads cacheImagePaths when it is an object', () => {
    const cacheSource = new CacheImagePathsSource();
    expect(
      cacheSource.find({ tvaAPI: { cacheImagePaths: { beasts: [WOLF, [BEAR, {}]] } } })
    ).toEqual([WOLF, BEAR]);
    expect(cacheSource.find({ tvaAPI: { cacheImagePaths: 'nope' } })).toEqual([]);
  });

  it('SearchCacheSource awaits getSearchCache when TVA has it', async () => {
    const searchSource = new SearchCacheSource();
    await expect(
      searchSource.find({ tvaAPI: { getSearchCache: async () => new Map([[WOLF, []]]) } })
    ).resolves.toEqual([WOLF]);
    await expect(searchSource.find({ tvaAPI: {} })).resolves.toEqual([]);
  });

  it('TvaConfigSource finds paths in TVA globals, not in TVA_CONFIG itself', () => {
    const configSource = new TvaConfigSource({ TVA_CACHE: [WOLF] });
    const big = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, i]));

    expect(configSource.find({ tvaAPI: { TVA_CONFIG: { staticCache: true, big } } })).toEqual([
      WOLF,
    ]);
    expect(new TvaConfigSource({}).find({ tvaAPI: { TVA_CONFIG: { searchPaths: [] } } })).toEqual(
      []
    );
  });

  it('GameSettingsSource tries every setting name and survives unregistered ones', () => {
    const getSetting = vi.fn((_module, name) => {
      if (name === 'staticCache') throw new Error('not registered');
      if (name === 'cachedImages') return [BEAR];
      return null;
    });

    expect(new GameSettingsSource(getSetting).find()).toEqual([BEAR]);
    expect(console.debug).toHaveBeenCalled();
  });

  it('InternalCacheSource checks the API and the TVA globals', () => {
    expect(new InternalCacheSource({}).find({ tvaAPI: { _cache: [WOLF] } })).toEqual([WOLF]);
    expect(new InternalCacheSource({ TVA: { staticCache: [BEAR] } }).find({ tvaAPI: {} })).toEqual([
      BEAR,
    ]);
    expect(new InternalCacheSource({}).find({ tvaAPI: { cache: ['not a path'] } })).toEqual([]);
  });
});
