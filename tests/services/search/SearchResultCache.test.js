/**
 * SearchResultCache: bounded LRU of ranked results per creature.
 * @module tests/services/search/SearchResultCache.test
 */
import { describe, it, expect } from 'vitest';
import { SearchResultCache } from '../../../scripts/services/search/SearchResultCache.js';

describe('SearchResultCache', () => {
  it('returns what was stored, and undefined for an unknown key', () => {
    const cache = new SearchResultCache();
    const results = [{ path: 'a.webp' }];
    cache.set('wolf', results);
    expect(cache.get('wolf')).toBe(results);
    expect(cache.get('bear')).toBeUndefined();
    expect(cache.has('wolf')).toBe(true);
  });

  it('evicts the oldest quarter once full', () => {
    const cache = new SearchResultCache(8);
    for (let i = 0; i < 9; i++) cache.set(`k${i}`, [i]);

    // 9 > 8: the two (25% of 8) least recently used go.
    expect(cache.size).toBe(7);
    expect(cache.has('k0')).toBe(false);
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k2')).toBe(true);
    expect(cache.has('k8')).toBe(true);
  });

  it('keeps an entry that was read recently', () => {
    const cache = new SearchResultCache(4);
    for (let i = 0; i < 4; i++) cache.set(`k${i}`, [i]);
    cache.get('k0');
    cache.set('k4', [4]);

    expect(cache.has('k0')).toBe(true);
    expect(cache.has('k1')).toBe(false);
  });

  it('re-setting a key does not grow the cache', () => {
    const cache = new SearchResultCache(4);
    cache.set('wolf', [1]);
    cache.set('wolf', [2]);
    expect(cache.size).toBe(1);
    expect(cache.get('wolf')).toEqual([2]);
  });

  it('clear() empties it', () => {
    const cache = new SearchResultCache();
    cache.set('wolf', []);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('wolf')).toBeUndefined();
  });
});
