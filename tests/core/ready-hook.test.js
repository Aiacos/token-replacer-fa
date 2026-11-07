/**
 * The ready hook builds a 50k-image index; only the GM-only scene control ever
 * uses it, so a player's browser must not pay for it.
 *
 * @module tests/core/ready-hook
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  game.user.isGM = true;
  vi.restoreAllMocks();
});

describe('ready hook', () => {
  it('does not load the TVA cache or build the index for a player', async () => {
    vi.resetModules();
    const { tvaCacheService } = await import('../../scripts/services/TVACacheService.js');
    const { indexService } = await import('../../scripts/services/IndexService.js');
    const loadCache = vi.spyOn(tvaCacheService, 'loadTVACache').mockResolvedValue(true);
    const build = vi.spyOn(indexService, 'build').mockResolvedValue(true);
    await import('../../scripts/main.js');
    const [, ready] = Hooks.once.mock.calls.find(([name]) => name === 'ready');

    game.user.isGM = false;
    await ready();

    expect(loadCache).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
    expect(ui.notifications.info).not.toHaveBeenCalled();
    expect(ui.notifications.warn).not.toHaveBeenCalled();
  });
});

describe('token replacement without an active scene', () => {
  it('warns once and does not report a second, unrelated error', async () => {
    vi.resetModules();
    vi.doMock('../../scripts/core/FuseLoader.js', async (importOriginal) => ({
      ...(await importOriginal()),
      fuseLoader: { load: vi.fn(async () => function Fuse() {}) },
    }));
    const { tokenReplacerApp } = await import('../../scripts/main.js');
    const scene = canvas.scene;
    canvas.scene = null;

    try {
      await tokenReplacerApp.processTokenReplacement();
    } finally {
      canvas.scene = scene;
      vi.doUnmock('../../scripts/core/FuseLoader.js');
    }

    expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
    expect(ui.notifications.error).not.toHaveBeenCalled();
    expect(tokenReplacerApp.isProcessing).toBe(false);
  });
});
