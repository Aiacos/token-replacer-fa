/**
 * Index shape tests (v15: interned paths).
 *
 * Paths used to be repeated in every structure the worker sent back — as the
 * keys of allPaths, inside every category bucket, and once per search term in
 * termIndex. On a 50k-image library that was 44 MB of structured clone, paid on
 * the *main thread* during deserialization, which is precisely what the Web
 * Worker exists to avoid. Interning them in pathList and referencing ids cut it
 * to 10 MB and made the handoff 3.25x faster.
 *
 * These tests pin the invariant that makes it work: every id in every structure
 * resolves to a real path.
 *
 * @module tests/services/IndexService.shape
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexService } from '../../scripts/services/IndexService.js';

/**
 * Create an IndexService with inert dependencies.
 * @returns {IndexService}
 */
function createService() {
  return new IndexService({
    storageService: {
      load: vi.fn(async () => null),
      save: vi.fn(async () => true),
      remove: vi.fn(async () => true),
      needsMigration: vi.fn(async () => false),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
    workerFactory: vi.fn(),
    getSetting: vi.fn(),
    getTvaAPI: vi.fn(),
  });
}

const PATHS = [
  { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', name: 'Wolf' },
  { path: 'FA_Pack/Tokens/Beasts/Wolf/Wolf_02.webp', name: 'Wolf Dire' },
  { path: 'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp', name: 'Skeleton' },
  { path: 'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp', name: 'Bandit' },
];

describe('interned index shape', () => {
  let service;

  beforeEach(async () => {
    service = createService();
    service.index = service.createEmptyIndex();
    await service.indexPathsDirectly(PATHS);
    service.isBuilt = true;
  });

  it('keeps pathList and allPaths the same length', () => {
    expect(service.index.pathList.length).toBe(PATHS.length);
    expect(service.index.allPaths.length).toBe(service.index.pathList.length);
  });

  it('stores each path exactly once', () => {
    expect(new Set(service.index.pathList).size).toBe(service.index.pathList.length);
  });

  it('resolves every termIndex id to a real path', () => {
    const dangling = Object.entries(service.index.termIndex).flatMap(([term, ids]) =>
      ids.filter((id) => service.index.pathList[id] === undefined).map(() => term)
    );
    expect(dangling).toEqual([]);
  });

  it('resolves every category id to a real path', () => {
    const dangling = [];
    for (const [category, subcategories] of Object.entries(service.index.categories)) {
      for (const [subcategory, ids] of Object.entries(subcategories)) {
        for (const id of ids) {
          // An id that outruns pathList would silently drop the image from
          // category browsing, with no error anywhere.
          if (service.index.pathList[id] === undefined) {
            dangling.push(`${category}/${subcategory}#${id}`);
          }
        }
      }
    }
    expect(dangling).toEqual([]);
  });

  it('holds ids, not path strings', () => {
    // A regression here would still "work" for search while quietly restoring
    // the payload the interning removed.
    const termIds = Object.values(service.index.termIndex).flat();
    const categoryIds = Object.values(service.index.categories)
      .flatMap((subcategories) => Object.values(subcategories))
      .flat();

    expect(termIds.every((id) => Number.isInteger(id))).toBe(true);
    expect(categoryIds.every((id) => Number.isInteger(id))).toBe(true);
  });

  it('search returns the resolved path and name', () => {
    const results = service.search('skeleton');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp');
    expect(results[0].name).toBe('Skeleton');
    expect(results[0].source).toBe('index');
  });

  it('searchByCategory resolves ids back to paths', () => {
    const results = service.searchByCategory('beast');

    expect(results.length).toBe(2);
    expect(results.map((result) => result.path).sort()).toEqual([
      'FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp',
      'FA_Pack/Tokens/Beasts/Wolf/Wolf_02.webp',
    ]);
  });

  it('skips a path already interned', async () => {
    const before = service.index.pathList.length;
    await service.indexPathsDirectly(PATHS);
    expect(service.index.pathList.length).toBe(before);
  });
});
