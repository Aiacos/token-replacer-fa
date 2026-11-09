/**
 * SearchOrchestrator — the `fallbackFullSearch` setting.
 *
 * When a creature group's normal search finds nothing and the setting is on,
 * one more search runs by the actor's name across the whole library (the index,
 * or the TVA cache when no index is built), ignoring the creature category.
 *
 * @module tests/services/SearchOrchestrator.fallback.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';

const NAME_HITS = [
  { path: 'FA_Pack/Tokens/Misc/Goblin_Boss_02.webp', name: 'Goblin Boss B', score: 0.4 },
  { path: 'FA_Pack/Tokens/Misc/Goblin_Boss_01.webp', name: 'Goblin Boss A', score: 0.1 },
];

/** A creature whose category search yields nothing. */
function goblinBoss(overrides = {}) {
  return {
    actorName: 'Goblin Boss',
    type: 'humanoid',
    subtype: '',
    searchTerms: ['goblin boss', 'goblin'],
    ...overrides,
  };
}

/**
 * Orchestrator over a built index and a loaded TVA cache whose normal search
 * paths find nothing. `settings.fallback` is read on every search. `indexSearch` answers the index's term lookup, which only
 * the fallback uses for a creature without specific subtypes.
 */
function build({
  settings = { fallback: true },
  indexBuilt = true,
  hasTVA = true,
  tvaCacheLoaded = true,
  indexSearch = vi.fn(() => NAME_HITS.map((hit) => ({ ...hit, source: 'index' }))),
  tvaDirect = vi.fn(async () => []),
} = {}) {
  const indexService = {
    isBuilt: indexBuilt,
    search: indexSearch,
    searchMultiple: vi.fn(() => []),
    searchByCategory: vi.fn(() => []),
  };
  const tvaCacheService = {
    hasTVA,
    tvaAPI: { doImageSearch: vi.fn(async () => []) },
    tvaCacheLoaded,
    searchTVACacheDirect: tvaDirect,
    searchTVACacheByCategory: vi.fn(async () => []),
    searchTVACacheMultiple: vi.fn(async () => []),
  };
  const getSetting = vi.fn((_module, key) => {
    if (key === 'searchPriority') return 'faNexus';
    if (key === 'useTVACache') return false;
    if (key === 'fallbackFullSearch') return settings.fallback;
    return undefined;
  });
  const orchestrator = new SearchOrchestrator({
    indexService,
    tvaCacheService,
    forgeBazaarService: { isServiceAvailable: () => false },
    getSetting,
    pathFilter: { isExcluded: () => false },
    workerFactory: vi.fn(() => {
      throw new Error('Worker not available in tests');
    }),
  });
  return { orchestrator, indexService, tvaCacheService };
}

describe('SearchOrchestrator — fallbackFullSearch', () => {
  let warnSpy;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not search the whole library when the setting is off', async () => {
    const { orchestrator, indexService } = build({ settings: { fallback: false } });

    const results = await orchestrator.searchTokenArt(goblinBoss(), null);

    expect(results).toEqual([]);
    expect(indexService.search).not.toHaveBeenCalled();
  });

  it('returns ranked name matches from the index when the category finds nothing', async () => {
    const { orchestrator, indexService } = build();

    const results = await orchestrator.searchTokenArt(goblinBoss(), null);

    expect(indexService.search).toHaveBeenCalledWith('goblin boss');
    expect(results.map((r) => r.name)).toEqual(['Goblin Boss A', 'Goblin Boss B']);
    for (const result of results) {
      expect(result.fromFullSearch).toBe(true);
      expect(result.source).toBe('index');
    }
  });

  it('searches the TVA cache by name when no index is built', async () => {
    const tvaDirect = vi.fn(async (term) =>
      term === 'Goblin Boss'
        ? [{ path: 'tva/Goblin_Boss.webp', name: 'Goblin Boss', source: 'tva-direct', score: 0 }]
        : []
    );
    const { orchestrator } = build({ indexBuilt: false, tvaDirect });

    const results = await orchestrator.searchTokenArt(goblinBoss(), null);

    expect(tvaDirect).toHaveBeenCalledWith('Goblin Boss');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ source: 'tva-direct', fromFullSearch: true });
  });

  it('does not run when neither the index nor the TVA cache is ready', async () => {
    const tvaDirect = vi.fn(async () => []);
    const { orchestrator, indexService } = build({
      indexBuilt: false,
      // Without TVA the category browse skips the slow API path and its real yields.
      hasTVA: false,
      tvaCacheLoaded: false,
      tvaDirect,
    });

    expect(await orchestrator.searchTokenArt(goblinBoss(), null)).toEqual([]);
    expect(indexService.search).not.toHaveBeenCalled();
    expect(tvaDirect).not.toHaveBeenCalled();
  });

  it('leaves a search that found matches untouched', async () => {
    const { orchestrator, indexService } = build();
    indexService.searchByCategory.mockReturnValue([
      { path: 'FA_Pack/Tokens/Humanoids/Goblin_01.webp', name: 'Goblin', source: 'index' },
    ]);

    // A generic subtype browses the category, which now has a match.
    const results = await orchestrator.searchTokenArt(goblinBoss({ subtype: 'any' }), null);

    expect(results.map((r) => r.name)).toEqual(['Goblin']);
    expect(results[0].fromFullSearch).toBeUndefined();
    expect(indexService.search).not.toHaveBeenCalled();
  });

  it.each([[''], ['   '], [undefined]])(
    'never scans the library for the actor name %j',
    async (actorName) => {
      const { orchestrator, indexService, tvaCacheService } = build();

      const results = await orchestrator.searchTokenArt(goblinBoss({ actorName }), null);

      expect(results).toEqual([]);
      expect(indexService.search).not.toHaveBeenCalled();
      expect(tvaCacheService.searchTVACacheDirect).not.toHaveBeenCalled();
    }
  );

  it('resolves the group as no match, with a warning, when the fallback throws', async () => {
    const indexSearch = vi.fn(() => {
      throw new Error('index exploded');
    });
    const { orchestrator } = build({ indexSearch });
    const groups = new Map([
      ['goblin-boss', { creatureInfo: goblinBoss(), tokens: [{ id: 't1' }] }],
    ]);

    const results = await orchestrator.parallelSearchCreatures(groups, null);

    expect(results.get('goblin-boss').matches).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Full-library fallback search failed'),
      expect.any(Error)
    );
  });

  it('applies a setting turned on after an empty answer was cached', async () => {
    const settings = { fallback: false };
    const { orchestrator, indexService } = build({ settings });

    expect(await orchestrator.searchTokenArt(goblinBoss(), null)).toEqual([]);
    settings.fallback = true;
    const results = await orchestrator.searchTokenArt(goblinBoss(), null);

    expect(results).toHaveLength(2);
    expect(indexService.search).toHaveBeenCalledTimes(1);
  });
});
