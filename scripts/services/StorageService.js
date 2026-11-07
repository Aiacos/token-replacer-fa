/**
 * Token Replacer FA - Storage Service
 * Persists the token index and the parsed TVA cache in the browser.
 * @module services/StorageService
 */

import { MODULE_ID } from '../core/Constants.js';
import { DataSanitizer } from './storage/DataSanitizer.js';
import { IndexedDbBackend } from './storage/IndexedDbBackend.js';
import { LocalStorageBackend } from './storage/LocalStorageBackend.js';

/**
 * One storage API over two backends: IndexedDB first, `localStorage` when
 * IndexedDB is missing or a call to it fails (Constitution, Article IV.5).
 *
 * The fallback is decided per call, so one failed transaction does not demote
 * the whole session to the 4.5MB `localStorage`. Every load is sanitized,
 * whichever backend answered, because persisted data is untrusted (Article
 * I.7). Every boolean returned reports what actually happened: `true` only
 * when some backend did the work.
 *
 * @pattern Facade — callers see save/load/has/remove/clear/migrate; the choice
 * of backend, the fallback and the sanitizing stay behind it.
 */
export class StorageService {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {DataSanitizer} [deps.sanitizer] - Cleans loaded data
   * @param {IndexedDbBackend} [deps.primary] - Preferred backend (default: IndexedDB)
   * @param {LocalStorageBackend} [deps.fallback] - Backend used when the primary is unavailable or fails
   */
  constructor(deps = {}) {
    const {
      sanitizer = new DataSanitizer(),
      primary = new IndexedDbBackend(),
      fallback = new LocalStorageBackend({ sanitizer }),
    } = deps;
    this._sanitizer = sanitizer;
    this._primary = primary;
    this._fallback = fallback;

    if (!this.isIndexedDBSupported) {
      console.warn(`${MODULE_ID} | IndexedDB not supported, falling back to localStorage`);
    }
  }

  /**
   * @returns {boolean} True if the IndexedDB backend is available in this browser
   */
  get isIndexedDBSupported() {
    return this._primary.isAvailable();
  }

  /**
   * Verify that storage works: opens IndexedDB, or probes `localStorage` when
   * IndexedDB is missing.
   * @returns {Promise<boolean>} True if a backend is usable
   */
  async testConnection() {
    if (!this.isIndexedDBSupported) {
      console.log(`${MODULE_ID} | IndexedDB not supported, testing localStorage fallback`);
      return this._fallback.isAvailable();
    }
    try {
      const db = await this._primary.open();
      console.log(`${MODULE_ID} | Database connection test successful`);
      console.log(`${MODULE_ID} | Database name: ${db.name}, version: ${db.version}`);
      console.log(`${MODULE_ID} | Object stores:`, Array.from(db.objectStoreNames));
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Database connection test failed:`, error);
      return false;
    }
  }

  /**
   * Check if a key exists without loading its data.
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} True if the key exists
   */
  async has(key) {
    return this._withFallback('has', (backend) => backend.has(key), false);
  }

  /**
   * Save data under a key.
   * @param {string} key - Storage key
   * @param {*} data - Data to store (structured-cloneable, and JSON-serializable for the fallback)
   * @returns {Promise<boolean>} True if a backend stored it
   */
  async save(key, data) {
    return this._withFallback(
      'save',
      async (backend) => {
        await backend.write(key, data);
        return true;
      },
      false
    );
  }

  /**
   * Load the data saved under a key, with prototype-polluting keys removed.
   * @param {string} key - Storage key
   * @returns {Promise<*>} Stored data, or null if missing or unreadable
   */
  async load(key) {
    const data = await this._withFallback('load', (backend) => backend.read(key), null);
    return data === null ? null : this._sanitizer.sanitize(data);
  }

  /**
   * Remove the data saved under a key.
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} True if a backend removed it
   */
  async remove(key) {
    return this._withFallback(
      'remove',
      async (backend) => {
        await backend.remove(key);
        return true;
      },
      false
    );
  }

  /**
   * Remove all of this module's data.
   * @returns {Promise<boolean>} True if a backend cleared it
   */
  async clear() {
    return this._withFallback(
      'clear',
      async (backend) => {
        await backend.clear();
        return true;
      },
      false
    );
  }

  /**
   * Check whether pre-IndexedDB data in `localStorage` still has to be moved:
   * the old key exists and the new location is empty.
   * @param {string} oldKey - localStorage key to migrate from
   * @param {string} newKey - Storage key to migrate to
   * @returns {Promise<boolean>} True if migration is needed
   */
  async needsMigration(oldKey, newKey) {
    try {
      if (!(await this._fallback.has(oldKey))) {
        console.log(
          `${MODULE_ID} | No migration needed: no localStorage data found for key "${oldKey}"`
        );
        return false;
      }
      if ((await this.load(newKey)) !== null) {
        console.log(
          `${MODULE_ID} | No migration needed: data already exists in new storage for key "${newKey}"`
        );
        return false;
      }
      console.log(
        `${MODULE_ID} | Migration needed: localStorage data found for "${oldKey}", but "${newKey}" is empty`
      );
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error checking migration status:`, error);
      return false;
    }
  }

  /**
   * Move data from a `localStorage` key into storage, then delete the old key
   * so the migration does not run again on every start.
   * @param {string} oldKey - localStorage key to migrate from
   * @param {string} newKey - Storage key to migrate to
   * @returns {Promise<boolean>} True if migration succeeded
   */
  async migrateFromLocalStorage(oldKey, newKey) {
    try {
      console.log(
        `${MODULE_ID} | Starting migration from localStorage "${oldKey}" to storage "${newKey}"`
      );
      const data = await this._fallback.read(oldKey);
      if (!data) {
        console.warn(
          `${MODULE_ID} | Migration failed: no valid data in localStorage for key "${oldKey}"`
        );
        return false;
      }

      if (!(await this.save(newKey, data))) {
        console.warn(`${MODULE_ID} | Migration failed: could not save data to new storage`);
        return false;
      }
      console.log(`${MODULE_ID} | Migration successful: "${oldKey}" → "${newKey}"`);

      // An in-place migration (same key) whose save fell back to localStorage
      // wrote onto the old key itself: removing it would delete the only copy.
      if (oldKey !== newKey || (await this._primaryHas(newKey))) {
        try {
          await this._fallback.remove(oldKey);
        } catch (error) {
          console.warn(`${MODULE_ID} | Failed to remove old localStorage key "${oldKey}":`, error);
        }
      }
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Migration failed with error:`, error);
      console.log(`${MODULE_ID} | Continuing with empty cache - index will rebuild automatically`);
      return false;
    }
  }

  /**
   * Whether IndexedDB holds a key; a failing lookup counts as "no".
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} True when IndexedDB has the key
   * @private
   */
  async _primaryHas(key) {
    try {
      return await this._primary.has(key);
    } catch (error) {
      console.debug(`${MODULE_ID} | IndexedDB lookup failed for "${key}":`, error);
      return false;
    }
  }

  /**
   * Close the IndexedDB connection; the next call reopens it.
   * @returns {void}
   */
  close() {
    this._primary.close();
  }

  /**
   * Run an operation on the primary backend when it is available, and on the
   * fallback when it is not or when it fails. Both failures are logged.
   * @template T
   * @param {string} operation - Operation name for the log
   * @param {function(IndexedDbBackend|LocalStorageBackend): Promise<T>} run - The operation
   * @param {T} failed - Value returned when both backends fail
   * @returns {Promise<T>}
   * @private
   */
  async _withFallback(operation, run, failed) {
    if (this.isIndexedDBSupported) {
      try {
        return await run(this._primary);
      } catch (error) {
        console.warn(
          `${MODULE_ID} | IndexedDB ${operation} failed, falling back to localStorage:`,
          error
        );
      }
    }
    try {
      return await run(this._fallback);
    } catch (error) {
      console.error(`${MODULE_ID} | localStorage ${operation} failed:`, error);
      return failed;
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
