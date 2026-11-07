/**
 * The ready-hook startup: Fuse.js, TVA cache, background index build.
 * @module tests/app/IndexBootstrapper
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IndexBootstrapper } from '../../scripts/app/IndexBootstrapper.js';
import { ModuleError } from '../../scripts/core/ModuleError.js';

let deps;
let notifications;
let stopHandle;

function build(overrides = {}) {
  return new IndexBootstrapper({ ...deps, ...overrides });
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  notifications = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  stopHandle = { dismiss: vi.fn() };
  deps = {
    companions: { hasTVA: true, hasFANexus: false },
    fuseLoader: { load: vi.fn(async () => function Fuse() {}) },
    searchService: { init: vi.fn() },
    tvaCacheService: {
      loadTVACache: vi.fn(async () => true),
      getTVACacheStats: vi.fn(() => ({ totalImages: 3, categories: 1 })),
      isTVACacheLoaded: true,
      tvaCacheImages: ['img'],
    },
    indexService: {
      build: vi.fn(async () => true),
      getStats: vi.fn(() => ({ totalImages: 3 })),
      cancelOperation: vi.fn(),
    },
    storageService: { has: vi.fn(async () => false) },
    notification: { show: vi.fn(() => stopHandle) },
    localizer: {
      localize: vi.fn((key) => key),
      orEnglish: vi.fn((key) => key),
    },
    isGM: () => true,
    getUi: () => ({ notifications }),
    logger: { log: vi.fn() },
  };
});

afterEach(() => vi.restoreAllMocks());

describe('IndexBootstrapper.run', () => {
  it('does nothing at all for a player', async () => {
    const result = await build({ isGM: () => false }).run();

    expect(result.background).toBeNull();
    expect(deps.fuseLoader.load).not.toHaveBeenCalled();
    expect(deps.tvaCacheService.loadTVACache).not.toHaveBeenCalled();
    expect(deps.indexService.build).not.toHaveBeenCalled();
    expect(notifications.info).not.toHaveBeenCalled();
  });

  it('skips the cache and index without TVA', async () => {
    const result = await build({ companions: { hasTVA: false } }).run();

    expect(result.background).toBeNull();
    expect(deps.searchService.init).toHaveBeenCalled();
    expect(deps.indexService.build).not.toHaveBeenCalled();
  });

  it('warns when Fuse.js cannot be loaded, and carries on', async () => {
    deps.fuseLoader.load.mockResolvedValue(null);
    const { background } = await build().run();
    await background;

    expect(notifications.warn).toHaveBeenCalledWith('notifications.fuseLoadFailed');
    expect(deps.indexService.build).toHaveBeenCalled();
  });

  it('loads the cache, then builds the index from it, in the background', async () => {
    const { background } = await build().run();
    await background;

    expect(deps.tvaCacheService.loadTVACache).toHaveBeenCalled();
    expect(deps.indexService.build).toHaveBeenCalledWith(false, expect.any(Function), ['img']);
  });
});

describe('IndexBootstrapper.buildIndex', () => {
  it('announces a first-time build, offers a stop control and dismisses it', async () => {
    expect(await build().buildIndex()).toBe(true);

    expect(notifications.info).toHaveBeenCalledWith('notifications.indexingStart', {
      permanent: false,
    });
    expect(deps.notification.show).toHaveBeenCalledWith(
      'notifications.indexingStoppable',
      expect.any(Function)
    );
    expect(stopHandle.dismiss).toHaveBeenCalled();
    expect(notifications.info).toHaveBeenCalledWith('notifications.indexingComplete', {
      permanent: false,
    });
  });

  it('wires the stop control to the index build', async () => {
    await build().buildIndex();
    const [, onStop] = deps.notification.show.mock.calls[0];

    onStop();
    expect(deps.indexService.cancelOperation).toHaveBeenCalled();
  });

  it('rebuilds silently from a cached index', async () => {
    deps.storageService.has.mockResolvedValue(true);

    expect(await build().buildIndex()).toBe(true);
    expect(deps.indexService.build).toHaveBeenCalledWith(false, null, ['img']);
    expect(deps.notification.show).not.toHaveBeenCalled();
    expect(notifications.info).not.toHaveBeenCalled();
  });

  it('reports a stopped build as an outcome and still dismisses the control', async () => {
    deps.indexService.build.mockRejectedValue(ModuleError.cancelled());

    expect(await build().buildIndex()).toBe(false);
    expect(stopHandle.dismiss).toHaveBeenCalled();
    expect(notifications.info).toHaveBeenCalledWith('notifications.indexingStopped');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('logs a failed build without notifying or throwing', async () => {
    deps.indexService.build.mockRejectedValue(new Error('worker died'));

    expect(await build().buildIndex()).toBe(false);
    expect(console.warn).toHaveBeenCalled();
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('throttles progress to roughly 10% steps', async () => {
    deps.indexService.build.mockImplementation(async (_force, onProgress) => {
      for (let i = 1; i <= 1000; i++) onProgress(i, 1000, i);
      return true;
    });

    await build().buildIndex();
    const progress = notifications.info.mock.calls.filter(
      ([text]) => text === 'notifications.indexing'
    );
    expect(progress.length).toBeGreaterThanOrEqual(10);
    expect(progress.length).toBeLessThanOrEqual(11);
  });
});

describe('IndexBootstrapper.buildInBackground', () => {
  it('still builds the index when the TVA cache fails to load', async () => {
    deps.tvaCacheService.loadTVACache.mockRejectedValue(new Error('404'));
    deps.tvaCacheService.isTVACacheLoaded = false;

    await expect(build().buildInBackground()).resolves.toBeUndefined();
    expect(deps.indexService.build).toHaveBeenCalledWith(false, expect.any(Function), null);
  });

  it('builds the index when the cache reports it could not load', async () => {
    deps.tvaCacheService.loadTVACache.mockResolvedValue(false);

    await build().buildInBackground();
    expect(console.warn).toHaveBeenCalled();
    expect(deps.indexService.build).toHaveBeenCalled();
  });
});
