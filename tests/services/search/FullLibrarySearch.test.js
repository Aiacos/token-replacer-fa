/**
 * FullLibrarySearch: the `fallbackFullSearch` name search over the whole library.
 * @module tests/services/search/FullLibrarySearch.test
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FullLibrarySearch } from '../../../scripts/services/search/FullLibrarySearch.js';
import { SearchPlan } from '../../../scripts/services/search/SearchPlan.js';

afterEach(() => vi.restoreAllMocks());

/** A FullLibrarySearch over stub sources; `step` is what the plan answers. */
function build({ enabled = true, step = SearchPlan.STEP.INDEX, excluded = () => false } = {}) {
  const index = { search: vi.fn(async () => [{ path: 'a/goblin.webp', source: 'index' }]) };
  const tva = { search: vi.fn(async () => [{ path: 't/goblin.webp', source: 'tva-direct' }]) };
  const fallback = new FullLibrarySearch({
    plan: { stepForFullLibrary: () => step },
    index,
    tva,
    pathFilter: { isExcluded: excluded },
    getSetting: (_module, key) => (key === 'fallbackFullSearch' ? enabled : undefined),
  });
  return { fallback, index, tva };
}

describe('FullLibrarySearch.search()', () => {
  it('looks the lowercased name up in the index and marks every result', async () => {
    const { fallback, index } = build();

    const results = await fallback.search('Goblin Boss');

    expect(index.search).toHaveBeenCalledWith({ kind: 'term', value: 'goblin boss' });
    expect(results).toEqual([
      { path: 'a/goblin.webp', source: 'index', score: 0.5, fromFullSearch: true },
    ]);
  });

  it('uses the TVA cache when the plan says so', async () => {
    const { fallback, tva, index } = build({ step: SearchPlan.STEP.TVA_CACHE });

    const results = await fallback.search('Goblin Boss');

    expect(tva.search).toHaveBeenCalledWith({ kind: 'term', value: 'Goblin Boss' });
    expect(index.search).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ source: 'tva-direct', fromFullSearch: true });
  });

  it('drops results in excluded folders', async () => {
    const { fallback } = build({ excluded: (path) => path.startsWith('a/') });
    expect(await fallback.search('Goblin')).toEqual([]);
  });

  it('answers [] without searching when the setting is off', async () => {
    const { fallback, index } = build({ enabled: false });
    expect(await fallback.search('Goblin')).toEqual([]);
    expect(index.search).not.toHaveBeenCalled();
  });

  it.each([[''], ['  \t '], [null], [undefined]])('answers [] for the name %j', async (name) => {
    const { fallback, index, tva } = build();
    expect(await fallback.search(name)).toEqual([]);
    expect(index.search).not.toHaveBeenCalled();
    expect(tva.search).not.toHaveBeenCalled();
  });

  it('answers [] when no source is ready', async () => {
    const { fallback } = build({ step: null });
    expect(await fallback.search('Goblin')).toEqual([]);
  });

  it('warns and answers [] when the source throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fallback, index } = build();
    index.search.mockRejectedValue(new Error('index exploded'));

    expect(await fallback.search('Goblin')).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Full-library fallback search failed'),
      expect.any(Error)
    );
  });
});
