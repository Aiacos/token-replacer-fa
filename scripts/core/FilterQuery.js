/**
 * Token Replacer FA - Match filter query
 * @module core/FilterQuery
 */

/** Comma, whitespace and colon all separate terms. */
const TERM_DELIMITERS = /[,\s:]+/;

/**
 * The parsed text of a match-filter box: lowercase terms that must *all* appear
 * in a match's name or path (AND logic).
 *
 * Parsed once per keystroke and then tested against every match, so the terms
 * are lowercased up front and the instance is frozen — the same query can be
 * reused across re-renders without anyone mutating it in between.
 *
 * @pattern Value Object — equality is the terms, the instance is immutable, and
 * parsing and matching live together instead of as two loose functions that
 * must agree on case.
 */
export class FilterQuery {
  /**
   * Prefer `FilterQuery.parse()`; the constructor trusts its input to be
   * lowercase and non-empty.
   * @param {readonly string[]} terms - Lowercase, non-empty terms
   */
  constructor(terms) {
    /** @type {readonly string[]} */
    this.terms = Object.freeze([...terms]);
    Object.freeze(this);
  }

  /**
   * Parse filter text into individual terms for AND logic filtering
   * Supports comma, space, and colon as delimiters
   * @param {string} [text] - The raw filter input text
   * @returns {FilterQuery} Parsed query (empty for blank input)
   */
  static parse(text) {
    if (!text) return new FilterQuery([]);
    return new FilterQuery(
      text
        .toLowerCase()
        .trim()
        .split(TERM_DELIMITERS)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    );
  }

  /**
   * True when the query has no terms and therefore matches everything.
   * @returns {boolean}
   */
  get isEmpty() {
    return this.terms.length === 0;
  }

  /**
   * Check if text contains every term (AND logic, case-insensitive)
   * @param {string} [haystack] - The text to check against
   * @returns {boolean} True if all terms are found (always true for an empty query)
   */
  matches(haystack) {
    if (this.terms.length === 0) return true;
    const textLower = (haystack || '').toLowerCase();
    return this.terms.every((term) => textLower.includes(term));
  }
}
