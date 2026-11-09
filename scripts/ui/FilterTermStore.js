/**
 * Token Replacer FA - Filter term persistence
 * @module ui/FilterTermStore
 */

import { MODULE_ID } from '../core/Constants.js';

/**
 * Remembers the match filter between the dialogs of one run, so a GM who
 * filtered "dwarf" for the first creature finds it still typed for the next.
 * The dialog clears it on close: it is session state, not a preference.
 *
 * Storage can throw (private browsing, quota, a sandboxed iframe), and a
 * remembered filter is a convenience, so every failure is logged and absorbed.
 *
 * @pattern Repository — the dialogs ask for "the filter term" and never learn
 * that it lives in localStorage, under which key, or how long it may be.
 */
export class FilterTermStore {
  static KEY = 'token-replacer-fa-filter-term';

  /** A restored term longer than this is truncated; nobody types more. */
  static MAX_LENGTH = 200;

  /**
   * @param {function(): (Storage|undefined)} [getStorage] - Returns the backing store (default: localStorage, read lazily)
   */
  constructor(getStorage = () => globalThis.localStorage) {
    this._getStorage = getStorage;
  }

  /**
   * Remember a term; a blank term forgets the previous one.
   * @param {string} term - Raw filter text
   */
  save(term) {
    try {
      if (term && term.trim().length > 0) {
        this._getStorage().setItem(FilterTermStore.KEY, term);
      } else {
        this._getStorage().removeItem(FilterTermStore.KEY);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to save filter term:`, error);
    }
  }

  /**
   * @returns {string} The remembered term, or '' when none or unreadable
   */
  load() {
    try {
      const term = this._getStorage().getItem(FilterTermStore.KEY) || '';
      return term.slice(0, FilterTermStore.MAX_LENGTH);
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to load filter term:`, error);
      return '';
    }
  }

  /** Forget the term. */
  clear() {
    try {
      this._getStorage().removeItem(FilterTermStore.KEY);
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to clear filter term:`, error);
    }
  }
}
