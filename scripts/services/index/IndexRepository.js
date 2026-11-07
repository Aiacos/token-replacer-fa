/**
 * Token Replacer FA - Persisted category index
 * @module services/index/IndexRepository
 */

import { MODULE_ID } from '../../core/Constants.js';
import { DebugLogger } from '../../core/DebugLogger.js';

/**
 * Loads, saves and invalidates the persisted index.
 *
 * Everything that arrives from storage is untrusted (Constitution, Article
 * I.7): it may be from an older module version, half-written, or edited by
 * hand. StorageService already strips prototype-polluting keys; this class adds
 * the checks only the index knows — the version, and that `pathList` and
 * `allPaths` are parallel arrays every stored id can resolve against. A cache
 * that fails either is deleted, so the next build replaces it instead of every
 * search silently returning nothing.
 *
 * Saving reports failure honestly: a full store answers `false`, never a
 * pretend success, and the caller is told once through `onStorageFull`.
 *
 * @pattern Repository — the service asks for "the index" and never learns the
 *   storage key, the version rule or the localStorage → IndexedDB migration.
 */
export class IndexRepository {
  /** Storage key; main.js checks it to tell a first-time build from a refresh. */
  static CACHE_KEY = 'token-replacer-fa-index-v3';

  /**
   * Shape version. Bumping it invalidates every cached index, which is the
   * migration. v15 (v2.13.0): paths interned in pathList, everything else ids.
   */
  static VERSION = 15;

  /**
   * @param {Object} deps
   * @param {Object} deps.storageService - load/save/remove/needsMigration/migrateFromLocalStorage
   * @param {function(): void} [deps.onStorageFull] - Called when a save is rejected
   * @param {DebugLogger} [deps.logger] - Debug logger
   */
  constructor({
    storageService,
    onStorageFull = () => {},
    logger = new DebugLogger('IndexRepository'),
  }) {
    this._storage = storageService;
    this._onStorageFull = onStorageFull;
    this._logger = logger;
  }

  /**
   * Load the persisted index.
   * Never throws: a missing, outdated, malformed or unreadable cache is removed
   * and reported as null.
   * @returns {Promise<Object|null>} The stored index, or null
   */
  async load() {
    const key = IndexRepository.CACHE_KEY;
    try {
      this._logger.log('Attempting to load index from cache');

      if (await this._storage.needsMigration(key, key)) {
        console.log(`${MODULE_ID} | Detected localStorage cache, migrating to IndexedDB...`);
        await this._storage.migrateFromLocalStorage(key, key);
      }

      const data = await this._storage.load(key);
      if (!data) return null;

      if (data.version !== IndexRepository.VERSION) {
        this._logger.log(
          `Index version mismatch (cached: ${data.version}, current: ${IndexRepository.VERSION}), rebuilding`
        );
        console.log(`${MODULE_ID} | Index version mismatch, rebuilding`);
        await this._storage.remove(key);
        return null;
      }

      const problem = IndexRepository.findShapeProblem(data);
      if (problem) {
        console.warn(`${MODULE_ID} | Cached index is malformed (${problem}), rebuilding`);
        await this._storage.remove(key);
        return null;
      }

      return data;
    } catch (error) {
      this._logger.log('Failed to load cache:', error);
      console.warn(`${MODULE_ID} | Failed to load cache:`, error);
      await this.clear();
      return null;
    }
  }

  /**
   * Persist the index.
   * @param {Object|null} index - Index to save
   * @returns {Promise<boolean>} True only when storage accepted it
   */
  async save(index) {
    if (!index) {
      this._logger.log('Cannot save cache: index is null');
      return false;
    }

    // Estimated from counts: JSON.stringify of a 50k index would block the UI.
    const pathCount = index.pathList?.length ?? 0;
    const catCount = index.categories ? Object.keys(index.categories).length : 0;
    const approxKB = Math.round(pathCount * 0.2 + catCount * 0.5);

    try {
      // save() resolves false for a full or unavailable store.
      if (!(await this._storage.save(IndexRepository.CACHE_KEY, index))) {
        console.warn(`${MODULE_ID} | Failed to save cache: storage rejected the index`);
        this._onStorageFull();
        return false;
      }
    } catch (error) {
      if (error?.name === 'QuotaExceededError' || error?.code === 22) {
        console.warn(`${MODULE_ID} | Failed to save cache: localStorage is full`, error);
        this._onStorageFull();
      } else {
        console.warn(`${MODULE_ID} | Failed to save cache:`, error);
      }
      return false;
    }

    this._logger.log(
      `Saved index to cache: ~${approxKB}KB (${pathCount} paths, ${catCount} categories)`
    );
    console.log(`${MODULE_ID} | Saved index to cache (~${approxKB}KB, ${pathCount} paths)`);
    return true;
  }

  /**
   * Delete the persisted index. Never throws.
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await this._storage.remove(IndexRepository.CACHE_KEY);
    } catch (error) {
      console.warn(`${MODULE_ID} | Cache cleanup failed:`, error);
    }
  }

  /**
   * Describe the first structural problem of a stored index, if any.
   * One pass over pathList/allPaths: cheap next to the build it saves.
   * @param {*} data - Candidate index
   * @returns {string|null} Problem description, or null when well formed
   */
  static findShapeProblem(data) {
    if (!data || typeof data !== 'object') return 'not an object';
    const { pathList, allPaths, categories, termIndex } = data;
    if (!Array.isArray(pathList)) return 'pathList is not an array';
    if (!Array.isArray(allPaths)) return 'allPaths is not an array';
    if (pathList.length !== allPaths.length) return 'pathList and allPaths differ in length';
    if (!categories || typeof categories !== 'object' || Array.isArray(categories)) {
      return 'categories is not an object';
    }
    if (
      termIndex !== undefined &&
      (!termIndex || typeof termIndex !== 'object' || Array.isArray(termIndex))
    ) {
      return 'termIndex is not an object';
    }
    for (let id = 0; id < pathList.length; id++) {
      if (typeof pathList[id] !== 'string') return `path ${id} is not a string`;
      const entry = allPaths[id];
      if (!entry || typeof entry !== 'object') return `entry ${id} is not an object`;
    }
    return null;
  }
}
