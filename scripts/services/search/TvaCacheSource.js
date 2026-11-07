/**
 * Token Replacer FA - Token Variant Art search source
 * @module services/search/TvaCacheSource
 */

import { MODULE_ID } from '../../core/Constants.js';
import { TvaResultParser } from '../../core/TvaResultParser.js';

/**
 * Finds token art through Token Variant Art. Once `TVACacheService` has loaded
 * TVA's static cache file every lookup is a direct, in-memory read; before
 * that, a single term falls back to TVA's much slower `doImageSearch` API.
 *
 * A loaded cache is treated as complete: a term it does not know returns `[]`
 * rather than falling through to the API, which would only repeat the miss
 * slowly.
 *
 * The `doImageSearch` result format has changed across TVA releases (array,
 * Map keyed by term, Map keyed by path, object wrapping an array), so the slow
 * path accepts all of them. Its failures are logged and yield `[]`: the API is
 * a best-effort fallback and must not abort a whole creature search. Cache
 * failures propagate like every other source's.
 * TVA API reference: https://github.com/Aedif/TokenVariants
 *
 * @pattern Strategy — one interchangeable `SearchSource`; `SearchPlan` decides
 * when it runs.
 */
export class TvaCacheSource {
  /**
   * @param {Object|null} tvaCacheService - TVACacheService-like
   * @param {Object} deps - Collaborators
   * @param {{isExcluded: function(string): boolean}} deps.pathFilter - Excluded-folder filter
   * @param {{log: function(...*): void}} deps.logger - Debug logger
   */
  constructor(tvaCacheService, { pathFilter, logger }) {
    this._tva = tvaCacheService;
    this._pathFilter = pathFilter;
    this._logger = logger;
  }

  /** @returns {string} Source id */
  get name() {
    return 'tva';
  }

  /**
   * TVA is installed and its API was found.
   * @returns {boolean}
   */
  isAvailable() {
    return Boolean(this._tva?.hasTVA);
  }

  /**
   * TVA's static cache is loaded, so lookups are direct reads.
   * @returns {boolean}
   */
  isCacheLoaded() {
    return Boolean(this._tva?.tvaCacheLoaded);
  }

  /**
   * @param {import('./SearchSource.js').SearchQuery} query - What to look for.
   *   `terms` and `category` need the loaded cache; `term` also works through
   *   the API before the cache is loaded.
   * @returns {Promise<Array<Object>>} TVA results (`source: 'tva'`)
   */
  async search(query) {
    const { kind, value } = query;
    if (!value || value.length === 0) return [];
    switch (kind) {
      case 'term':
        return this._searchTerm(value);
      case 'terms':
        return (await this._tva.searchTVACacheMultiple(value)) ?? [];
      case 'category':
        return (await this._tva.searchTVACacheByCategory(value)) ?? [];
      default:
        return [];
    }
  }

  /**
   * One term: the direct cache when loaded, otherwise TVA's API.
   * @private
   * @param {string} term - Search term
   * @returns {Promise<Array<Object>>}
   */
  async _searchTerm(term) {
    if (!this._tva?.hasTVA || !this._tva?.tvaAPI) return [];
    if (this._tva.tvaCacheLoaded) {
      return (await this._tva.searchTVACacheDirect(term)) ?? [];
    }
    return this._searchApi(term);
  }

  /**
   * SLOW PATH: TVA's `doImageSearch`, used only while the cache is not loaded.
   * @private
   * @param {string} term - Search term
   * @returns {Promise<Array<Object>>}
   */
  async _searchApi(term) {
    try {
      const api = this._tva.tvaAPI;
      let searchResults = await api.doImageSearch(term, {
        searchType: 'Portrait',
        simpleResults: false,
      });

      // TVA 6.x rejects the options object with an empty answer, not an error.
      if (
        !searchResults ||
        (Array.isArray(searchResults) && searchResults.length === 0) ||
        (searchResults instanceof Map && searchResults.size === 0)
      ) {
        searchResults = await api.doImageSearch(term);
      }

      this._logger.log(`TVA raw results for "${term}":`, searchResults);
      if (!searchResults) return [];
      return this._parseApiResults(searchResults);
    } catch (error) {
      console.warn(`${MODULE_ID} | TVA search error for "${term}":`, error);
      return [];
    }
  }

  /**
   * Normalize every known `doImageSearch` result format to `{path, name, source, score}`,
   * dropping duplicates and excluded folders.
   * @private
   * @param {*} searchResults - Raw API answer
   * @returns {Array<Object>}
   */
  _parseApiResults(searchResults) {
    const results = [];
    const seenPaths = new Set();

    const addItem = (item) => {
      const imagePath = TvaResultParser.extractPath(item);
      if (!imagePath || seenPaths.has(imagePath) || this._pathFilter.isExcluded(imagePath)) return;
      seenPaths.add(imagePath);
      results.push({
        path: imagePath,
        name: TvaResultParser.extractName(item, imagePath),
        source: 'tva',
        score: item?.score ?? 0.5,
      });
    };

    if (Array.isArray(searchResults)) {
      for (const item of searchResults) addItem(item);
    } else if (searchResults instanceof Map || typeof searchResults.entries === 'function') {
      // Map keyed by search term (value: result array or object), or — in older
      // TVA releases — keyed by the image path itself.
      for (const [key, data] of searchResults.entries()) {
        if (Array.isArray(data)) {
          for (const item of data) addItem(item);
        } else if (data && typeof data === 'object') {
          addItem(data);
        } else if (typeof key === 'string' && (key.includes('/') || key.includes('.'))) {
          if (!seenPaths.has(key) && !this._pathFilter.isExcluded(key)) {
            seenPaths.add(key);
            results.push({
              path: key,
              name: TvaResultParser.extractName(data, key),
              source: 'tva',
              score: 0.5,
            });
          }
        }
      }
    } else if (typeof searchResults === 'object') {
      const pathsArray =
        searchResults.paths || searchResults.images || searchResults.results || searchResults.data;
      if (Array.isArray(pathsArray)) {
        for (const item of pathsArray) addItem(item);
      } else {
        addItem(searchResults);
      }
    }

    return results;
  }
}
