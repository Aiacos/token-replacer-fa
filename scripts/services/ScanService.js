/**
 * Token Replacer FA - Scan Service
 * Handles directory scanning and local index building
 * @module services/ScanService
 */

import { MODULE_ID, MAX_SCAN_DEPTH } from '../core/Constants.js';
import { Scheduler } from '../core/Scheduler.js';
import { pathFilter as defaultPathFilter } from '../core/PathFilter.js';
import { HtmlSanitizer } from '../core/HtmlSanitizer.js';
import { Settings } from '../core/Settings.js';
import { DirectoryWalker } from './scan/DirectoryWalker.js';

/** Folders where token packs usually live, checked when no TVA cache exists. */
const COMMON_TOKEN_PATHS = Object.freeze([
  'modules/fa-nexus',
  'modules/forgotten-adventures',
  'modules/token-variants',
  'tokens',
  'assets/tokens',
]);

/** Broad TVA queries used to enumerate its images through the public API. */
const BROAD_TVA_SEARCHES = Object.freeze(['token', 'creature', 'monster', 'npc', 'character']);

/**
 * The fallback image source when TVA's static cache is unavailable: scans the
 * configured and common token folders through FilePicker, or asks TVA's
 * public search API for broad terms.
 *
 * @pattern Facade — main.js asks for "the local token index"; the folder
 * discovery, the recursive walk (DirectoryWalker) and the de-duplication stay
 * behind it.
 */
export class ScanService {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {function(string): Promise<{files?: string[], dirs?: string[]}|null>} [deps.browse] - Lists a directory (default: FilePicker)
   * @param {function(string, string): *} [deps.getSetting] - Settings accessor (default: game.settings.get)
   * @param {function(): Object|null} [deps.getTvaAPI] - Returns the TVA API (default: game.modules)
   * @param {{isExcluded: function(string): boolean}} [deps.pathFilter] - Excluded-path filter
   * @param {DirectoryWalker} [deps.walker] - Recursive directory walk
   */
  constructor(deps = {}) {
    const {
      browse = (path) => DirectoryWalker.filePicker().browse('data', path),
      getSetting = Settings.defaultGetter(),
      getTvaAPI = () => game.modules.get('token-variants')?.api,
      pathFilter = defaultPathFilter,
    } = deps;
    this._browse = browse;
    this._getSetting = getSetting;
    this._getTvaAPI = getTvaAPI;
    this._pathFilter = pathFilter;
    this._walker = deps.walker ?? new DirectoryWalker({ browse, pathFilter });
  }

  /**
   * @returns {readonly string[]} Image extensions the scan accepts
   */
  get imageExtensions() {
    return this._walker.imageExtensions;
  }

  /**
   * Discover token paths from module settings and the common pack folders.
   * @returns {Promise<string[]>} Array of paths to search
   */
  async discoverTokenPaths() {
    const paths = [];

    /** @type {string} */
    const additionalPathsSetting =
      /** @type {any} */ (this._getSetting(MODULE_ID, 'additionalPaths')) || '';
    if (additionalPathsSetting) {
      const additionalPaths = additionalPathsSetting
        .split(',')
        .map((p) => HtmlSanitizer.sanitizePath(p))
        .filter((p) => p !== null);
      paths.push(...additionalPaths);
    }

    for (const path of COMMON_TOKEN_PATHS) {
      try {
        const result = await this._browse(path);
        if (result && (result.dirs?.length > 0 || result.files?.length > 0)) {
          if (!paths.includes(path)) paths.push(path);
        }
      } catch (e) {
        console.warn(`${MODULE_ID} | Path check failed for "${path}":`, e);
      }
    }

    console.log(`${MODULE_ID} | Discovered ${paths.length} token paths:`, paths);
    return paths;
  }

  /**
   * Scan a directory recursively for images.
   * @param {string} path - Directory path
   * @param {number} [depth=0] - Depth of `path`
   * @param {number} [maxDepth] - Deepest level browsed (default: MAX_SCAN_DEPTH)
   * @param {function(Object): void|null} [progressCallback=null] - Called per browsed directory
   * @param {string|null} [category=null] - Category for the root's files (default: its folder name)
   * @returns {Promise<Array>} Array of image objects
   */
  async scanDirectoryForImages(
    path,
    depth = 0,
    maxDepth = MAX_SCAN_DEPTH,
    progressCallback = null,
    category = null
  ) {
    const images = [];
    for await (const image of this._walker.walk(path, {
      startDepth: depth,
      maxDepth,
      onProgress: progressCallback,
      category,
    })) {
      images.push(image);
    }
    return images;
  }

  /**
   * Build local token index from configured paths
   * @param {Object} _progressDialog - Optional progress dialog
   * @returns {Promise<Array>} Image index array, one entry per path
   */
  async buildLocalTokenIndex(_progressDialog = null) {
    console.log(`${MODULE_ID} | Building local token index...`);

    const paths = await this.discoverTokenPaths();
    if (paths.length === 0) {
      console.log(`${MODULE_ID} | No token paths to scan`);
      return [];
    }

    const uniqueImages = [];
    const seenPaths = new Set();
    let dirsScanned = 0;
    const onProgress = () => dirsScanned++;

    // Roots can overlap (a setting path inside a common one): de-duplicate across walks.
    for (const basePath of paths) {
      console.log(`${MODULE_ID} | Scanning: ${basePath}`);
      for await (const image of this._walker.walk(basePath, { onProgress })) {
        if (seenPaths.has(image.path)) continue;
        seenPaths.add(image.path);
        uniqueImages.push(image);
      }
    }

    console.log(
      `${MODULE_ID} | Local index built: ${uniqueImages.length} images from ${dirsScanned} directories`
    );
    return uniqueImages;
  }

  /**
   * Get images from TVA through its public search API (slow path).
   * @returns {Promise<Array>} Array of image objects
   */
  async getAllTVAImages() {
    const tvaAPI = this._getTvaAPI();
    if (!tvaAPI) return [];

    const results = [];
    const seenPaths = new Set();

    for (const term of BROAD_TVA_SEARCHES) {
      try {
        const searchResults = await tvaAPI.doImageSearch(term, {
          searchType: 'Portrait',
          simpleResults: false,
        });
        if (Array.isArray(searchResults)) {
          for (const item of searchResults) {
            const image = this._fromTvaResult(item);
            if (image && !seenPaths.has(image.path) && !this._pathFilter.isExcluded(image.path)) {
              seenPaths.add(image.path);
              results.push(image);
            }
          }
        }
      } catch (e) {
        console.warn(`${MODULE_ID} | TVA search failed for term "${term}":`, e);
      }

      await Scheduler.yieldToMain(50);
    }

    console.log(`${MODULE_ID} | Retrieved ${results.length} images from TVA cache`);
    return results;
  }

  /**
   * Filter images by folder path matching a category type
   * @param {Array} images - Images to filter
   * @param {string} categoryType - Category type to match
   * @returns {Array} Filtered images
   */
  filterByFolderPath(images, categoryType) {
    if (!images || !categoryType) return [];

    const categoryLower = categoryType.toLowerCase();
    return images.filter((img) => {
      if (this._pathFilter.isExcluded(img.path)) return false;

      const path = img.path?.toLowerCase() || '';
      const name = img.name?.toLowerCase() || '';
      return (
        path.split('/').some((part) => part.includes(categoryLower)) || name.includes(categoryLower)
      );
    });
  }

  /**
   * Convert one TVA search result (a path string or an object with one of
   * several path/name fields, depending on TVA version) to an image.
   * @param {*} item - TVA result item
   * @returns {{path: string, name: string, source: 'tva'}|null}
   * @private
   */
  _fromTvaResult(item) {
    let imagePath = null;
    let name = 'Unknown';
    if (typeof item === 'string') {
      imagePath = item;
    } else if (typeof item === 'object' && item !== null) {
      /** @type {any} - TVA result item with dynamic properties */
      const tvaItem = item;
      imagePath =
        tvaItem.path || tvaItem.route || tvaItem.img || tvaItem.src || tvaItem.image || tvaItem.uri;
      name = tvaItem.name || tvaItem.label || tvaItem.title || 'Unknown';
    }
    if (!imagePath) return null;

    if (name === 'Unknown') {
      name =
        imagePath
          .split('/')
          .pop()
          ?.replace(/\.[^/.]+$/, '')
          .replace(/[-_]/g, ' ')
          .trim() || 'Unknown';
    }
    return { path: imagePath, name, source: 'tva' };
  }
}

// Export singleton instance
export const scanService = new ScanService();
