/**
 * One token replacement run, driven entirely through injected fakes.
 * @module tests/app/TokenReplacementWorkflow
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenReplacementWorkflow } from '../../scripts/app/TokenReplacementWorkflow.js';
import { ModuleError } from '../../scripts/core/ModuleError.js';

const token = (name) => ({ name, id: name });

let deps;
let notifications;
let dialogOpen;
let groups;
let matches;

/** Search results as SearchService returns them: one entry per creature group. */
function resultsFor(keys = [...groups.keys()]) {
  return new Map(keys.map((key) => [key, { ...groups.get(key), matches: matches[key] ?? [] }]));
}

function build(overrides = {}) {
  return new TokenReplacementWorkflow({ ...deps, ...overrides });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  groups = new Map([
    ['goblin', { tokens: [token('g1'), token('g2')], creatureInfo: { actorName: 'Goblin' } }],
    ['orc', { tokens: [token('o1')], creatureInfo: { actorName: 'Orc' } }],
  ]);
  matches = {
    goblin: [{ path: 'fa/goblin_1.webp', score: 0.05 }],
    orc: [{ path: 'fa/orc_1.webp', score: 0.4 }],
  };
  notifications = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  dialogOpen = true;

  const dialog = {
    cancelCallback: null,
    createMainDialog: vi.fn(async () => ({ render: vi.fn(async () => {}) })),
    createScanProgressHTML: vi.fn(async () => 'scan'),
    createTVACacheHTML: vi.fn(async () => 'tva'),
    createParallelSearchHTML: vi.fn(async () => 'search'),
    createProgressHTML: vi.fn(async () => 'progress'),
    createNoMatchHTML: vi.fn(async () => 'no-match'),
    createMatchSelectionHTML: vi.fn(async () => 'select'),
    createErrorHTML: vi.fn(async () => 'error'),
    updateDialogContent: vi.fn(),
    setCancelCallback: vi.fn((cb) => {
      dialog.cancelCallback = cb;
    }),
    isDialogOpen: vi.fn(() => dialogOpen),
    getDialogElement: vi.fn(() => ({})),
    setupMatchSelectionHandlers: vi.fn(async () => null),
    setupNoMatchHandlers: vi.fn(async () => null),
  };

  deps = {
    settings: {
      autoReplace: false,
      confirmReplace: false,
      fuzzyThreshold: 0.1,
      useTVACache: true,
      refreshTVACache: false,
    },
    companions: { hasTVA: true, tvaAPI: null },
    fuseLoader: { load: vi.fn(async () => function Fuse() {}) },
    searchService: {
      clearCache: vi.fn(),
      init: vi.fn(),
      parallelSearchCreatures: vi.fn(async () => resultsFor()),
      searchByCategory: vi.fn(),
    },
    searchOrchestrator: { cancelOperation: vi.fn() },
    tvaCacheService: {
      loadTVACache: vi.fn(async () => true),
      reloadTVACache: vi.fn(async () => true),
      getTVACacheStats: vi.fn(() => ({ totalImages: 10 })),
    },
    scanService: { buildLocalTokenIndex: vi.fn(async () => []) },
    tokenService: {
      getSceneNPCTokens: vi.fn(() => [...groups.values()].flatMap((g) => g.tokens)),
      groupTokensByCreature: vi.fn(() => groups),
    },
    dialog,
    imageWriter: { write: vi.fn(async () => true) },
    localizer: { localize: vi.fn((key) => key) },
    getUi: () => ({ notifications }),
    getScene: () => ({ name: 'Crypt' }),
    yieldToMain: async () => {},
    logger: { log: vi.fn() },
  };
});

afterEach(() => vi.restoreAllMocks());

describe('TokenReplacementWorkflow — happy path', () => {
  it('applies the best match to every token and summarises', async () => {
    const run = build();

    expect(await run.execute()).toBe('completed');

    expect(deps.imageWriter.write.mock.calls.map(([t, path]) => [t.name, path])).toEqual([
      ['g1', 'fa/goblin_1.webp'],
      ['g2', 'fa/goblin_1.webp'],
      ['o1', 'fa/orc_1.webp'],
    ]);
    expect(run.results.map((r) => r.status)).toEqual(['success', 'success', 'success']);
    expect(run.results[0]).toEqual({ name: 'Goblin (g1)', status: 'success', match: 'goblin_1' });
    expect(notifications.info).toHaveBeenCalledWith('notifications.complete');
    expect(notifications.warn).not.toHaveBeenCalled();
  });

  it('opens the dialog with force:true and disarms Cancel once tokens change', async () => {
    const run = build();
    await run.execute();

    const dialog = await deps.dialog.createMainDialog.mock.results[0].value;
    expect(dialog.render).toHaveBeenCalledWith({ force: true });
    expect(deps.dialog.setCancelCallback).toHaveBeenLastCalledWith(null);
  });

  it('warns about tokens whose update failed', async () => {
    deps.imageWriter.write.mockResolvedValueOnce(false);

    await build().execute();
    expect(notifications.warn).toHaveBeenCalledWith('notifications.replaceFailed');
  });

  it('auto-replaces a good-enough match without asking', async () => {
    deps.settings.autoReplace = true;
    deps.settings.confirmReplace = true;

    await build().execute();

    // Goblin scores 0.95 ≥ 0.9 and is applied unasked; the orc (0.6) is asked about.
    expect(deps.dialog.createMatchSelectionHTML).toHaveBeenCalledTimes(1);
    expect(deps.dialog.createMatchSelectionHTML.mock.calls[0][0].actorName).toBe('Orc');
  });

  it('applies the art the user picked, through the strategy for the chosen mode', async () => {
    deps.settings.confirmReplace = true;
    deps.dialog.setupMatchSelectionHandlers.mockResolvedValue({
      paths: ['x.webp', 'y.webp'],
      mode: 'random',
    });
    const assignmentFor = vi.fn(() => ({
      assign: (tokens, paths) => tokens.map((t) => ({ token: t, path: paths[1] })),
    }));

    await build({ assignmentFor }).execute();

    expect(assignmentFor).toHaveBeenCalledWith('random');
    expect(deps.imageWriter.write.mock.calls.every(([, path]) => path === 'y.webp')).toBe(true);
  });

  it('skips a group when the user picks nothing', async () => {
    deps.settings.confirmReplace = true;
    const run = build();

    await run.execute();

    expect(deps.imageWriter.write).not.toHaveBeenCalled();
    expect(run.results.map((r) => r.status)).toEqual(['skipped', 'skipped', 'skipped']);
  });

  it('offers the category browser when a creature has no match', async () => {
    matches.orc = [];
    deps.dialog.setupNoMatchHandlers.mockResolvedValue({ paths: ['manual/orc.webp'] });

    await build().execute();

    expect(deps.dialog.createNoMatchHTML).toHaveBeenCalledWith({ actorName: 'Orc' }, 1);
    expect(deps.imageWriter.write).toHaveBeenCalledWith(
      groups.get('orc').tokens[0],
      'manual/orc.webp'
    );
  });
});

describe('TokenReplacementWorkflow — sources', () => {
  it('refreshes TVA first when asked, and survives a failed refresh', async () => {
    const cacheImages = vi.fn(async () => {
      throw new Error('TVA busy');
    });
    deps.settings.refreshTVACache = true;
    deps.companions.tvaAPI = { cacheImages };

    expect(await build().execute()).toBe('completed');
    expect(cacheImages).toHaveBeenCalled();
    expect(deps.tvaCacheService.reloadTVACache).toHaveBeenCalled();
    expect(deps.tvaCacheService.loadTVACache).not.toHaveBeenCalled();
  });

  it('fails with an explanation when the TVA cache is empty', async () => {
    deps.tvaCacheService.getTVACacheStats.mockReturnValue({ totalImages: 0 });

    expect(await build().execute()).toBe('failed');
    expect(deps.dialog.createErrorHTML).toHaveBeenCalledWith(
      expect.objectContaining({ errorType: 'tva_cache_empty' })
    );
    expect(deps.imageWriter.write).not.toHaveBeenCalled();
  });

  it('scans locally without TVA, and fails when that finds nothing', async () => {
    deps.companions.hasTVA = false;

    expect(await build().execute()).toBe('failed');
    expect(deps.scanService.buildLocalTokenIndex).toHaveBeenCalled();
    expect(deps.dialog.createErrorHTML).toHaveBeenCalledWith(
      expect.objectContaining({ errorType: 'tva_missing' })
    );
  });
});

describe('TokenReplacementWorkflow — nothing to do', () => {
  it('warns once without a scene and opens no dialog', async () => {
    expect(await build({ getScene: () => null }).execute()).toBe('nothing-to-do');

    expect(notifications.warn).toHaveBeenCalledTimes(1);
    expect(notifications.warn).toHaveBeenCalledWith('notifications.noScene');
    expect(notifications.error).not.toHaveBeenCalled();
    expect(deps.dialog.createMainDialog).not.toHaveBeenCalled();
  });

  it('reports an empty scene as information, not an error', async () => {
    deps.tokenService.getSceneNPCTokens.mockReturnValue([]);

    expect(await build().execute()).toBe('nothing-to-do');
    expect(notifications.info).toHaveBeenCalledWith('notifications.noTokens');
    expect(deps.dialog.createMainDialog).not.toHaveBeenCalled();
  });
});

describe('TokenReplacementWorkflow — failures', () => {
  it('reports a missing Fuse.js as a notification when no dialog is open', async () => {
    deps.fuseLoader.load.mockResolvedValue(null);
    dialogOpen = false;

    expect(await build().execute()).toBe('failed');
    expect(notifications.error).toHaveBeenCalledTimes(1);
    expect(notifications.error.mock.calls[0][1]).toEqual({ permanent: true });
  });

  it('classifies an unstructured error so the dialog can suggest a fix', async () => {
    deps.searchService.parallelSearchCreatures.mockRejectedValue(new Error('network down'));

    expect(await build().execute()).toBe('failed');
    expect(deps.dialog.createErrorHTML).toHaveBeenCalledWith(
      expect.objectContaining({ errorType: 'network_error' })
    );
  });

  it('keeps going when a search failed for one creature group', async () => {
    // SearchOrchestrator drops a group whose search rejected; the rest arrive.
    deps.searchService.parallelSearchCreatures.mockResolvedValue(resultsFor(['orc']));

    expect(await build().execute()).toBe('completed');
    expect(deps.imageWriter.write).toHaveBeenCalledTimes(1);
    expect(deps.imageWriter.write.mock.calls[0][0].name).toBe('o1');
  });

  it('marks a failing group failed and still applies the other groups', async () => {
    deps.settings.confirmReplace = true;
    deps.dialog.setupMatchSelectionHandlers
      .mockRejectedValueOnce(new Error('handler exploded'))
      .mockResolvedValueOnce({ paths: ['fa/orc_1.webp'] });
    const run = build();

    expect(await run.execute()).toBe('completed');
    expect(run.results.map((r) => [r.name, r.status])).toEqual([
      ['Goblin (g1)', 'failed'],
      ['Goblin (g2)', 'failed'],
      ['Orc (o1)', 'success'],
    ]);
    expect(notifications.warn).toHaveBeenCalledWith('notifications.replaceFailed');
  });

  it('stops applying and stays quiet once the user closes the dialog', async () => {
    deps.imageWriter.write.mockImplementation(async () => {
      dialogOpen = false;
      return true;
    });

    expect(await build().execute()).toBe('completed');
    expect(deps.imageWriter.write).toHaveBeenCalledTimes(1);
    expect(notifications.info).not.toHaveBeenCalledWith('notifications.complete');
  });
});

describe('TokenReplacementWorkflow — cancellation', () => {
  it('stops after the search when Cancel is pressed mid-run, touching no token', async () => {
    const run = build();
    deps.searchService.parallelSearchCreatures.mockImplementation(async () => {
      deps.dialog.cancelCallback(); // the user presses Cancel during the search
      return resultsFor();
    });

    expect(await run.execute()).toBe('cancelled');
    expect(run.cancelRequested).toBe(true);
    expect(deps.searchOrchestrator.cancelOperation).toHaveBeenCalled();
    expect(deps.imageWriter.write).not.toHaveBeenCalled();
    expect(deps.dialog.createErrorHTML).toHaveBeenCalledWith({
      errorType: 'info',
      message: 'ui.cancelled',
    });
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('treats a cancellation error from the search as an outcome', async () => {
    deps.searchService.parallelSearchCreatures.mockRejectedValue(ModuleError.cancelled());
    dialogOpen = false;
    const run = build();

    expect(await run.execute()).toBe('cancelled');
    expect(run.cancelRequested).toBe(true);
    expect(notifications.info).toHaveBeenCalledWith('ui.cancelled');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('stops before searching when cancelled while sources load', async () => {
    const run = build();
    deps.tvaCacheService.loadTVACache.mockImplementation(async () => {
      run.cancel();
      return true;
    });

    expect(await run.execute()).toBe('cancelled');
    expect(deps.searchService.parallelSearchCreatures).not.toHaveBeenCalled();
  });

  it('leaves no cancel callback armed when the run ends', async () => {
    await build().execute();
    expect(deps.dialog.cancelCallback).toBeNull();
  });
});

describe('TokenReplacementWorkflow — after Cancel', () => {
  it('stops repainting progress over the cancelled screen', async () => {
    deps.settings.refreshTVACache = true;
    let paintsBeforeCancel = -1;
    deps.companions.tvaAPI = {
      cacheImages: vi.fn(async () => {
        paintsBeforeCancel = deps.dialog.updateDialogContent.mock.calls.length;
        await deps.dialog.cancelCallback();
      }),
    };
    const run = build();

    expect(await run.execute()).toBe('cancelled');

    const progressAfterCancel = deps.dialog.updateDialogContent.mock.calls
      .map(([html]) => html)
      .slice(paintsBeforeCancel)
      .filter((html) => html === 'tva' || html === 'search');
    expect(progressAfterCancel).toEqual([]);
  });
});
