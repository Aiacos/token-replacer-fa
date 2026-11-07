/**
 * Token Replacer FA - TVA static cache parser
 * @module services/tva/TvaCacheParser
 */

import { Scheduler } from '../../core/Scheduler.js';

/** Trailing file extension, e.g. ".webp". */
const EXTENSION = /\.[^/.]+$/;

/**
 * @typedef {Object} TvaImage
 * @property {string} path - Image path or URL
 * @property {string} name - Display name
 * @property {string} category - TVA cache category it was listed under
 * @property {string[]} [tags] - TVA tags, when the entry had them
 */

/**
 * @typedef {Object} ParsedTvaCache
 * @property {Object<string, TvaImage[]>} byCategory - Images per TVA category
 * @property {TvaImage[]} images - All images, flat (same objects as byCategory)
 * @property {number} skipped - Malformed entries left out
 */

/**
 * Converts Token Variant Art's static cache file into image objects.
 *
 * The file is `{ category: entry[] }`, where an entry is one of
 * - `"path"` — the name is the file name without extension,
 * - `["path", "name"]`,
 * - `["path", "name", tags]`.
 * Non-array top-level values (metadata) are ignored. Verified against TVA's
 * own `saveCache()` / `_readCacheFromFile()` at
 * https://github.com/Aedif/TokenVariants/blob/012a7842bf7f9c62a5f86455936cc395c354b052/token-variants/scripts/search.js
 * (commit of 2025-06-21; the format is unchanged since TVA 4.x).
 *
 * The file is untrusted input (Constitution, Article I.7): an entry whose path
 * is not a non-empty string is skipped and counted, never allowed to throw
 * halfway through 50k entries. Each image object is shared between `images`
 * and its category list, so parsing allocates one object per entry.
 *
 * @pattern Adapter — turns TVA's compact three-format cache into the uniform
 * `{ path, name, category }` objects the rest of the module works with.
 */
export class TvaCacheParser {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {function(): Promise<void>} [deps.yieldToMain] - Hands control back to the event loop
   * @param {number} [deps.yieldEvery] - Entries parsed between yields (default 5000)
   */
  constructor(deps = {}) {
    const { yieldToMain = () => Scheduler.yieldToMain(0), yieldEvery = 5000 } = deps;
    this._yieldToMain = yieldToMain;
    this._yieldEvery = yieldEvery;
  }

  /**
   * Parse a TVA cache object, yielding to the main thread periodically.
   * @param {Object<string, *>} json - Parsed TVA cache file (must be an object)
   * @returns {Promise<ParsedTvaCache>}
   */
  async parse(json) {
    /** @type {Object<string, TvaImage[]>} */
    const byCategory = {};
    /** @type {TvaImage[]} */
    const images = [];
    let skipped = 0;
    let parsed = 0;

    for (const category of Object.keys(json)) {
      const entries = json[category];
      if (!Array.isArray(entries)) continue;

      const list = [];
      byCategory[category] = list;
      for (const entry of entries) {
        const image = this.parseEntry(entry, category);
        if (image === null) {
          skipped++;
          continue;
        }
        list.push(image);
        images.push(image);
        if (++parsed % this._yieldEvery === 0) await this._yieldToMain();
      }
    }

    return { byCategory, images, skipped };
  }

  /**
   * Convert one cache entry.
   * @param {*} entry - `"path"`, `["path", "name"]` or `["path", "name", tags]`
   * @param {string} category - Category the entry was listed under
   * @returns {TvaImage|null} The image, or null when the entry is malformed
   */
  parseEntry(entry, category) {
    if (typeof entry === 'string') {
      if (entry === '') return null;
      const fileName = entry.slice(entry.lastIndexOf('/') + 1).replace(EXTENSION, '');
      return { path: entry, name: fileName, category };
    }
    if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0] !== '') {
      return entry.length === 3
        ? { path: entry[0], name: entry[1], tags: entry[2], category }
        : { path: entry[0], name: entry[1], category };
    }
    return null;
  }
}
