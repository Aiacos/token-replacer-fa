/**
 * Token Replacer FA - Module settings registry
 * @module app/ModuleSettings
 */

import { MODULE_ID } from '../core/Constants.js';

/**
 * Every world setting the module owns, declared once as data. Foundry
 * localizes the `name`/`hint`/`choices` keys itself; they stay literal so
 * `npm run validate` can check them against lang/en.json.
 * @type {ReadonlyArray<{key: string, name: string, hint: string, type: Function, default: *, range?: Object, choices?: Object}>}
 */
const DEFINITIONS = Object.freeze([
  {
    key: 'fuzzyThreshold',
    name: 'TOKEN_REPLACER_FA.settings.fuzzyThreshold.name',
    hint: 'TOKEN_REPLACER_FA.settings.fuzzyThreshold.hint',
    type: Number,
    range: { min: 0, max: 1, step: 0.1 },
    default: 0.1,
  },
  {
    key: 'searchPriority',
    name: 'TOKEN_REPLACER_FA.settings.searchPriority.name',
    hint: 'TOKEN_REPLACER_FA.settings.searchPriority.hint',
    type: String,
    choices: {
      faNexus: 'TOKEN_REPLACER_FA.priority.faNexus',
      forgeBazaar: 'TOKEN_REPLACER_FA.priority.forgeBazaar',
      both: 'TOKEN_REPLACER_FA.priority.both',
    },
    default: 'both',
  },
  {
    key: 'autoReplace',
    name: 'TOKEN_REPLACER_FA.settings.autoReplace.name',
    hint: 'TOKEN_REPLACER_FA.settings.autoReplace.hint',
    type: Boolean,
    default: false,
  },
  {
    key: 'confirmReplace',
    name: 'TOKEN_REPLACER_FA.settings.confirmReplace.name',
    hint: 'TOKEN_REPLACER_FA.settings.confirmReplace.hint',
    type: Boolean,
    default: true,
  },
  {
    key: 'fallbackFullSearch',
    name: 'TOKEN_REPLACER_FA.settings.fallbackFullSearch.name',
    hint: 'TOKEN_REPLACER_FA.settings.fallbackFullSearch.hint',
    type: Boolean,
    default: false,
  },
  {
    key: 'additionalPaths',
    name: 'TOKEN_REPLACER_FA.settings.additionalPaths.name',
    hint: 'TOKEN_REPLACER_FA.settings.additionalPaths.hint',
    type: String,
    default: '',
  },
  {
    key: 'useTVACache',
    name: 'TOKEN_REPLACER_FA.settings.useTVACache.name',
    hint: 'TOKEN_REPLACER_FA.settings.useTVACache.hint',
    type: Boolean,
    default: true,
  },
  {
    key: 'refreshTVACache',
    name: 'TOKEN_REPLACER_FA.settings.refreshTVACache.name',
    hint: 'TOKEN_REPLACER_FA.settings.refreshTVACache.hint',
    type: Boolean,
    default: false,
  },
  {
    key: 'indexUpdateFrequency',
    name: 'TOKEN_REPLACER_FA.settings.indexUpdateFrequency.name',
    hint: 'TOKEN_REPLACER_FA.settings.indexUpdateFrequency.hint',
    type: String,
    choices: {
      daily: 'TOKEN_REPLACER_FA.frequency.daily',
      weekly: 'TOKEN_REPLACER_FA.frequency.weekly',
      monthly: 'TOKEN_REPLACER_FA.frequency.monthly',
      quarterly: 'TOKEN_REPLACER_FA.frequency.quarterly',
    },
    default: 'weekly',
  },
  {
    key: 'debugMode',
    name: 'TOKEN_REPLACER_FA.settings.debugMode.name',
    hint: 'TOKEN_REPLACER_FA.settings.debugMode.hint',
    type: Boolean,
    default: false,
  },
]);

/**
 * Registers the module's `game.settings` entries and reads them back through
 * named getters, so no caller spells a setting key as a free string.
 *
 * `register()` must run first in the `init` hook: `game.settings.get()` throws
 * for an unregistered key, and the debug logger asks for `debugMode`.
 *
 * @pattern Registry — one declarative table of every setting, registered in one
 * call and read through typed accessors; tests inject the settings store.
 */
export class ModuleSettings {
  /**
   * @param {function(): {register: Function, get: Function}} [getStore] - Returns Foundry's settings store (default: game.settings, read lazily)
   */
  constructor(getStore = () => game.settings) {
    this._getStore = getStore;
  }

  /** @returns {ReadonlyArray<{key: string}>} The declared settings */
  static get definitions() {
    return DEFINITIONS;
  }

  /**
   * Register every declared setting with Foundry.
   * @returns {void}
   */
  register() {
    const store = this._getStore();
    for (const { key, ...definition } of DEFINITIONS) {
      store.register(MODULE_ID, key, {
        scope: 'world',
        config: true,
        ...definition,
      });
    }
  }

  /**
   * Read a setting by key.
   * @param {string} key - Setting key
   * @returns {*} Current value
   */
  get(key) {
    return this._getStore().get(MODULE_ID, /** @type {any} */ (key));
  }

  /** @returns {number} Fuzzy match threshold (0 = exact) */
  get fuzzyThreshold() {
    return this.get('fuzzyThreshold');
  }

  /** @returns {boolean} Replace without asking when the best match is good enough */
  get autoReplace() {
    return this.get('autoReplace');
  }

  /** @returns {boolean} Ask the user to confirm a match */
  get confirmReplace() {
    return this.get('confirmReplace');
  }

  /** @returns {boolean} Read TVA's static cache file directly */
  get useTVACache() {
    return this.get('useTVACache');
  }

  /** @returns {boolean} Ask TVA to rebuild its cache before a run */
  get refreshTVACache() {
    return this.get('refreshTVACache');
  }
}
