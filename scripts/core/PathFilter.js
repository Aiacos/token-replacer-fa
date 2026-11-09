/**
 * Token Replacer FA - Excluded-path filter
 * @module core/PathFilter
 */

import { EXCLUDED_FOLDERS_SET, EXCLUDED_FILENAME_TERMS } from './Constants.js';

/**
 * CDN URL segments to skip when checking folder exclusions
 * These are common in Forge bazaar URLs: https://assets.forge-vtt.com/bazaar/assets/...
 * SYNC: Keep in sync with IndexWorker.js CDN_SEGMENTS
 */
const CDN_SEGMENTS = new Set([
  'https:',
  'http:',
  '',
  'bazaar',
  'assets',
  'modules',
  'systems',
  'assets.forge-vtt.com',
  'forge-vtt.com',
  'foundryvtt.com',
  'www',
  'cdn',
  'static',
  'public',
  'uploads',
  'files',
]);

/** Entries kept before the oldest quarter is evicted. */
const DEFAULT_MAX_CACHE_SIZE = 20000;

/**
 * Decides whether an image path is scenery rather than a creature token: an
 * excluded folder anywhere in the path, or an excluded word in the filename.
 *
 * It runs 50k+ times per search, so both halves are prepared once: the folder
 * set is O(1) per segment, the filename patterns are compiled in the
 * constructor, and every verdict is memoized in a bounded cache. Call
 * `clearCache()` when the TVA cache is reloaded.
 *
 * @pattern Memoized Filter — the verdict cache and the precompiled patterns are
 * private state of one instance instead of module globals, so a reload clears
 * exactly what it should and a test can build its own filter.
 */
export class PathFilter {
  /**
   * @param {Object} [options={}] - Filter configuration
   * @param {Set<string>} [options.excludedFolders] - Lowercase folder names (default: EXCLUDED_FOLDERS_SET)
   * @param {readonly string[]} [options.excludedFilenameTerms] - Whole words to reject in filenames (default: EXCLUDED_FILENAME_TERMS)
   * @param {number} [options.maxCacheSize] - Memo entries before eviction (default: 20000)
   */
  constructor(options = {}) {
    const {
      excludedFolders = EXCLUDED_FOLDERS_SET,
      excludedFilenameTerms = EXCLUDED_FILENAME_TERMS,
      maxCacheSize = DEFAULT_MAX_CACHE_SIZE,
    } = options;
    this._excludedFolders = excludedFolders;
    // Compiled once: 10-50x faster than building a RegExp per isExcluded() call
    this._filenamePatterns = excludedFilenameTerms.map((term) => new RegExp(`\\b${term}\\b`, 'i'));
    this._maxCacheSize = maxCacheSize;
    /** @type {Map<string, boolean>} */
    this._cache = new Map();
  }

  /**
   * Forget every memoized verdict (call when the TVA cache is reloaded).
   * @returns {void}
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Check if a path should be excluded from token search
   * Checks both folder names and filename for environmental/prop terms
   * Results are memoized for performance (50K+ calls per search)
   *
   * The worker copy takes the excluded folders and terms as arguments because it
   * cannot import Constants.js — the signatures differ, the filtering must not.
   * SYNC: Keep in sync with IndexWorker.js isExcludedPath()
   * @param {string} path - Image path to check
   * @returns {boolean} True if path should be excluded
   */
  isExcluded(path) {
    if (!path) return true;

    const cached = this._cache.get(path);
    if (cached !== undefined) return cached;

    const pathLower = path.toLowerCase();
    const segments = pathLower.split('/');

    // Filter out CDN segments and check remaining folder names
    const folderSegments = segments.filter((s) => !CDN_SEGMENTS.has(s) && s.length > 0);

    // Check folder names against exclusion Set (O(1) per segment instead of O(N) array scan)
    if (folderSegments.some((segment) => this._excludedFolders.has(segment))) {
      this._remember(path, true);
      return true;
    }

    // Also check filename for environmental/prop terms
    const filename = segments[segments.length - 1] || '';
    // Remove extension and convert separators to spaces for word matching
    const filenameClean = filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]/g, ' ')
      .toLowerCase();

    // Check if filename contains excluded terms using precompiled patterns
    // Match as word boundary: "cliff_entrance" matches "cliff", but "clifford" doesn't
    const result = this._filenamePatterns.some((pattern) => pattern.test(filenameClean));

    this._remember(path, result);
    return result;
  }

  /**
   * Store a verdict, evicting the oldest 25% of entries when the cache is full.
   * Map iterates in insertion order, so the first keys are the oldest.
   * @private
   * @param {string} path - Path checked
   * @param {boolean} excluded - Verdict
   */
  _remember(path, excluded) {
    if (this._cache.size >= this._maxCacheSize) {
      const toDelete = Math.floor(this._maxCacheSize * 0.25);
      let count = 0;
      for (const k of this._cache.keys()) {
        if (count++ >= toDelete) break;
        this._cache.delete(k);
      }
    }
    this._cache.set(path, excluded);
  }
}

/** The page-wide instance, configured from Constants.js. */
export const pathFilter = new PathFilter();
