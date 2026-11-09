/**
 * Token Replacer FA - Search result cache
 * @module services/search/SearchResultCache
 */

/**
 * Remembers the ranked matches per creature (`CreatureTerms.cacheKey`), so a
 * scene with twenty goblins searches once. Bounded: past `maxEntries` the
 * least recently used quarter is dropped in one sweep, which keeps eviction off
 * the per-insert path. A `Map` iterates in insertion order, so "least recently
 * used" is "first in the map", provided every read re-inserts its key.
 *
 * @pattern Cache (encapsulated LRU) — callers see get/set; the recency order
 * and the eviction policy stay inside.
 */
export class SearchResultCache {
  /** Default bound: generous for one scene, small enough to never matter for memory. */
  static DEFAULT_MAX_ENTRIES = 200;

  /**
   * @param {number} [maxEntries=200] - Entries kept before eviction
   * @param {number} [evictFraction=0.25] - Share of entries dropped per eviction
   */
  constructor(maxEntries = SearchResultCache.DEFAULT_MAX_ENTRIES, evictFraction = 0.25) {
    this._maxEntries = maxEntries;
    this._evictCount = Math.max(1, Math.floor(maxEntries * evictFraction));
    /** @type {Map<string, Array<Object>>} */
    this._entries = new Map();
  }

  /** @returns {number} Entries currently held */
  get size() {
    return this._entries.size;
  }

  /**
   * @param {string} key - Cache key
   * @returns {boolean} True if an entry exists (does not touch recency)
   */
  has(key) {
    return this._entries.has(key);
  }

  /**
   * Read an entry and mark it most recently used.
   * @param {string} key - Cache key
   * @returns {Array<Object>|undefined} The cached results, or undefined
   */
  get(key) {
    const value = this._entries.get(key);
    if (value === undefined) return undefined;
    this._entries.delete(key);
    this._entries.set(key, value);
    return value;
  }

  /**
   * Store an entry as most recently used, evicting the oldest when full.
   * @param {string} key - Cache key
   * @param {Array<Object>} value - Results to remember
   * @returns {void}
   */
  set(key, value) {
    this._entries.delete(key);
    this._entries.set(key, value);
    if (this._entries.size <= this._maxEntries) return;
    let dropped = 0;
    for (const oldest of this._entries.keys()) {
      if (dropped++ >= this._evictCount) break;
      this._entries.delete(oldest);
    }
  }

  /**
   * Forget every entry.
   * @returns {void}
   */
  clear() {
    this._entries.clear();
  }
}
