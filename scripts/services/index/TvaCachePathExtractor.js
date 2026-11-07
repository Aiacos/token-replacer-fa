/**
 * Token Replacer FA - Path extraction from undocumented TVA cache shapes
 * @module services/index/TvaCachePathExtractor
 */

/**
 * Pulls image paths out of whatever TVA keeps in its caches.
 *
 * Token Variant Art has stored its cache as a Map, an array, an object of
 * arrays and plain path-keyed objects across releases, and none of it is a
 * documented API. Everything here is tolerant by design: an item that does not
 * look like a path is skipped, never thrown on, because one odd entry must not
 * cost the user the other fifty thousand.
 *
 * TVA source (cache format, verified against TVA 4.x/5.x):
 * https://github.com/Aedif/TokenVariants
 *
 * @pattern Static Utility — stateless parsing with no collaborators, shared by
 *   every TVA path source and by the doImageSearch fallback.
 */
export class TvaCachePathExtractor {
  /** Property names that hold an array of items in object-shaped caches. */
  static ARRAY_PROPS = Object.freeze(['paths', 'images', 'data', 'items', 'results', 'files']);

  /** Property names that hold a path in object-shaped items. */
  static PATH_PROPS = Object.freeze(['path', 'route', 'img', 'src', 'image', 'url', 'uri']);

  /**
   * Extract unique paths from a TVA cache of any known shape.
   * @param {*} cache - Map, array or object
   * @returns {string[]} Unique paths, in discovery order
   */
  static extractPaths(cache) {
    const paths = [];
    if (!cache) return paths;

    const pushItems = (items) => {
      for (const item of items) {
        const path = TvaCachePathExtractor.extractSinglePath(item);
        if (path) paths.push(path);
      }
    };

    if (cache instanceof Map) {
      for (const [key, value] of cache.entries()) {
        if (typeof key === 'string' && TvaCachePathExtractor.isValidImagePath(key)) {
          paths.push(key);
        }
        if (Array.isArray(value)) pushItems(value);
      }
    } else if (Array.isArray(cache)) {
      pushItems(cache);
    } else if (typeof cache === 'object') {
      for (const prop of TvaCachePathExtractor.ARRAY_PROPS) {
        if (Array.isArray(cache[prop])) pushItems(cache[prop]);
      }
      for (const [key, value] of Object.entries(cache)) {
        if (TvaCachePathExtractor.isValidImagePath(key)) paths.push(key);
        if (Array.isArray(value)) pushItems(value);
      }
    }

    return [...new Set(paths)];
  }

  /**
   * Extract one path from a string, a `[path, config]` tuple or an object.
   * @param {*} item - Item from a TVA cache
   * @returns {string|null} Path, or null when the item holds none
   */
  static extractSinglePath(item) {
    if (!item) return null;

    if (typeof item === 'string') {
      return TvaCachePathExtractor.isValidImagePath(item) ? item : null;
    }

    if (Array.isArray(item)) {
      const [first] = item;
      if (typeof first === 'string' && TvaCachePathExtractor.isValidImagePath(first)) return first;
    }

    if (typeof item === 'object') {
      for (const prop of TvaCachePathExtractor.PATH_PROPS) {
        const value = item[prop];
        if (typeof value === 'string' && TvaCachePathExtractor.isValidImagePath(value)) {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * True when a string looks like an image path or URL.
   * @param {*} str - Candidate
   * @returns {boolean}
   */
  static isValidImagePath(str) {
    if (!str || typeof str !== 'string') return false;
    return (
      str.includes('/') ||
      str.startsWith('http') ||
      str.startsWith('forge://') ||
      str.endsWith('.webp') ||
      str.endsWith('.png') ||
      str.endsWith('.jpg') ||
      str.endsWith('.jpeg') ||
      str.endsWith('.gif') ||
      str.endsWith('.svg')
    );
  }

  /**
   * Flatten a `doImageSearch` result (array, Map or object) into items.
   * @param {*} results - TVA search results
   * @returns {Array} Items, each later parsed by TvaResultParser
   */
  static extractItems(results) {
    const items = [];

    if (Array.isArray(results)) {
      items.push(...results);
    } else if (results instanceof Map) {
      for (const [key, value] of results.entries()) {
        if (Array.isArray(value)) {
          items.push(...value);
        } else if (value) {
          items.push(value);
        }
        // The key itself is sometimes the path.
        if (typeof key === 'string' && (key.includes('/') || key.startsWith('http'))) {
          items.push({ path: key });
        }
      }
    } else if (results && typeof results === 'object') {
      const arr = results.paths || results.images || results.results || results.data;
      if (Array.isArray(arr)) {
        items.push(...arr);
      } else {
        items.push(results);
      }
    }

    return items;
  }
}
