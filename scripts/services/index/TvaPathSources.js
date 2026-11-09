/**
 * Token Replacer FA - Places TVA may keep its image paths
 * @module services/index/TvaPathSources
 */

import { MODULE_ID } from '../../core/Constants.js';
import { TvaCachePathExtractor } from './TvaCachePathExtractor.js';

/**
 * @typedef {Object} TvaPathContext
 * @property {Object} tvaAPI - `game.modules.get('token-variants').api`
 * @property {Array<{path: string, name: string, category: string}>|null} [tvaCacheImages]
 *   Images TVACacheService already parsed from TVA's static cache file
 */

/**
 * @typedef {Object} TvaPathSource
 * @property {string} label - Name used in debug and failure logs
 * @property {function(TvaPathContext): (Array|Promise<Array>)} find
 *   Paths (strings or `{path, name}` objects) this source holds; empty when it holds none
 */

/**
 * The images TVACacheService already parsed from TVA's static cache file.
 * The fastest source by far: no TVA call, and names come with the paths.
 *
 * @pattern Chain of Responsibility (handler) — first link of TvaPathSourceChain.
 */
export class PreloadedCacheSource {
  label = 'pre-loaded TVA cache';

  /**
   * @param {TvaPathContext} context
   * @returns {Array<{path: string, name: string, category: string}>}
   */
  find({ tvaCacheImages }) {
    if (!tvaCacheImages?.length) return [];
    console.log(
      `${MODULE_ID} | Using pre-loaded TVA cache (FAST PATH): ${tvaCacheImages.length} images`
    );
    return tvaCacheImages.map((img) => ({
      path: img.path,
      name: img.name,
      category: img.category,
    }));
  }
}

/**
 * TVA's `cacheImagePaths` property, when a TVA release exposes it.
 *
 * @pattern Chain of Responsibility (handler)
 */
export class CacheImagePathsSource {
  label = 'TVA cacheImagePaths';

  /**
   * @param {TvaPathContext} context
   * @returns {string[]}
   */
  find({ tvaAPI }) {
    const cache = tvaAPI.cacheImagePaths;
    if (!cache || typeof cache !== 'object') return [];
    console.log(`${MODULE_ID} | Reading from TVA cacheImagePaths...`);
    return TvaCachePathExtractor.extractPaths(cache);
  }
}

/**
 * TVA's `getSearchCache()` API method, when present.
 *
 * @pattern Chain of Responsibility (handler)
 */
export class SearchCacheSource {
  label = 'TVA getSearchCache';

  /**
   * @param {TvaPathContext} context
   * @returns {Promise<string[]>}
   */
  async find({ tvaAPI }) {
    if (typeof tvaAPI.getSearchCache !== 'function') return [];
    console.log(`${MODULE_ID} | Reading from TVA getSearchCache...`);
    return TvaCachePathExtractor.extractPaths(await tvaAPI.getSearchCache());
  }
}

/**
 * TVA_CONFIG inspection plus the global variables some TVA builds set.
 *
 * TVA_CONFIG itself has never held the cache (`staticCache` is a boolean flag),
 * so the inspection only logs candidates for a bug report; the globals are the
 * part that can actually return paths.
 *
 * @pattern Chain of Responsibility (handler)
 */
export class TvaConfigSource {
  label = 'TVA_CONFIG inspection';

  /** Globals some TVA builds have used for their image cache. */
  static GLOBALS = Object.freeze(['TVA_IMAGES', 'TVA_CACHE', 'TVA_STATIC_CACHE', 'tvaImageCache']);

  /**
   * @param {Object} [globals=globalThis] - Where to look for TVA globals
   */
  constructor(globals = globalThis) {
    this._globals = globals;
  }

  /**
   * @param {TvaPathContext} context
   * @returns {string[]}
   */
  find({ tvaAPI }) {
    if (tvaAPI.TVA_CONFIG) this._logConfig(tvaAPI.TVA_CONFIG);

    for (const name of TvaConfigSource.GLOBALS) {
      const value = this._globals[name];
      if (!value) continue;
      console.log(`${MODULE_ID} | Found global ${name}:`, typeof value);
      const paths = TvaCachePathExtractor.extractPaths(value);
      if (paths.length > 0) return paths;
    }
    return [];
  }

  /**
   * Log every TVA_CONFIG property large enough to be a cache.
   * @param {Object} config - TVA_CONFIG
   * @returns {void}
   * @private
   */
  _logConfig(config) {
    console.log(`${MODULE_ID} | Checking TVA_CONFIG...`);
    const configKeys = Object.keys(config);
    console.log(`${MODULE_ID} | TVA_CONFIG keys (${configKeys.length}):`, configKeys);

    for (const key of configKeys) {
      const val = config[key];
      const isMap = val instanceof Map;
      const isLarge =
        val &&
        (Array.isArray(val) || isMap || (typeof val === 'object' && Object.keys(val).length > 100));
      if (!isLarge) continue;
      console.log(`${MODULE_ID} | TVA_CONFIG.${key} is potential cache:`, {
        type: typeof val,
        isArray: Array.isArray(val),
        isMap,
        constructor: val?.constructor?.name,
        size: Array.isArray(val) ? val.length : isMap ? val.size : Object.keys(val).length,
      });
    }

    console.log(
      `${MODULE_ID} | staticCache is:`,
      config.staticCache,
      '(this is just a flag, not the cache)'
    );
    if (config.searchPaths) console.log(`${MODULE_ID} | Found searchPaths:`, config.searchPaths);
  }
}

/**
 * Foundry world settings under which TVA may persist its static cache.
 *
 * @pattern Chain of Responsibility (handler)
 */
export class GameSettingsSource {
  label = 'game settings';

  /** Setting names TVA has used, in the order they are tried. */
  static SETTING_NAMES = Object.freeze([
    'staticCache',
    'staticCachePaths',
    'cachedImages',
    'imageCache',
    'cacheData',
  ]);

  /**
   * @param {function(string, string): *} getSetting - Settings accessor (throws when unregistered)
   */
  constructor(getSetting) {
    this._getSetting = getSetting;
  }

  /**
   * @returns {string[]}
   */
  find() {
    console.log(`${MODULE_ID} | Trying TVA game settings...`);
    for (const name of GameSettingsSource.SETTING_NAMES) {
      let data;
      try {
        data = this._getSetting('token-variants', name);
      } catch (error) {
        // An unregistered setting is the normal case on most TVA versions.
        console.debug(`${MODULE_ID} | TVA setting "${name}" not accessible:`, error);
        continue;
      }
      if (!data) continue;
      console.log(`${MODULE_ID} | Found ${name} in settings`);
      const paths = TvaCachePathExtractor.extractPaths(data);
      if (paths.length > 0) return paths;
    }
    return [];
  }
}

/**
 * Undocumented internal cache locations — the last place worth looking before
 * the slow `doImageSearch` fallback.
 *
 * @pattern Chain of Responsibility (handler) — last link of TvaPathSourceChain.
 */
export class InternalCacheSource {
  label = 'TVA internal cache';

  /**
   * @param {Object} [globals=globalThis] - Where `TVA` and `TVA_CACHE` may live
   */
  constructor(globals = globalThis) {
    this._globals = globals;
  }

  /**
   * @param {TvaPathContext} context
   * @returns {string[]}
   */
  find({ tvaAPI }) {
    console.log(`${MODULE_ID} | Trying to access TVA internal cache...`);
    // tvaAPI already is game.modules.get('token-variants').api, so tvaAPI.cache
    // also covers the module's api.cache.
    const candidates = [
      tvaAPI.cache,
      tvaAPI._cache,
      tvaAPI.imageCache,
      tvaAPI.staticCache,
      this._globals.TVA?.cache,
      this._globals.TVA?.staticCache,
      this._globals.TVA_CACHE,
    ];

    for (const cache of candidates) {
      if (!cache) continue;
      console.log(`${MODULE_ID} | Found potential cache:`, typeof cache, cache?.constructor?.name);
      const paths = TvaCachePathExtractor.extractPaths(cache);
      if (paths.length > 0) return paths;
    }
    return [];
  }
}
