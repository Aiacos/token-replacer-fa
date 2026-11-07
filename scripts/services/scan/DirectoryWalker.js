/**
 * Token Replacer FA - Recursive image directory walk
 * @module services/scan/DirectoryWalker
 */

import { MODULE_ID, MAX_SCAN_DEPTH } from '../../core/Constants.js';
import { Scheduler } from '../../core/Scheduler.js';
import { pathFilter as defaultPathFilter } from '../../core/PathFilter.js';

/** Image file extensions a token can use. */
const IMAGE_EXTENSIONS = Object.freeze(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg']);

/** Images found between yields to the main thread. */
const YIELD_EVERY = 30;

/**
 * @typedef {Object} LocalImage
 * @property {string} path - File path
 * @property {string} name - File name without extension, `-`/`_` as spaces
 * @property {string} fileName - File name with extension
 * @property {string} category - Folder the image was found under
 * @property {'local'} source - Always 'local'
 */

/**
 * Walks a directory tree through Foundry's FilePicker and yields every token
 * image in it: excluded folders and files are skipped (via PathFilter), the
 * depth is capped, and each path is yielded once per walk.
 *
 * A directory that cannot be browsed is logged and skipped; its siblings are
 * still walked. The walk yields to the main thread every few images, since
 * it runs on the main thread when TVA is not installed.
 *
 * FilePicker API: https://foundryvtt.com/api/v13/classes/foundry.applications.apps.FilePicker.html
 *
 * @pattern Iterator — an async generator over found images, so callers can
 * collect, count or stop early without the walk deciding for them.
 */
export class DirectoryWalker {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {function(string): Promise<{files?: string[], dirs?: string[]}|null>} [deps.browse] - Lists a directory (default: FilePicker.browse('data', path))
   * @param {{isExcluded: function(string): boolean}} [deps.pathFilter] - Excluded-path filter
   * @param {readonly string[]} [deps.imageExtensions] - Accepted extensions, lowercase with dot
   * @param {function(): Promise<void>} [deps.yieldToMain] - Hands control back to the event loop
   */
  constructor(deps = {}) {
    const {
      browse = (path) => DirectoryWalker.filePicker().browse('data', path),
      pathFilter = defaultPathFilter,
      imageExtensions = IMAGE_EXTENSIONS,
      yieldToMain = () => Scheduler.yieldToMain(50),
    } = deps;
    this._browse = browse;
    this._pathFilter = pathFilter;
    this._imageExtensions = imageExtensions;
    this._yieldToMain = yieldToMain;
  }

  /**
   * Foundry's FilePicker class: the v13 namespaced implementation, or the
   * deprecated global where the namespace is missing.
   * @returns {any} FilePicker class
   */
  static filePicker() {
    return (
      globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker
    );
  }

  /**
   * @returns {readonly string[]} Accepted image extensions
   */
  get imageExtensions() {
    return this._imageExtensions;
  }

  /**
   * Walk `rootPath` and yield its images.
   * @param {string} rootPath - Directory to start from
   * @param {Object} [options={}] - Walk options
   * @param {number} [options.maxDepth] - Deepest level browsed; the root is `startDepth` (default: MAX_SCAN_DEPTH)
   * @param {number} [options.startDepth=0] - Depth assigned to the root
   * @param {string|null} [options.category=null] - Category for the root's files (default: its folder name)
   * @param {function(Object): void} [options.onProgress] - Called per browsed directory with {currentDir, depth, filesFound, dirsFound}
   * @returns {AsyncGenerator<LocalImage>}
   */
  async *walk(rootPath, options = {}) {
    const {
      maxDepth = MAX_SCAN_DEPTH,
      startDepth = 0,
      category = null,
      onProgress = null,
    } = options;
    const state = { seen: new Set(), found: 0, maxDepth, onProgress };
    yield* this._walkDirectory(rootPath, startDepth, category, state);
  }

  /**
   * @param {string} path - Directory
   * @param {number} depth - Its depth
   * @param {string|null} category - Category for its files
   * @param {{seen: Set<string>, found: number, maxDepth: number, onProgress: Function|null}} state - Per-walk state
   * @returns {AsyncGenerator<LocalImage>}
   * @private
   */
  async *_walkDirectory(path, depth, category, state) {
    if (depth > state.maxDepth) return;

    let listing;
    try {
      listing = await this._browse(path);
    } catch (error) {
      console.warn(`${MODULE_ID} | Error scanning directory ${path}:`, error);
      return;
    }
    if (!listing) return;

    state.onProgress?.({
      currentDir: path,
      depth,
      filesFound: listing.files?.length || 0,
      dirsFound: listing.dirs?.length || 0,
    });

    const currentCategory = category || path.split('/').pop();
    for (const file of listing.files ?? []) {
      const image = this._toImage(file, currentCategory);
      if (!image || state.seen.has(image.path)) continue;
      state.seen.add(image.path);
      yield image;
      if (++state.found % YIELD_EVERY === 0) await this._yieldToMain();
    }

    for (const dir of listing.dirs ?? []) {
      if (this._pathFilter.isExcluded(dir)) continue;
      yield* this._walkDirectory(dir, depth + 1, dir.split('/').pop(), state);
    }
  }

  /**
   * @param {string} file - File path
   * @param {string} category - Category to assign
   * @returns {LocalImage|null} The image, or null if excluded or not an image
   * @private
   */
  _toImage(file, category) {
    if (this._pathFilter.isExcluded(file)) return null;
    const ext = '.' + file.split('.').pop().toLowerCase();
    if (!this._imageExtensions.includes(ext)) return null;

    const fileName = file.split('/').pop();
    const name = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[-_]/g, ' ')
      .trim();
    return { path: file, name, fileName, category, source: 'local' };
  }
}
