/**
 * TvaCacheParser — the three TVA cache entry formats and malformed input.
 * @module tests/services/tva/TvaCacheParser
 */
import { describe, it, expect, vi } from 'vitest';
import { TvaCacheParser } from '../../../scripts/services/tva/TvaCacheParser.js';

const parser = new TvaCacheParser({ yieldToMain: async () => {} });

describe('TvaCacheParser', () => {
  it('derives the name from the path when the cached name is not a string', () => {
    const parser = new TvaCacheParser();
    expect(parser.parseEntry(['tokens/Goblin_01.webp', 5], 'Humanoid')).toMatchObject({
      path: 'tokens/Goblin_01.webp',
      name: 'Goblin_01',
    });
    expect(parser.parseEntry(['tokens/Wolf.png', {}, 'not-tags'], 'Beast')).toEqual({
      path: 'tokens/Wolf.png',
      name: 'Wolf',
      category: 'Beast',
    });
  });

  it('parses a plain path, naming it after the file without extension', async () => {
    const { images } = await parser.parse({ Beasts: ['a/b/Wolf_Grey_01.webp'] });

    expect(images).toEqual([
      { path: 'a/b/Wolf_Grey_01.webp', name: 'Wolf_Grey_01', category: 'Beasts' },
    ]);
  });

  it('names a path without folders or extension after the whole string', async () => {
    const { images } = await parser.parse({ C: ['Wolf'] });

    expect(images[0].name).toBe('Wolf');
  });

  it('parses [path, name]', async () => {
    const { images } = await parser.parse({ C: [['p/w.webp', 'Grey Wolf']] });

    expect(images).toEqual([{ path: 'p/w.webp', name: 'Grey Wolf', category: 'C' }]);
  });

  it('parses [path, name, tags], keeping the tags', async () => {
    const { images } = await parser.parse({ C: [['p/w.webp', 'Wolf', ['beast']]] });

    expect(images).toEqual([{ path: 'p/w.webp', name: 'Wolf', tags: ['beast'], category: 'C' }]);
  });

  it('shares each image object between the flat list and its category', async () => {
    const { images, byCategory } = await parser.parse({ A: ['x.webp'], B: [['y.webp', 'Y']] });

    expect(images).toHaveLength(2);
    expect(byCategory.A[0]).toBe(images[0]);
    expect(byCategory.B[0]).toBe(images[1]);
  });

  it('ignores non-array top-level values (metadata)', async () => {
    const { byCategory, images } = await parser.parse({
      version: 3,
      meta: { a: 1 },
      C: ['x.webp'],
    });

    expect(Object.keys(byCategory)).toEqual(['C']);
    expect(images).toHaveLength(1);
  });

  it('skips and counts malformed entries instead of throwing', async () => {
    const { images, skipped } = await parser.parse({
      C: [
        'ok.webp',
        null,
        42,
        '',
        { path: 'x' },
        [],
        [7, 'n'],
        ['', 'empty'],
        ['fine.webp', 'Fine'],
      ],
    });

    expect(images.map((i) => i.path)).toEqual(['ok.webp', 'fine.webp']);
    expect(skipped).toBe(7);
  });

  it('returns empty results for an empty cache', async () => {
    expect(await parser.parse({})).toEqual({ byCategory: {}, images: [], skipped: 0 });
  });

  it('yields to the main thread every yieldEvery entries', async () => {
    const yieldToMain = vi.fn(async () => {});
    const chunked = new TvaCacheParser({ yieldToMain, yieldEvery: 2 });

    await chunked.parse({ C: ['a', 'b', 'c', 'd', 'e'] });

    expect(yieldToMain).toHaveBeenCalledTimes(2);
  });
});
