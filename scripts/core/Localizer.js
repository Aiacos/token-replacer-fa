/**
 * Token Replacer FA - Localization access
 * @module core/Localizer
 */

import { MODULE_ID } from './Constants.js';

const PREFIX = 'TOKEN_REPLACER_FA.';

/**
 * One owner for every `TOKEN_REPLACER_FA.*` lookup.
 *
 * `localize()` caches the base string per key, because dialogs re-render the
 * same labels on every progress tick. `orEnglish()` is the *declared* fallback
 * for the window before `game.i18n` exists (Constitution, Article III.1).
 *
 * Construction touches no Foundry global, so the singleton is safe at import.
 *
 * @pattern Singleton — one cache and one set of statistics per page; the
 * exported `localizer` is the instance, and the class stays constructible for
 * tests that need a clean cache.
 */
export class Localizer {
  /**
   * @param {function(): ({localize: function(string): string}|undefined)} [getI18n] - Returns Foundry's i18n (default: game.i18n, read lazily)
   */
  constructor(getI18n = () => game?.i18n) {
    this._getI18n = getI18n;
    /** @type {Map<string, string>} */
    this._cache = new Map();
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * Localize a key, caching the base string; placeholders are applied per call.
   * @param {string} key - Key without the TOKEN_REPLACER_FA prefix
   * @param {Object<string, string|number>} [data={}] - {placeholder} values
   * @returns {string} Localized string
   */
  localize(key, data = {}) {
    let str = this._cache.get(key);

    if (!str) {
      str = this._getI18n().localize(`${PREFIX}${key}`);
      this._cache.set(key, str);
      this._misses++;
    } else {
      this._hits++;
    }

    // replaceAll handles repeated placeholders
    for (const [placeholder, value] of Object.entries(data)) {
      str = str.replaceAll(`{${placeholder}}`, String(value));
    }
    return str;
  }

  /**
   * Localize a key, falling back to a declared English string.
   *
   * This exists so a fallback is *declared* rather than improvised. The idiom it
   * replaces — `game.i18n.localize(key) || 'English'` — never fired: Foundry
   * returns the key itself for a missing key, which is truthy, so a missing
   * translation reached the user as a raw `TOKEN_REPLACER_FA.…` string while the
   * English text sat there unreachable. It also throws outright when called
   * before `game.i18n` exists, which is exactly when an init-failure
   * notification needs to say something.
   *
   * Marking these call sites is also what lets `npm run validate` fail on every
   * *other* English literal handed to `ui.notifications.*`: a deliberate
   * fallback is now distinguishable from one that was simply never translated.
   *
   * Not cached: it runs on rare paths, and caching the English fallback would
   * pin it after `game.i18n` arrives.
   *
   * @param {string} key - Key without the TOKEN_REPLACER_FA prefix
   * @param {string} english - Text to use when localization cannot answer
   * @param {Object<string, string|number>} [data={}] - {placeholder} values
   * @returns {string} Localized text, or the English fallback
   */
  orEnglish(key, english, data = {}) {
    const full = `${PREFIX}${key}`;
    let text = english;

    try {
      const localized = this._getI18n()?.localize?.(full);
      // A missing key comes back as the key itself; an empty string is a blank
      // translation. Neither is something to show a user.
      if (localized && localized !== full && localized.trim() !== '') text = localized;
    } catch (error) {
      console.debug(`${MODULE_ID} | Localization unavailable for ${full}:`, error);
    }

    for (const [placeholder, value] of Object.entries(data)) {
      text = text.replaceAll(`{${placeholder}}`, String(value));
    }
    return text;
  }

  /**
   * Cache statistics for the debug log.
   * @returns {{entries: number, hits: number, misses: number}} Current counters
   */
  get stats() {
    return { entries: this._cache.size, hits: this._hits, misses: this._misses };
  }
}

/** The page-wide instance. */
export const localizer = new Localizer();
