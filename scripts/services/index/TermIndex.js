/**
 * Token Replacer FA - Search term index
 * @module services/index/TermIndex
 */

/**
 * The term → path-id map behind every O(1) index search.
 *
 * It wraps the plain object stored at `index.termIndex` without copying it:
 * that object is what IndexedDB persists and what the worker hands back, so the
 * stored shape stays `{ term: [id, ...] }` and this class only owns the rules
 * for touching it.
 *
 * The rule that matters is `Object.hasOwn`. A plain-object lookup of the term
 * "constructor" returns `Object`, so an image in a folder of that name used to
 * crash the whole build on `push`, and a search for it returned garbage.
 *
 * @pattern Value Object — owns the invariants of the serialisable term map
 *   (own-property access, ids not paths) while leaving its stored form plain.
 */
export class TermIndex {
  /**
   * @param {Object<string, number[]>} [terms={}] - Plain term map to wrap (not copied)
   */
  constructor(terms = {}) {
    this._terms = terms;
  }

  /**
   * Split text into unique lowercase search terms.
   *
   * SYNC: Keep in sync with IndexWorker.js IndexWorkerRuntime termIndex builder,
   * which splits with the same regex so both build paths index the same terms.
   * @param {string} text - Text to tokenize (e.g., a path and a name)
   * @returns {string[]} Unique lowercase terms
   */
  static tokenize(text) {
    if (!text) return [];
    const terms = text
      .toLowerCase()
      .split(/[/\\\-_\s.]+/)
      .filter((term) => term.length > 0);
    return [...new Set(terms)];
  }

  /**
   * Build a term index from the interned path list.
   * Used when a cached index predates the term index (cached before v2.11.3).
   * @param {string[]} pathList - Interned paths
   * @param {Array<{name: string}>} allPaths - Entries parallel to pathList
   * @returns {TermIndex} A new index over a new plain object
   */
  static rebuild(pathList, allPaths) {
    const index = new TermIndex({});
    for (let id = 0; id < pathList.length; id++) {
      index.addText(`${pathList[id]} ${allPaths[id].name}`, id);
    }
    return index;
  }

  /**
   * Record that a path id contains a term.
   * @param {string} term - Lowercase term
   * @param {number} id - Index into pathList
   * @returns {void}
   */
  add(term, id) {
    if (!Object.hasOwn(this._terms, term)) {
      if (term === '__proto__') {
        // Assigning `__proto__` would swap the object's prototype instead of
        // creating a key; defining it makes it an ordinary own property. Only
        // this one key needs it, so the hot path keeps the plain assignment.
        Object.defineProperty(this._terms, term, {
          value: [],
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        this._terms[term] = [];
      }
    }
    this._terms[term].push(id);
  }

  /**
   * Tokenize text and record every term for one path id.
   * @param {string} text - Path and name
   * @param {number} id - Index into pathList
   * @returns {void}
   */
  addText(text, id) {
    for (const term of TermIndex.tokenize(text)) this.add(term, id);
  }

  /**
   * Ids of the paths containing a term.
   * @param {string} term - Lowercase term
   * @returns {number[]|null} Ids, or null when the term is unknown
   */
  lookup(term) {
    return Object.hasOwn(this._terms, term) ? this._terms[term] : null;
  }

  /** @returns {boolean} True when no term is indexed (stops at the first key) */
  get isEmpty() {
    for (const term in this._terms) {
      if (Object.hasOwn(this._terms, term)) return false;
    }
    return true;
  }

  /** @returns {number} Number of distinct terms */
  get size() {
    return Object.keys(this._terms).length;
  }

  /**
   * True when this instance wraps the given plain object, so a caller can keep
   * one wrapper per stored map instead of allocating one per search.
   * @param {Object} terms - Plain term map
   * @returns {boolean}
   */
  wraps(terms) {
    return this._terms === terms;
  }

  /**
   * The plain object to store at `index.termIndex`.
   * @returns {Object<string, number[]>}
   */
  toPlainObject() {
    return this._terms;
  }
}
