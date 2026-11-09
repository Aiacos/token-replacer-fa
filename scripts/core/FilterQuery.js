/**
 * Token Replacer FA - Match filter query
 * @module core/FilterQuery
 */

/** Comma, whitespace and colon all separate terms. */
const TERM_DELIMITERS = /[,\s:]+/;

/** Every regex metacharacter, escaped so a typed `(a+)+$` is plain text. */
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\/]/g;

/**
 * One filter term holding glob wildcards: `*` is any run of characters
 * (including none), `?` exactly one.
 *
 * The term is cut at every `*` into segments that must appear in order, and
 * each segment is taken at its leftmost position after the previous one. For
 * an unanchored glob the leftmost choice is always safe, so nothing is ever
 * retried. A single regex with a `.*` per star would backtrack polynomially —
 * n^k for k stars — on a long name that almost matches; the segments carry no
 * quantifier at all, so a match costs one scan per segment.
 *
 * @pattern Interpreter — the glob is compiled once, at parse time, into
 * segment matchers, then evaluated against every match without re-parsing.
 */
export class WildcardTerm {
  /**
   * @param {string} term - Lowercase term containing `*` or `?`
   */
  constructor(term) {
    // A segment without `?` stays a string: indexOf needs no regex. The `g`
    // flag lets exec start at lastIndex; these RegExps never leave the
    // instance, and matches() sets lastIndex before every use.
    /** @type {readonly (string|RegExp)[]} */
    this._segments = Object.freeze(
      term
        .split('*')
        .filter((segment) => segment.length > 0)
        .map((segment) =>
          segment.includes('?')
            ? new RegExp(
                segment
                  .split('?')
                  .map((part) => part.replace(REGEX_METACHARACTERS, '\\$&'))
                  .join('[\\s\\S]'),
                'g'
              )
            : segment
        )
    );
    Object.freeze(this);
  }

  /**
   * @param {string} term - A parsed filter term
   * @returns {boolean} True when the term holds a wildcard
   */
  static isWildcard(term) {
    return term.includes('*') || term.includes('?');
  }

  /**
   * @param {string} textLower - Lowercased haystack
   * @returns {boolean} True when every segment appears, in order
   */
  matches(textLower) {
    let from = 0;
    for (const segment of this._segments) {
      if (typeof segment === 'string') {
        const at = textLower.indexOf(segment, from);
        if (at === -1) return false;
        from = at + segment.length;
      } else {
        segment.lastIndex = from;
        const found = segment.exec(textLower);
        if (!found) return false;
        from = found.index + found[0].length;
      }
    }
    return true;
  }
}

/**
 * The parsed text of a match-filter box: lowercase terms that must *all* appear
 * in a match's name or path (AND logic). A term may hold glob wildcards (`*`,
 * `?`); a term without them stays a plain substring test, so a filter that
 * uses no wildcard pays for no regex.
 *
 * Parsed once per keystroke and then tested against every match, so the terms
 * are lowercased and any wildcards compiled up front, and the instance is
 * frozen — the same query can be reused across re-renders without anyone
 * mutating it in between.
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
    /** @type {readonly (string|WildcardTerm)[]} */
    this._matchers = Object.freeze(
      this.terms.map((term) => (WildcardTerm.isWildcard(term) ? new WildcardTerm(term) : term))
    );
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
    if (this._matchers.length === 0) return true;
    const textLower = (haystack || '').toLowerCase();
    return this._matchers.every((matcher) =>
      typeof matcher === 'string' ? textLower.includes(matcher) : matcher.matches(textLower)
    );
  }
}
