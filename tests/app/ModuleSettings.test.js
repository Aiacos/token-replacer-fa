/**
 * The settings registry: what gets registered and how it is read back.
 * @module tests/app/ModuleSettings
 */
import { describe, it, expect, vi } from 'vitest';
import { ModuleSettings } from '../../scripts/app/ModuleSettings.js';

/** An in-memory stand-in for game.settings. */
function fakeStore() {
  const values = new Map();
  return {
    register: vi.fn((moduleId, key, config) => values.set(`${moduleId}.${key}`, config.default)),
    get: vi.fn((moduleId, key) => {
      const full = `${moduleId}.${key}`;
      if (!values.has(full)) throw new Error(`${full} is not a registered game setting`);
      return values.get(full);
    }),
  };
}

describe('ModuleSettings', () => {
  it('registers every declared setting as a localized world setting', () => {
    const store = fakeStore();
    new ModuleSettings(() => store).register();

    expect(store.register).toHaveBeenCalledTimes(ModuleSettings.definitions.length);
    for (const [moduleId, key, config] of store.register.mock.calls) {
      expect(moduleId).toBe('token-replacer-fa');
      expect(config).toMatchObject({
        name: `TOKEN_REPLACER_FA.settings.${key}.name`,
        hint: `TOKEN_REPLACER_FA.settings.${key}.hint`,
        scope: 'world',
        config: true,
      });
      expect(config).not.toHaveProperty('key');
    }
  });

  it('reads back the defaults through the typed getters', () => {
    const store = fakeStore();
    const settings = new ModuleSettings(() => store);
    settings.register();

    expect(settings.fuzzyThreshold).toBe(0.1);
    expect(settings.autoReplace).toBe(false);
    expect(settings.confirmReplace).toBe(true);
    expect(settings.useTVACache).toBe(true);
    expect(settings.refreshTVACache).toBe(false);
    expect(settings.get('debugMode')).toBe(false);
  });

  it('registers token scaling and the dynamic ring with their ranges and choices', () => {
    const store = fakeStore();
    const settings = new ModuleSettings(() => store);
    settings.register();
    const config = (key) => store.register.mock.calls.find(([, k]) => k === key)[2];

    expect(config('scaleTokens')).toMatchObject({ type: Boolean, default: false });
    expect(config('tokenScale')).toMatchObject({
      type: Number,
      range: { min: 0.25, max: 3, step: 0.05 },
      default: 1,
    });
    expect(config('dynamicRing')).toMatchObject({
      type: String,
      default: 'keep',
      choices: {
        keep: 'TOKEN_REPLACER_FA.settings.dynamicRing.choices.keep',
        enable: 'TOKEN_REPLACER_FA.settings.dynamicRing.choices.enable',
        disable: 'TOKEN_REPLACER_FA.settings.dynamicRing.choices.disable',
      },
    });
    expect(settings.scaleTokens).toBe(false);
    expect(settings.tokenScale).toBe(1);
    expect(settings.dynamicRing).toBe('keep');
  });

  it('surfaces a read before registration instead of inventing a value', () => {
    const settings = new ModuleSettings(() => fakeStore());
    expect(() => settings.autoReplace).toThrow(/not a registered/);
  });

  it('reads the store lazily, so it can be constructed before game exists', () => {
    const getStore = vi.fn();
    new ModuleSettings(getStore);
    expect(getStore).not.toHaveBeenCalled();
  });
});
