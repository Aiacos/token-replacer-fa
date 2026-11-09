/**
 * Tests for PathFilter: excluded-folder and excluded-filename filtering with a
 * bounded memo cache (TEST-02).
 *
 * @module tests/core/PathFilter.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PathFilter, pathFilter } from '../../scripts/core/PathFilter.js';

// The page-wide instance is what every service calls, configured from Constants.js.
const filter = pathFilter;

describe('PathFilter.isExcluded', () => {
  it.each([
    'FA_Pack/Tokens/Giants/Hill_Giant_01.webp',
    'FA_Pack/Tokens/Creatures/Awakened_Tree_01.webp',
    'FA_Pack/Tokens/Creatures/Corpse_Flower_01.webp',
    'FA_Pack/Tokens/Beasts/Cave_Bear_01.webp',
  ])('keeps the creature token %s', (path) => {
    expect(filter.isExcluded(path)).toBe(false);
  });

  beforeEach(() => {
    filter.clearCache();
  });

  // CDN URL handling
  it('does NOT exclude CDN URL with non-excluded folder (Tokens)', () => {
    expect(
      filter.isExcluded(
        'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Goblin/goblin.png'
      )
    ).toBe(false);
  });

  it('excludes CDN URL with excluded folder in real path (props)', () => {
    expect(
      filter.isExcluded('https://assets.forge-vtt.com/bazaar/assets/FA_Pack/props/barrel.png')
    ).toBe(true);
  });

  it('CDN segments (assets, bazaar) do NOT trigger exclusion in URL structure', () => {
    // The path has "assets" and "bazaar" in the CDN structure but the actual
    // content path (FA_Pack/Tokens/Goblin) is not excluded
    expect(
      filter.isExcluded(
        'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Goblin/goblin_warrior.png'
      )
    ).toBe(false);
  });

  // Local path handling
  it('excludes local path with excluded folder (tiles)', () => {
    expect(filter.isExcluded('modules/fa-pack/tiles/floor-01.png')).toBe(true);
  });

  it('does NOT exclude local path with non-excluded folder (tokens)', () => {
    expect(filter.isExcluded('modules/fa-pack/tokens/goblin.png')).toBe(false);
  });

  // Filename exclusion with word boundary matching
  it('excludes path with excluded term in filename (cliff_entrance)', () => {
    expect(filter.isExcluded('modules/fa-pack/Tokens/cliff_entrance_01.png')).toBe(true);
  });

  it('does NOT exclude partial word match in filename (Clifford)', () => {
    expect(filter.isExcluded('modules/fa-pack/Tokens/Clifford_The_Dog.png')).toBe(false);
  });

  // Excluded folder groups - representative samples
  it('excludes generic asset folder (props)', () => {
    expect(filter.isExcluded('some/props/item.png')).toBe(true);
  });

  it('excludes FA-specific folder (dungeon_decor)', () => {
    expect(filter.isExcluded('some/dungeon_decor/torch.png')).toBe(true);
  });

  it('excludes structure folder (bridge)', () => {
    expect(filter.isExcluded('some/bridge/stone_bridge.png')).toBe(true);
  });

  it('excludes nature folder (tree)', () => {
    expect(filter.isExcluded('some/tree/oak.png')).toBe(true);
  });

  // Null/empty input
  it('returns true for null input', () => {
    expect(filter.isExcluded(null)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(filter.isExcluded('')).toBe(true);
  });

  // Memoization cache
  it('returns consistent results (cached values match fresh results)', () => {
    const path = 'modules/fa-pack/tokens/goblin.png';
    const firstResult = filter.isExcluded(path);
    const secondResult = filter.isExcluded(path);
    expect(firstResult).toBe(secondResult);
    expect(firstResult).toBe(false);
  });
});

describe('PathFilter configuration', () => {
  it('uses the folders and filename terms it is given', () => {
    const custom = new PathFilter({
      excludedFolders: new Set(['ruins']),
      excludedFilenameTerms: ['statue'],
    });

    expect(custom.isExcluded('maps/ruins/goblin.png')).toBe(true);
    expect(custom.isExcluded('tokens/marble_statue.png')).toBe(true);
    // Constants.js would exclude this; the injected configuration does not.
    expect(custom.isExcluded('some/props/item.png')).toBe(false);
  });

  it('keeps its cache separate from other instances', () => {
    const lenient = new PathFilter({ excludedFolders: new Set(), excludedFilenameTerms: [] });

    expect(lenient.isExcluded('some/props/item.png')).toBe(false);
    expect(pathFilter.isExcluded('some/props/item.png')).toBe(true);
  });
});

describe('PathFilter cache lifecycle', () => {
  it('evicts the oldest quarter when full and keeps answering correctly', () => {
    const small = new PathFilter({ maxCacheSize: 8 });
    const paths = Array.from({ length: 20 }, (_, i) =>
      i % 2 ? `some/props/item-${i}.png` : `tokens/goblin-${i}.png`
    );

    // Two passes: the second is served partly from cache, partly recomputed
    // after eviction — both must agree with the first.
    const first = paths.map((p) => small.isExcluded(p));
    const second = paths.map((p) => small.isExcluded(p));

    expect(second).toEqual(first);
    expect(first).toEqual(paths.map((_, i) => i % 2 === 1));
  });

  it('answers the same after clearCache()', () => {
    const own = new PathFilter();
    const before = own.isExcluded('modules/fa-pack/tiles/floor-01.png');
    own.clearCache();

    expect(own.isExcluded('modules/fa-pack/tiles/floor-01.png')).toBe(before);
  });
});
