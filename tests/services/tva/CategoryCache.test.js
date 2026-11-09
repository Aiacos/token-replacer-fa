/**
 * CategoryCache — the category → images lookup and its on-demand scan.
 * @module tests/services/tva/CategoryCache
 */
import { describe, it, expect } from 'vitest';
import { CategoryCache } from '../../../scripts/services/tva/CategoryCache.js';

const MAPPINGS = { Beast: ['wolf', 'Bear'], undead: ['skeleton'] };

const images = [
  { path: 'pack/Tokens/Beasts/Wolf_01.webp', name: 'Wolf' },
  { path: 'pack/Tokens/Misc/thing.webp', name: 'Brown Bear' },
  { path: 'wolf/deep/nested/folder/structure/Goblin.webp', name: 'Goblin' },
  { path: 'pack/Tokens/Undead/Skeleton_01.webp', name: 'Skeleton' },
  { path: 'pack/Tokens/Beasts/Wolf_01.webp', name: 'Wolf duplicate' },
];

describe('CategoryCache', () => {
  it('maps each category to images matching a term in the name or last four path segments', () => {
    const cache = new CategoryCache(MAPPINGS);
    cache.build(images);

    expect(cache.get('beast').map((i) => i.name)).toEqual(['Wolf', 'Brown Bear']);
    expect(cache.get('UNDEAD').map((i) => i.name)).toEqual(['Skeleton']);
  });

  it('keeps the first image per path', () => {
    const cache = new CategoryCache(MAPPINGS);
    cache.build(images);

    expect(cache.get('beast').filter((i) => i.path.endsWith('Wolf_01.webp'))).toHaveLength(1);
  });

  it('uses precomputed lowercase fields when present', () => {
    const cache = new CategoryCache(MAPPINGS);
    cache.build([{ path: 'X', name: 'X', _nameLower: 'wolf', _pathLower: 'x' }]);

    expect(cache.get('beast')).toHaveLength(1);
  });

  it('returns an empty list for an unknown category or before a build', () => {
    const cache = new CategoryCache(MAPPINGS);
    expect(cache.isBuilt).toBe(false);
    expect(cache.get('beast')).toEqual([]);

    cache.build(images);
    expect(cache.get('dragon')).toEqual([]);
  });

  it('scan applies the same rule as build without building', () => {
    const built = new CategoryCache(MAPPINGS);
    built.build(images);
    const unbuilt = new CategoryCache(MAPPINGS);

    expect(unbuilt.scan(images, 'Beast')).toEqual(built.get('beast'));
    expect(unbuilt.scan(images, 'dragon')).toEqual([]);
    expect(unbuilt.isBuilt).toBe(false);
  });

  it('clear empties the lookup until the next build', () => {
    const cache = new CategoryCache(MAPPINGS);
    cache.build(images);

    cache.clear();

    expect(cache.isBuilt).toBe(false);
    expect(cache.get('beast')).toEqual([]);
  });

  it('a rebuild replaces, not merges, the previous lookup', () => {
    const cache = new CategoryCache(MAPPINGS);
    cache.build(images);

    cache.build([{ path: 'b.webp', name: 'Bear' }]);

    expect(cache.get('beast').map((i) => i.path)).toEqual(['b.webp']);
    expect(cache.get('undead')).toEqual([]);
  });
});
