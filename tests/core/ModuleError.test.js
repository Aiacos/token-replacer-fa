/**
 * Tests for ModuleError: the structured error every service throws.
 *
 * Callers depend on the fields, not the class: `errorType`, `message`,
 * `details`, `recoverySuggestions`, and `cancelled` for a user cancellation.
 *
 * @module tests/core/ModuleError.test
 */

import { describe, it, expect } from 'vitest';
import { ModuleError } from '../../scripts/core/ModuleError.js';

describe('ModuleError.of', () => {
  it('returns structured error with errorType and message', () => {
    const err = ModuleError.of('search_failed', 'Something went wrong');
    expect(err.errorType).toBe('search_failed');
    expect(err.message).toBe('TOKEN_REPLACER_FA.errors.search_failed');
    expect(err.details).toBe('Something went wrong');
  });

  it('calls game.i18n.localize with correct key pattern', () => {
    ModuleError.of('tva_unavailable', 'No TVA');
    expect(game.i18n.localize).toHaveBeenCalledWith('TOKEN_REPLACER_FA.errors.tva_unavailable');
  });

  it('maps recoveryKeys to localized recovery suggestions', () => {
    const err = ModuleError.of('search_failed', 'Error', ['check_tva', 'refresh_cache']);
    expect(err.recoverySuggestions).toEqual([
      'TOKEN_REPLACER_FA.recovery.check_tva',
      'TOKEN_REPLACER_FA.recovery.refresh_cache',
    ]);
  });

  it('returns empty recoverySuggestions when no keys provided', () => {
    const err = ModuleError.of('search_failed', 'Error');
    expect(err.recoverySuggestions).toEqual([]);
  });

  it('is a real Error, with a stack for the console', () => {
    const err = ModuleError.of('search_failed', 'Error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ModuleError);
    expect(err.name).toBe('ModuleError');
    expect(err.stack).toEqual(expect.any(String));
  });

  it('is not a cancellation', () => {
    expect(ModuleError.of('search_failed', 'Error').cancelled).toBeFalsy();
  });

  it('still throws when game.i18n is unavailable, as the free function did', () => {
    const original = game.i18n;
    game.i18n = undefined;
    try {
      expect(() => ModuleError.of('search_failed', 'Error')).toThrow(TypeError);
    } finally {
      game.i18n = original;
    }
  });
});

describe('ModuleError.cancelled', () => {
  it('is marked so build() can tell it apart from a worker failure', () => {
    const error = ModuleError.cancelled();

    expect(error).toBeInstanceOf(Error);
    expect(error.cancelled).toBe(true);
    expect(error.message).toBe('Operation cancelled');
  });

  it('carries no errorType, so wrapping catches do not treat it as structured', () => {
    // IndexService re-throws anything with an errorType as-is and wraps the
    // rest; a cancellation must reach the `cancelled` check instead.
    expect(ModuleError.cancelled().errorType).toBeFalsy();
  });

  it('does not touch game.i18n', () => {
    const original = game.i18n;
    game.i18n = undefined;
    try {
      expect(ModuleError.cancelled().cancelled).toBe(true);
    } finally {
      game.i18n = original;
    }
  });
});
