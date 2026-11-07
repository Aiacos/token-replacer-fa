/**
 * Token Replacer FA - Ordered lookup of TVA image paths
 * @module services/index/TvaPathSourceChain
 */

import { MODULE_ID } from '../../core/Constants.js';
import { DebugLogger } from '../../core/DebugLogger.js';
import {
  PreloadedCacheSource,
  CacheImagePathsSource,
  SearchCacheSource,
  TvaConfigSource,
  GameSettingsSource,
  InternalCacheSource,
} from './TvaPathSources.js';

/**
 * Asks each TVA path source in turn and returns the first non-empty answer.
 *
 * The sources poke at undocumented TVA internals, so any one of them can throw
 * on a TVA release nobody has tested: a getter that explodes, a cache of an
 * unexpected shape. A throwing source is logged and skipped — it used to abort
 * the whole index build, although the next source had the paths.
 *
 * @pattern Chain of Responsibility — each source either answers or passes the
 *   request on; adding a place to look is a new link, not a new `if` in the
 *   service.
 */
export class TvaPathSourceChain {
  /**
   * @param {import('./TvaPathSources.js').TvaPathSource[]} sources - Tried in order
   * @param {Object} [options={}]
   * @param {DebugLogger} [options.logger] - Debug logger
   */
  constructor(sources, options = {}) {
    const { logger = new DebugLogger('TvaPathSourceChain') } = options;
    this._sources = sources;
    this._logger = logger;
  }

  /**
   * The default order: cheapest and most reliable first.
   * @param {Object} deps
   * @param {function(string, string): *} deps.getSetting - Settings accessor
   * @param {DebugLogger} [deps.logger] - Debug logger
   * @param {Object} [deps.globals=globalThis] - Where TVA globals may live
   * @returns {TvaPathSourceChain}
   */
  static createDefault({ getSetting, logger, globals = globalThis }) {
    return new TvaPathSourceChain(
      [
        new PreloadedCacheSource(),
        new CacheImagePathsSource(),
        new SearchCacheSource(),
        new TvaConfigSource(globals),
        new GameSettingsSource(getSetting),
        new InternalCacheSource(globals),
      ],
      { logger }
    );
  }

  /**
   * Return the paths of the first source that has any.
   * @param {import('./TvaPathSources.js').TvaPathContext} context
   * @returns {Promise<Array>} Paths or `{path, name}` objects; empty when no source had any
   */
  async resolve(context) {
    for (const source of this._sources) {
      this._logger.log(`Trying ${source.label}...`);
      let paths;
      try {
        paths = await source.find(context);
      } catch (error) {
        console.warn(`${MODULE_ID} | TVA path source "${source.label}" failed:`, error);
        continue;
      }
      if (Array.isArray(paths) && paths.length > 0) {
        this._logger.log(`${source.label} returned ${paths.length} paths`);
        return paths;
      }
    }
    return [];
  }
}
