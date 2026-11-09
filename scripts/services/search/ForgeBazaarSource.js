/**
 * Token Replacer FA - Forge Bazaar search source
 * @module services/search/ForgeBazaarSource
 */

/**
 * Finds token art through `ForgeBazaarService`. That service is a stub until
 * The Forge offers a public API, so in practice `isAvailable()` is false and
 * `SearchPlan` routes around this source; it exists so the priority rules can
 * already name it, and so the day the stub becomes real nothing else changes.
 *
 * @pattern Strategy — one interchangeable `SearchSource`, an Adapter over the
 * stub service's `search()`/`browseCategory()`.
 */
export class ForgeBazaarSource {
  /**
   * @param {Object|null} forgeBazaarService - ForgeBazaarService-like:
   *   `isServiceAvailable()`, `search()`, `browseCategory()`
   */
  constructor(forgeBazaarService) {
    this._forge = forgeBazaarService;
  }

  /** @returns {string} Source id */
  get name() {
    return 'forge-bazaar';
  }

  /**
   * @returns {boolean} True when the Bazaar service reports itself usable
   */
  isAvailable() {
    return Boolean(this._forge?.isServiceAvailable());
  }

  /**
   * @param {import('./SearchSource.js').SearchQuery} query - `term` or `category`
   * @returns {Promise<Array<Object>>} Results tagged `source: 'forge-bazaar'`
   */
  async search(query) {
    const { kind, value } = query;
    if (!value || value.length === 0) return [];
    let found;
    if (kind === 'term') found = await this._forge.search(value);
    else if (kind === 'category') found = await this._forge.browseCategory(value);
    else return [];
    return (found ?? []).map((result) => ({ ...result, source: 'forge-bazaar' }));
  }
}
