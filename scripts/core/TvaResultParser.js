/**
 * Token Replacer FA - TVA result parsing
 * @module core/TvaResultParser
 */

/** Property names that may hold an image path; 'route' and 'uri' are TVA's. */
const PATH_PROPS = ['path', 'route', 'img', 'src', 'image', 'url', 'thumb', 'thumbnail', 'uri'];

/** Property names that may hold a display name, in order of preference. */
const NAME_PROPS = ['name', 'label', 'title', 'displayName'];

/**
 * Turns the many shapes Token Variant Art hands back — a bare path, a
 * `[path, config]` tuple, an object with a path under one of several property
 * names, possibly nested under `.data` — into a path and a display name.
 *
 * Everything here is untrusted input (Constitution, Article I.7): recursion is
 * depth-limited and prototype keys are never followed.
 *
 * @pattern Adapter — the rest of the module sees `{path, name}`; only this class
 * knows how TVA's result shapes vary between versions.
 */
export class TvaResultParser {
  /**
   * Extract image path from various TVA result formats
   * @param {*} item - TVA result item
   * @returns {string|null} Image path or null
   */
  static extractPath(item) {
    if (!item) return null;

    // Direct string path
    if (typeof item === 'string') {
      return TvaResultParser._looksLikePath(item) ? item : null;
    }

    // Handle tuple format [path, config] from TVA
    if (Array.isArray(item)) {
      // First element is usually the path
      if (item.length > 0) {
        const firstEl = item[0];
        if (typeof firstEl === 'string') {
          return TvaResultParser._looksLikePath(firstEl) ? firstEl : null;
        }
        if (typeof firstEl === 'object' && firstEl !== null) {
          return TvaResultParser.extractPathFromObject(firstEl);
        }
      }
      // Try second element if first didn't work
      if (item.length > 1 && typeof item[1] === 'object' && item[1] !== null) {
        return TvaResultParser.extractPathFromObject(item[1]);
      }
      return null;
    }

    // Object with path property
    if (typeof item === 'object') {
      return TvaResultParser.extractPathFromObject(item);
    }

    return null;
  }

  /**
   * Extract path from an object with various property names
   * @param {Object} obj - Object to extract from
   * @param {number} [depth=0] - Current recursion depth (max 3 to prevent stack overflow)
   * @returns {string|null} Path or null
   */
  static extractPathFromObject(obj, depth = 0) {
    if (depth > 3) return null;

    for (const prop of PATH_PROPS) {
      if (Object.prototype.hasOwnProperty.call(obj, prop) && typeof obj[prop] === 'string') {
        const val = obj[prop];
        if (TvaResultParser._looksLikePath(val)) {
          return val;
        }
      }
    }

    // Check nested .data property (TVA format)
    if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
      for (const prop of PATH_PROPS) {
        if (
          Object.prototype.hasOwnProperty.call(obj.data, prop) &&
          typeof obj.data[prop] === 'string'
        ) {
          const val = obj.data[prop];
          if (TvaResultParser._looksLikePath(val)) {
            return val;
          }
        }
      }
    }

    // Check nested objects (general case, depth-limited)
    for (const key of Object.keys(obj)) {
      if (key === 'data' || key === '__proto__' || key === 'constructor' || key === 'prototype')
        continue;
      const val = obj[key];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const nestedPath = TvaResultParser.extractPathFromObject(val, depth + 1);
        if (nestedPath) return nestedPath;
      }
    }

    return null;
  }

  /**
   * Extract name from TVA result
   * @param {*} item - TVA result item
   * @param {string} imagePath - Fallback image path for name extraction
   * @returns {string} Extracted name
   */
  static extractName(item, imagePath) {
    // Try to get name from object properties
    if (typeof item === 'object' && item !== null) {
      for (const prop of NAME_PROPS) {
        if (item[prop] && typeof item[prop] === 'string') {
          return item[prop];
        }
      }
    }

    // Extract from path
    if (imagePath) {
      const fileName = imagePath.split('/').pop();
      const nameWithoutExt = fileName?.replace(/\.[^/.]+$/, '') || '';
      return nameWithoutExt.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown';
    }

    return 'Unknown';
  }

  /**
   * Whether a string is plausibly a path or URL rather than a bare word.
   * @private
   * @param {string} value - Candidate
   * @returns {boolean} True for URLs, forge:// paths and anything with / or .
   */
  static _looksLikePath(value) {
    return (
      value.startsWith('http') ||
      value.startsWith('forge://') ||
      value.includes('/') ||
      value.includes('.')
    );
  }
}
