/**
 * Tests for Settings.defaultGetter: the lazy default for injected getSetting.
 *
 * @module tests/core/Settings.test
 */

import { describe, it, expect } from 'vitest';
import { setSetting } from '../helpers/mock-helpers.js';
import { Settings } from '../../scripts/core/Settings.js';

describe('Settings.defaultGetter', () => {
  it('delegates to game.settings.get', () => {
    setSetting('debugMode', true);
    const getSetting = Settings.defaultGetter();

    expect(getSetting('token-replacer-fa', 'debugMode')).toBe(true);
    expect(game.settings.get).toHaveBeenCalledWith('token-replacer-fa', 'debugMode');
  });

  it('does not touch game until called', () => {
    const originalGame = globalThis.game;
    // @ts-ignore — simulating a service constructed before Foundry defines `game`
    delete globalThis.game;
    try {
      const getSetting = Settings.defaultGetter();
      expect(getSetting).toBeTypeOf('function');
      expect(() => getSetting('token-replacer-fa', 'debugMode')).toThrow(ReferenceError);
    } finally {
      globalThis.game = originalGame;
    }
  });
});
