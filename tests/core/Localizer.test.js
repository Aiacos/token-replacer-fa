/**
 * Declared-fallback tests.
 *
 * `game.i18n.localize(key) || 'English'` looks like a fallback and is not one:
 * Foundry returns the key itself when it is missing, and the key is truthy, so
 * the English text was unreachable while the user got a raw
 * `TOKEN_REPLACER_FA.…` string. The same call also throws outright before
 * `game.i18n` exists — which is exactly when an init-failure notification has
 * something to say.
 *
 * @module tests/core/Localizer.test
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Localizer, localizer } from '../../scripts/core/Localizer.js';

const original = game.i18n;

afterEach(() => {
  game.i18n = original;
});

describe('Localizer.orEnglish', () => {
  it('prefers the localized string', () => {
    game.i18n = { localize: () => 'Indice pronto' };

    expect(localizer.orEnglish('notifications.indexingComplete', 'Index ready')).toBe(
      'Indice pronto'
    );
  });

  it('falls back when the key is missing', () => {
    // Foundry hands back the key, which the old `||` idiom accepted as a hit.
    game.i18n = { localize: (key) => key };

    expect(localizer.orEnglish('notifications.nope', 'Index ready')).toBe('Index ready');
  });

  it('falls back on a blank translation', () => {
    game.i18n = { localize: () => '   ' };

    expect(localizer.orEnglish('notifications.blank', 'Index ready')).toBe('Index ready');
  });

  it('falls back before game.i18n exists', () => {
    game.i18n = undefined;

    // The init-hook catch runs in exactly this state.
    expect(localizer.orEnglish('notifications.initFailed', 'Initialization failed')).toBe(
      'Initialization failed'
    );
  });

  it('falls back when localize throws', () => {
    game.i18n = {
      localize: () => {
        throw new Error('i18n not ready');
      },
    };

    expect(localizer.orEnglish('notifications.initFailed', 'Initialization failed')).toBe(
      'Initialization failed'
    );
  });

  it('interpolates placeholders in the localized string', () => {
    game.i18n = { localize: () => 'Indice pronto: {count} immagini' };

    expect(
      localizer.orEnglish('notifications.indexingComplete', 'Index ready: {count}', { count: 42 })
    ).toBe('Indice pronto: 42 immagini');
  });

  it('interpolates placeholders in the fallback too', () => {
    game.i18n = undefined;

    // Otherwise a fallback would surface a literal "{error}" to the user.
    expect(
      localizer.orEnglish('notifications.initFailed', 'Failed: {error}', { error: 'boom' })
    ).toBe('Failed: boom');
  });
});

describe('Localizer.localize', () => {
  it('prefixes the namespace and caches the base string per key', () => {
    const localize = vi.fn(() => 'Cerca');
    const own = new Localizer(() => ({ localize }));

    expect(own.localize('dialog.search')).toBe('Cerca');
    expect(own.localize('dialog.search')).toBe('Cerca');

    expect(localize).toHaveBeenCalledTimes(1);
    expect(localize).toHaveBeenCalledWith('TOKEN_REPLACER_FA.dialog.search');
    expect(own.stats).toEqual({ entries: 1, hits: 1, misses: 1 });
  });

  it('applies placeholders per call without polluting the cache', () => {
    const own = new Localizer(() => ({ localize: () => '{count} di {count}, {name}' }));

    expect(own.localize('ui.count', { count: 3, name: 'orco' })).toBe('3 di 3, orco');
    expect(own.localize('ui.count', { count: 5, name: 'elfo' })).toBe('5 di 5, elfo');
  });

  it('leaves unknown placeholders in place', () => {
    const own = new Localizer(() => ({ localize: () => 'Hello {name}' }));

    expect(own.localize('ui.hello')).toBe('Hello {name}');
  });

  it('throws when game.i18n is missing, like the call it replaces', () => {
    const own = new Localizer(() => undefined);

    expect(() => own.localize('ui.hello')).toThrow(TypeError);
  });

  it('can be constructed before game exists', () => {
    const originalGame = globalThis.game;
    // @ts-ignore — simulating module load before Foundry defines `game`
    delete globalThis.game;
    try {
      const early = new Localizer();
      expect(early.orEnglish('ui.hello', 'Hello')).toBe('Hello');
    } finally {
      globalThis.game = originalGame;
    }
  });
});
