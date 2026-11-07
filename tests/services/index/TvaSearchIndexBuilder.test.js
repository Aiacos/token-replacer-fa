/**
 * TvaSearchIndexBuilder: one search per term, Portrait first, a failed search
 * skipped, and TvaCachePathExtractor's result flattening.
 *
 * @module tests/services/index/TvaSearchIndexBuilder.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TvaSearchIndexBuilder } from '../../../scripts/services/index/TvaSearchIndexBuilder.js';
import { TvaCachePathExtractor } from '../../../scripts/services/index/TvaCachePathExtractor.js';

describe('TvaSearchIndexBuilder', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  function createBuilder(mappings) {
    const added = new Map();
    const builder = new TvaSearchIndexBuilder({
      addImage: (path, name) => {
        if (added.has(path)) return false;
        added.set(path, name);
        return true;
      },
      countImages: () => added.size,
      mappings,
      yieldToMain: async () => {},
    });
    return { builder, added };
  }

  it('searches every category and term once and indexes the results', async () => {
    const { builder, added } = createBuilder({ beast: ['wolf', 'beast'] });
    const tvaAPI = {
      doImageSearch: vi.fn(async (term) => [`FA/${term}.webp`]),
    };

    const count = await builder.build(tvaAPI);

    // 'beast' is both a category and a term: searched once.
    expect(tvaAPI.doImageSearch).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
    expect([...added.keys()].sort()).toEqual(['FA/beast.webp', 'FA/wolf.webp']);
  });

  it('retries without the Portrait filter when Portrait finds nothing', async () => {
    const { builder } = createBuilder({ beast: [] });
    const tvaAPI = {
      doImageSearch: vi.fn(async (_term, options) => (options ? [] : ['FA/beast.webp'])),
    };

    await expect(builder.build(tvaAPI)).resolves.toBe(1);
    expect(tvaAPI.doImageSearch).toHaveBeenCalledWith('beast', { searchType: 'Portrait' });
    expect(tvaAPI.doImageSearch).toHaveBeenCalledWith('beast');
  });

  it('skips a term whose search throws and keeps the others', async () => {
    const { builder } = createBuilder({ beast: ['wolf'] });
    const tvaAPI = {
      doImageSearch: vi.fn(async (term) => {
        if (term === 'beast') throw new Error('TVA error');
        return [`FA/${term}.webp`];
      }),
    };

    await expect(builder.build(tvaAPI)).resolves.toBe(1);
    expect(console.debug).toHaveBeenCalled();
  });

  it('reports progress at the end', async () => {
    const { builder } = createBuilder({ beast: ['wolf'] });
    const onProgress = vi.fn();
    await builder.build({ doImageSearch: async () => [] }, onProgress);
    expect(onProgress).toHaveBeenCalledWith(2, 2, 0);
  });
});

describe('TvaCachePathExtractor', () => {
  it('extracts unique paths from a Map, an array and an object of arrays', () => {
    expect(TvaCachePathExtractor.extractPaths(new Map([['a/x.webp', [['b/y.webp']]]]))).toEqual([
      'a/x.webp',
      'b/y.webp',
    ]);
    expect(TvaCachePathExtractor.extractPaths(['a/x.webp', { img: 'a/x.webp' }, 7])).toEqual([
      'a/x.webp',
    ]);
    expect(TvaCachePathExtractor.extractPaths({ images: [{ path: 'c/z.png' }] })).toEqual([
      'c/z.png',
    ]);
    expect(TvaCachePathExtractor.extractPaths(null)).toEqual([]);
  });

  it('flattens doImageSearch results of every known shape', () => {
    expect(TvaCachePathExtractor.extractItems(['a'])).toEqual(['a']);
    expect(TvaCachePathExtractor.extractItems(new Map([['a/x.webp', ['i1']]]))).toEqual([
      'i1',
      { path: 'a/x.webp' },
    ]);
    expect(TvaCachePathExtractor.extractItems({ paths: ['p'] })).toEqual(['p']);
    expect(TvaCachePathExtractor.extractItems({ path: 'single' })).toEqual([{ path: 'single' }]);
    expect(TvaCachePathExtractor.extractItems(null)).toEqual([]);
  });
});
