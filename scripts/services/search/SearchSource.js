/**
 * Token Replacer FA - Search source contract
 *
 * Every way of finding candidate token art — the category index, the TVA
 * cache, the local Fuse index, the Forge Bazaar — answers the same two
 * questions, so `SearchPlan` can pick one by priority without knowing which
 * service sits behind it. The contract is structural (duck-typed): there is no
 * base class, because the sources share no implementation.
 *
 * @module services/search/SearchSource
 */

/**
 * What to look for.
 * - `term`: one search term (an actor name, a direct user query)
 * - `terms`: several terms OR-ed together (creature subtypes)
 * - `category`: a creature type such as `beast`
 * @typedef {Object} SearchQuery
 * @property {string} kind - Query shape: `'term'`, `'terms'` or `'category'`
 * @property {*} value - The term (string), the terms (string[]), or the category (string)
 */

/**
 * One way of finding candidate token art.
 * @typedef {Object} SearchSource
 * @property {string} name - Stable source id, used in logs
 * @property {function(): boolean} isAvailable - True when the source can answer now
 * @property {function(SearchQuery, Object=): Promise<Array<Object>>} search - Candidate
 *   results; an empty query yields `[]` without touching the dependency
 */

export {};
