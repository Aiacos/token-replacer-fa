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
 * @module tests/core/i18n-fallback
 */
import { describe, it, expect, afterEach } from 'vitest';
import { i18nOrEnglish } from '../../scripts/core/Utils.js';

const original = game.i18n;

afterEach(() => {
  game.i18n = original;
});

describe('i18nOrEnglish', () => {
  it('prefers the localized string', () => {
    game.i18n = { localize: () => 'Indice pronto' };

    expect(i18nOrEnglish('notifications.indexingComplete', 'Index ready')).toBe('Indice pronto');
  });

  it('falls back when the key is missing', () => {
    // Foundry hands back the key, which the old `||` idiom accepted as a hit.
    game.i18n = { localize: (key) => key };

    expect(i18nOrEnglish('notifications.nope', 'Index ready')).toBe('Index ready');
  });

  it('falls back on a blank translation', () => {
    game.i18n = { localize: () => '   ' };

    expect(i18nOrEnglish('notifications.blank', 'Index ready')).toBe('Index ready');
  });

  it('falls back before game.i18n exists', () => {
    game.i18n = undefined;

    // The init-hook catch runs in exactly this state.
    expect(i18nOrEnglish('notifications.initFailed', 'Initialization failed')).toBe(
      'Initialization failed'
    );
  });

  it('falls back when localize throws', () => {
    game.i18n = {
      localize: () => {
        throw new Error('i18n not ready');
      },
    };

    expect(i18nOrEnglish('notifications.initFailed', 'Initialization failed')).toBe(
      'Initialization failed'
    );
  });

  it('interpolates placeholders in the localized string', () => {
    game.i18n = { localize: () => 'Indice pronto: {count} immagini' };

    expect(
      i18nOrEnglish('notifications.indexingComplete', 'Index ready: {count}', { count: 42 })
    ).toBe('Indice pronto: 42 immagini');
  });

  it('interpolates placeholders in the fallback too', () => {
    game.i18n = undefined;

    // Otherwise a fallback would surface a literal "{error}" to the user.
    expect(i18nOrEnglish('notifications.initFailed', 'Failed: {error}', { error: 'boom' })).toBe(
      'Failed: boom'
    );
  });
});
