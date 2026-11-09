/**
 * Tests for DebugLogger: opt-in debug output that never throws (Article V.4).
 *
 * @module tests/core/DebugLogger.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setSetting } from '../helpers/mock-helpers.js';
import { DebugLogger } from '../../scripts/core/DebugLogger.js';

describe('DebugLogger', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs when debugMode is true', () => {
    setSetting('debugMode', true);
    const logger = new DebugLogger('TestService');
    logger.log('test message', { data: 1 });
    expect(logSpy).toHaveBeenCalledWith('token-replacer-fa | [TestService] test message', {
      data: 1,
    });
  });

  it('does not log when debugMode is false', () => {
    setSetting('debugMode', false);
    const logger = new DebugLogger('TestService');
    logger.log('test message');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('silently ignores when settings are not registered', () => {
    const originalGet = game.settings.get;
    game.settings.get = vi.fn(() => {
      throw new Error('Settings not registered');
    });
    try {
      const logger = new DebugLogger('TestService');
      expect(() => logger.log('test message')).not.toThrow();
      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      game.settings.get = originalGet;
    }
  });

  it('can be constructed before game exists', () => {
    const originalGame = globalThis.game;
    // @ts-ignore — simulating module load before Foundry defines `game`
    delete globalThis.game;
    try {
      const logger = new DebugLogger('Early');
      expect(() => logger.log('too early')).not.toThrow();
    } finally {
      globalThis.game = originalGame;
    }
  });

  it('reads the setting through an injected accessor', () => {
    const getSetting = vi.fn(() => true);
    new DebugLogger('Injected', getSetting).log('hello');

    expect(getSetting).toHaveBeenCalledWith('token-replacer-fa', 'debugMode');
    expect(logSpy).toHaveBeenCalledWith('token-replacer-fa | [Injected] hello');
  });

  it('asks the setting on every call, so toggling debugMode takes effect at once', () => {
    const logger = new DebugLogger('Toggle');
    setSetting('debugMode', false);
    logger.log('hidden');
    setSetting('debugMode', true);
    logger.log('shown');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('token-replacer-fa | [Toggle] shown');
  });
});
