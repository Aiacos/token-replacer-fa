/**
 * Token Replacer FA - Result ordering
 * @module services/search/ResultRanker
 */

/**
 * Orders token-art matches for the match-selection dialog:
 *
 * 1. by what matched — the actor's name, then a subtype, then other hits, with
 *    whole-category results last;
 * 2. within a tier, by source preference: `faNexus` puts local art first,
 *    `forgeBazaar` puts TVA art first, `both` has no preference;
 * 3. then by score, lower being better. A missing score counts as 0.5; a score
 *    of 0 is a perfect match and stays 0 (`??`, not `||`).
 *
 * One instance per priority, built once and reused: the comparator runs for
 * every pair the sort compares.
 *
 * @pattern Strategy — the comparator varies with the `searchPriority` setting.
 */
export class ResultRanker {
  /**
   * @param {string} priority - `searchPriority` setting
   */
  constructor(priority) {
    /** @type {string|null} The source this priority prefers, if any */
    this._preferredSource =
      priority === 'faNexus' ? 'local' : priority === 'forgeBazaar' ? 'tva' : null;
    this.compare = this.compare.bind(this);
  }

  /**
   * Keep the results that carry a usable image path, ordered best first.
   * @param {Array<Object>} results - Collected matches
   * @returns {Array<Object>} New, sorted array
   */
  rank(results) {
    return results.filter(ResultRanker.hasUsablePath).sort(this.compare);
  }

  /**
   * True for a path that can be an image: a relative path, a file name, an
   * http(s) URL or a forge:// URL.
   * @param {Object} result - Candidate match
   * @returns {boolean}
   */
  static hasUsablePath(result) {
    const path = result?.path;
    if (!path || typeof path !== 'string') return false;
    return (
      path.includes('/') ||
      path.includes('.') ||
      path.startsWith('http') ||
      path.startsWith('forge://')
    );
  }

  /**
   * Sort comparator.
   * @param {Object} a - Match
   * @param {Object} b - Match
   * @returns {number} Negative when `a` ranks first
   */
  compare(a, b) {
    const aIsName = a.fromName === true;
    const bIsName = b.fromName === true;
    if (aIsName !== bIsName) return aIsName ? -1 : 1;

    const aIsSubtype = a.fromSubtype === true;
    const bIsSubtype = b.fromSubtype === true;
    if (aIsSubtype && !bIsSubtype && !bIsName) return -1;
    if (!aIsSubtype && bIsSubtype && !aIsName) return 1;

    const aIsCategory = a.fromCategory === true;
    const bIsCategory = b.fromCategory === true;
    if (aIsCategory !== bIsCategory) return aIsCategory ? 1 : -1;

    const preferred = this._preferredSource;
    if (preferred) {
      const aPreferred = a.source === preferred;
      const bPreferred = b.source === preferred;
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1;
    }

    return (a.score ?? 0.5) - (b.score ?? 0.5);
  }
}
