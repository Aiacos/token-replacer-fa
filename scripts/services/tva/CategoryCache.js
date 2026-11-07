/**
 * Token Replacer FA - TVA category pre-cache
 * @module services/tva/CategoryCache
 */

import { CREATURE_TYPE_MAPPINGS } from '../../core/Constants.js';

/** Path segments that carry meaning; the rest is pack/module structure. */
const MEANINGFUL_SEGMENTS = 4;

/**
 * Maps each creature category (beast, undead, …) to the TVA images whose name
 * or last path segments contain one of its terms.
 *
 * Built once per TVA cache load, so a category search is an O(1) lookup
 * instead of a scan of 50k images × the category's terms (Constitution,
 * Article IV.2 and IV.4). `scan()` is the same rule applied on demand, for
 * when no build has happened; both share `_collect()`, so they cannot drift.
 *
 * @pattern Index — a precomputed category → images lookup, rebuilt (never
 * patched) when the TVA cache reloads.
 */
export class CategoryCache {
  /**
   * @param {Object<string, string[]>} [mappings] - Category → terms (default: CREATURE_TYPE_MAPPINGS)
   */
  constructor(mappings = CREATURE_TYPE_MAPPINGS) {
    /** @type {Array<[string, string[]]>} category key → lowercase terms, computed once */
    this._categories = Object.entries(mappings).map(([category, terms]) => [
      category.toLowerCase(),
      terms.map((term) => term.toLowerCase()),
    ]);
    /** @type {Map<string, Object[]>} */
    this._byCategory = new Map();
    this._built = false;
  }

  /**
   * @returns {boolean} True once build() has run since the last clear()
   */
  get isBuilt() {
    return this._built;
  }

  /**
   * Build the lookup for every category from the searchable images.
   * @param {Array<{path: string, name: string, _nameLower?: string, _pathLower?: string}>} images - Searchable images
   * @returns {void}
   */
  build(images) {
    // The meaningful path is the same for every category: compute it once per
    // image, not once per image per category.
    const names = new Array(images.length);
    const paths = new Array(images.length);
    for (let i = 0; i < images.length; i++) {
      names[i] = this._nameLower(images[i]);
      paths[i] = this._meaningfulPath(images[i]);
    }

    this._byCategory = new Map();
    for (const [category, terms] of this._categories) {
      const matches = this._collect(images, terms, names, paths);
      if (matches.length > 0) this._byCategory.set(category, matches);
    }
    this._built = true;
  }

  /**
   * Images for a category from the built lookup.
   * @param {string} category - Category key (any case)
   * @returns {Object[]} Matching images (empty for an unknown category)
   */
  get(category) {
    return this._byCategory.get(category.toLowerCase()) ?? [];
  }

  /**
   * Apply the category rule to a list without building the lookup.
   * @param {Array<{path: string, name: string, _nameLower?: string, _pathLower?: string}>} images - Images to scan
   * @param {string} category - Category key (any case)
   * @returns {Object[]} Matching images, de-duplicated by path
   */
  scan(images, category) {
    const key = category.toLowerCase();
    const entry = this._categories.find(([name]) => name === key);
    if (!entry) return [];
    return this._collect(
      images,
      entry[1],
      images.map((image) => this._nameLower(image)),
      images.map((image) => this._meaningfulPath(image))
    );
  }

  /**
   * Drop the lookup; get() returns nothing until the next build().
   * @returns {void}
   */
  clear() {
    this._byCategory = new Map();
    this._built = false;
  }

  /**
   * @param {Object[]} images - Images
   * @param {string[]} terms - Lowercase terms
   * @param {string[]} names - Lowercase names, parallel to images
   * @param {string[]} paths - Lowercase meaningful paths, parallel to images
   * @returns {Object[]} Images matching any term, first occurrence per path
   * @private
   */
  _collect(images, terms, names, paths) {
    const results = [];
    const seenPaths = new Set();
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      if (seenPaths.has(image.path)) continue;
      const name = names[i];
      const path = paths[i];
      if (terms.some((term) => name.includes(term) || path.includes(term))) {
        seenPaths.add(image.path);
        results.push(image);
      }
    }
    return results;
  }

  /** @private */
  _nameLower(image) {
    return image._nameLower ?? (image.name || '').toLowerCase();
  }

  /** @private */
  _meaningfulPath(image) {
    const pathLower = image._pathLower ?? (image.path || '').toLowerCase();
    return pathLower.split('/').slice(-MEANINGFUL_SEGMENTS).join('/');
  }
}
