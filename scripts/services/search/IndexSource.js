/**
 * Token Replacer FA - Category index search source
 * @module services/search/IndexSource
 */

/**
 * Finds token art in the pre-built hierarchical index (`IndexService`): a
 * category lookup or a term lookup, both O(1)/O(log n) through the index's own
 * structures (Constitution, Article IV.2).
 *
 * Failures of the index propagate: the orchestrator's callers isolate them per
 * creature group, and swallowing them here would hide a broken index behind an
 * empty result.
 *
 * @pattern Strategy — one interchangeable `SearchSource`; `SearchPlan` decides
 * when it runs.
 */
export class IndexSource {
  /**
   * @param {Object} indexService - IndexService-like: `isBuilt`, `search()`,
   *   `searchMultiple()`, `searchByCategory()`
   */
  constructor(indexService) {
    this._index = indexService;
  }

  /** @returns {string} Source id */
  get name() {
    return 'index';
  }

  /**
   * The index answers only once it has been built.
   * @returns {boolean}
   */
  isAvailable() {
    return Boolean(this._index?.isBuilt);
  }

  /**
   * @param {import('./SearchSource.js').SearchQuery} query - What to look for
   * @returns {Promise<Array<Object>>} Index results (`source: 'index'`)
   */
  async search(query) {
    const { kind, value } = query;
    if (!value || value.length === 0) return [];
    switch (kind) {
      case 'term':
        return this._index.search(value) ?? [];
      case 'terms':
        return this._index.searchMultiple(value) ?? [];
      case 'category':
        return this._index.searchByCategory(value) ?? [];
      default:
        return [];
    }
  }
}
