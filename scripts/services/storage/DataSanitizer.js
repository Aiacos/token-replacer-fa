/**
 * Token Replacer FA - Persisted-data sanitizer
 * @module services/storage/DataSanitizer
 */

/** Keys that can rewrite an object's prototype chain when copied onto it. */
const POLLUTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Strips prototype-polluting keys from data read back from browser storage,
 * which is untrusted (Constitution, Article I.7): another script or a user can
 * edit IndexedDB and `localStorage` freely.
 *
 * Two entry points because the two backends deserialize differently:
 * `jsonReviver` runs inside `JSON.parse` for `localStorage`, while IndexedDB's
 * structured clone bypasses any reviver, so its records go through `sanitize`.
 *
 * @pattern Sanitizer — one place decides what "clean" means for persisted
 * data, so every backend and every load path applies the same rule.
 */
export class DataSanitizer {
  /**
   * JSON.parse reviver that drops prototype-polluting keys.
   * Arrow property so it can be handed to JSON.parse without binding.
   * @param {string} key - JSON key being parsed
   * @param {*} value - Parsed value
   * @returns {*} The value, or undefined to strip the key
   */
  jsonReviver = (key, value) => (POLLUTING_KEYS.has(key) ? undefined : value);

  /**
   * Return a copy of `data` with prototype-polluting keys removed at every depth.
   *
   * Arrays holding only primitives are returned as-is: they cannot carry a
   * polluting key, and the TVA cache and the index are mostly such arrays, so
   * copying them would double the cost of every load.
   *
   * @param {*} data - Data to sanitize
   * @returns {*} Sanitized data
   */
  sanitize(data) {
    return this._clean(data, new WeakMap());
  }

  /**
   * @param {*} data - Value to clean
   * @param {WeakMap<object, object>} seen - Original → cleaned copy
   * @returns {*} Cleaned value
   * @private
   */
  _clean(data, seen) {
    if (data === null || typeof data !== 'object') return data;

    // Returning the cleaned copy, not the original, matters beyond cycles: the
    // TVA cache shares each image object between two structures, and handing
    // back the original skipped sanitizing every second reference.
    const known = seen.get(data);
    if (known !== undefined) return known;

    if (Array.isArray(data)) {
      if (!data.some((item) => item !== null && typeof item === 'object')) return data;
      const cleanedArray = [];
      seen.set(data, cleanedArray);
      for (const item of data) cleanedArray.push(this._clean(item, seen));
      return cleanedArray;
    }

    const cleaned = {};
    seen.set(data, cleaned);
    for (const key of Object.keys(data)) {
      if (POLLUTING_KEYS.has(key)) continue;
      cleaned[key] = this._clean(data[key], seen);
    }
    return cleaned;
  }
}
