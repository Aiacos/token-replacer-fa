/**
 * The composition root: run lifecycle, hook handlers and the macro-facing API.
 * @module tests/app/TokenReplacerApp
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenReplacerApp } from '../../scripts/app/TokenReplacerApp.js';
import { Localizer } from '../../scripts/core/Localizer.js';

let notifications;
let services;
let settings;

/** A run whose execute() resolves only when the test says so. */
function deferredRun() {
  let finish;
  const run = {
    cancelRequested: false,
    execute: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    ),
    cancel: vi.fn(() => {
      run.cancelRequested = true;
    }),
  };
  return { run, finish: (outcome) => finish(outcome) };
}

function build(overrides = {}) {
  return new TokenReplacerApp({
    services,
    settings,
    companions: { hasTVA: false, hasFANexus: false, tvaAPI: null },
    // Foundry answers a missing key with the key itself: only declared English shows.
    localizer: new Localizer(() => ({ localize: (key) => key })),
    getUi: () => ({ notifications }),
    logger: { log: vi.fn() },
    ...overrides,
  });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  notifications = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  settings = { register: vi.fn(), get: vi.fn(() => 'value') };
  services = {
    fuseLoader: { load: vi.fn(async () => function Fuse() {}) },
    templateRenderer: { preload: vi.fn(async () => {}) },
    tokenService: { replaceTokenImage: vi.fn(async () => true) },
    searchService: { init: vi.fn() },
    searchOrchestrator: { terminate: vi.fn(), cancelOperation: vi.fn() },
    tvaCacheService: { loadTVACache: vi.fn() },
    scanService: {},
    indexService: { build: vi.fn(), terminate: vi.fn() },
    storageService: { has: vi.fn() },
    uiManager: {},
  };
});

afterEach(() => vi.restoreAllMocks());

describe('TokenReplacerApp — run lifecycle', () => {
  it('runs one workflow and reports its outcome', async () => {
    const { run, finish } = deferredRun();
    const app = build({ createWorkflow: () => run });

    const pending = app.processTokenReplacement();
    expect(app.isProcessing).toBe(true);
    finish('completed');

    expect(await pending).toBe('completed');
    expect(app.isProcessing).toBe(false);
  });

  it('refuses a second run while one is in progress', async () => {
    const { run, finish } = deferredRun();
    const createWorkflow = vi.fn(() => run);
    const app = build({ createWorkflow });

    const first = app.processTokenReplacement();
    expect(await app.processTokenReplacement()).toBe('busy');
    expect(notifications.warn).toHaveBeenCalledWith('TOKEN_REPLACER_FA.notifications.inProgress');
    expect(createWorkflow).toHaveBeenCalledTimes(1);

    finish('completed');
    await first;
  });

  it('allows a new run after the previous one rejected', async () => {
    const failing = { execute: vi.fn(async () => Promise.reject(new Error('boom'))) };
    const ok = { execute: vi.fn(async () => 'completed') };
    const createWorkflow = vi.fn().mockReturnValueOnce(failing).mockReturnValueOnce(ok);
    const app = build({ createWorkflow });

    await expect(app.processTokenReplacement()).rejects.toThrow('boom');
    expect(app.isProcessing).toBe(false);
    expect(await app.processTokenReplacement()).toBe('completed');
  });

  it('builds a fresh workflow for every run', async () => {
    const createWorkflow = vi.fn(() => ({ execute: vi.fn(async () => 'completed') }));
    const app = build({ createWorkflow });

    await app.processTokenReplacement();
    await app.processTokenReplacement();
    const [first, second] = createWorkflow.mock.results.map((r) => r.value);
    expect(first).not.toBe(second);
  });

  it('forwards cancel to the run in progress, and ignores it otherwise', async () => {
    const { run, finish } = deferredRun();
    const app = build({ createWorkflow: () => run });

    expect(() => app.cancel()).not.toThrow();
    const pending = app.processTokenReplacement();
    app.cancel();
    expect(run.cancel).toHaveBeenCalled();
    expect(app.cancelRequested).toBe(true);

    finish('cancelled');
    await pending;
    expect(app.cancelRequested).toBe(false);
  });
});

describe('TokenReplacerApp — hooks', () => {
  it('registers settings before preloading templates on init', async () => {
    const order = [];
    settings.register.mockImplementation(() => order.push('settings'));
    services.templateRenderer.preload.mockImplementation(async (paths) => {
      order.push('templates');
      expect(paths).toContain('modules/token-replacer-fa/templates/match-selection.hbs');
    });

    expect(await build().initialize()).toBe(true);
    expect(order).toEqual(['settings', 'templates']);
  });

  it('reports a failed init with a declared English fallback', async () => {
    services.templateRenderer.preload.mockRejectedValue(new Error('template 404'));

    expect(await build().initialize()).toBe(false);
    expect(notifications.error).toHaveBeenCalledWith(
      expect.stringContaining('Initialization failed. template 404')
    );
  });

  it('starts nothing on ready for a player', async () => {
    game.user.isGM = false;
    try {
      const { background } = await build().onReady();
      expect(background).toBeNull();
      expect(services.fuseLoader.load).not.toHaveBeenCalled();
    } finally {
      game.user.isGM = true;
    }
  });

  it('adds the scene control button that starts a run', async () => {
    const run = { execute: vi.fn(async () => 'completed') };
    const app = build({ createWorkflow: () => run });
    const controls = { tokens: { tools: {} } };

    expect(app.addSceneControlButton(controls)).toBe(true);
    await controls.tokens.tools.tokenReplacerFA.onChange();
    expect(run.execute).toHaveBeenCalled();
  });

  it('terminates every worker even when one fails', () => {
    services.indexService.terminate.mockImplementation(() => {
      throw new Error('already gone');
    });
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});

    build().terminate();
    expect(services.searchOrchestrator.terminate).toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
  });
});

describe('TokenReplacerApp — macro API', () => {
  it('delegates i18n, settings and companion checks', () => {
    const app = build();
    expect(app.i18n('ui.cancelled')).toBe('TOKEN_REPLACER_FA.ui.cancelled');
    expect(app.getSetting('autoReplace')).toBe('value');
    expect(app.hasTVA).toBe(false);
    expect(app.hasFANexus).toBe(false);
    expect(app.tvaAPI).toBeNull();
    expect(() => app.logI18nCacheStats()).not.toThrow();
  });

  it('replaces a token image through the token service without TVA', async () => {
    const t = { name: 'Goblin' };
    expect(await build().replaceTokenImage(t, 'goblin.webp')).toBe(true);
    expect(services.tokenService.replaceTokenImage).toHaveBeenCalledWith(t, 'goblin.webp', {});
  });
});
