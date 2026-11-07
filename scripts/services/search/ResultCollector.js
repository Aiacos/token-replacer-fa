/**
 * Token Replacer FA - De-duplicating result accumulator
 * @module services/search/ResultCollector
 */

/**
 * Accumulates matches from several sources for one search, keeping the first
 * occurrence of each image path. Order is preserved: whichever source the plan
 * ran first wins a duplicate, and its tags (`fromName`, `score`, …) are the
 * ones the ranker sees.
 *
 * Created per search — it *is* that search's state, replacing the `seenPaths`
 * Set and results array every branch used to repeat.
 *
 * @pattern Collecting Parameter — handed through the steps of one search, each
 * step adds to it.
 */
export class ResultCollector {
  /**
   * @param {{isExcluded: function(string): boolean}} pathFilter - Excluded-folder filter
   */
  constructor(pathFilter) {
    this._pathFilter = pathFilter;
    this._seen = new Set();
    /** @type {Array<Object>} Collected results, in insertion order */
    this.results = [];
  }

  /** @returns {number} Results collected so far */
  get size() {
    return this.results.length;
  }

  /**
   * Add every item whose path is new.
   * @param {Iterable<Object>} items - Candidate matches
   * @param {Object} [options] - How to add them
   * @param {boolean} [options.skipExcluded=false] - Re-check the excluded-folder
   *   filter (for sources that do not filter themselves)
   * @param {function(Object): Object} [options.tag] - Builds the stored result
   *   from an item, e.g. to add `fromName` or a default score
   * @returns {void}
   */
  addAll(items, { skipExcluded = false, tag = null } = {}) {
    for (const item of items) {
      const path = item.path;
      if (this._seen.has(path)) continue;
      if (skipExcluded && this._pathFilter.isExcluded(path)) continue;
      this._seen.add(path);
      this.results.push(tag ? tag(item) : item);
    }
  }
}
