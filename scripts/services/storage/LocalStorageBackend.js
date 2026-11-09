/**
 * Token Replacer FA - localStorage storage backend
 * @module services/storage/LocalStorageBackend
 */

import { MODULE_ID } from '../../core/Constants.js';
import { DataSanitizer } from './DataSanitizer.js';

/** Browsers cap localStorage near 5MB per origin; keep headroom for other modules. */
const MAX_BYTES = 4.5 * 1024 * 1024;

/**
 * The fallback backend: `{ data, timestamp }` JSON strings in `localStorage`.
 * Used when IndexedDB is missing or a call to it fails, and as the source of
 * the pre-IndexedDB data that StorageService migrates.
 *
 * Every operation throws on failure, including a payload over the ~4.5MB
 * ceiling, so the facade can report it honestly instead of the backend
 * deciding on its own to swallow it.
 *
 * API reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
 *
 * @pattern Strategy — one of the two interchangeable backends behind
 * StorageService (`isAvailable`, `has`, `read`, `write`, `remove`, `clear`).
 */
export class LocalStorageBackend {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {function(): Storage} [deps.getStorage] - Returns the Storage (default: global localStorage, read per call)
   * @param {DataSanitizer} [deps.sanitizer] - Provides the JSON reviver
   * @param {string} [deps.keyPrefix] - Only keys with this prefix are removed by clear() (default: MODULE_ID)
   * @param {number} [deps.maxBytes] - Largest JSON payload accepted (default: 4.5MB)
   */
  constructor(deps = {}) {
    const {
      getStorage = () => localStorage,
      sanitizer = new DataSanitizer(),
      keyPrefix = MODULE_ID,
      maxBytes = MAX_BYTES,
    } = deps;
    this._getStorage = getStorage;
    this._sanitizer = sanitizer;
    this._keyPrefix = keyPrefix;
    this._maxBytes = maxBytes;
  }

  /**
   * Probe that localStorage can actually be written: it exists but throws in
   * some private-browsing modes and when site data is blocked.
   * @returns {boolean} True if a write and remove succeed
   */
  isAvailable() {
    const probeKey = `${this._keyPrefix}-probe`;
    try {
      const storage = this._getStorage();
      storage.setItem(probeKey, '1');
      storage.removeItem(probeKey);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | localStorage is not usable:`, error);
      return false;
    }
  }

  /**
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} True if the key exists
   */
  async has(key) {
    return this._getStorage().getItem(key) !== null;
  }

  /**
   * @param {string} key - Storage key
   * @returns {Promise<*|null>} The stored data (polluting keys stripped while parsing), or null on a miss
   */
  async read(key) {
    const json = this._getStorage().getItem(key);
    if (!json) {
      console.log(`${MODULE_ID} | No data found in localStorage: ${key}`);
      return null;
    }
    const record = JSON.parse(json, this._sanitizer.jsonReviver);
    console.log(
      `${MODULE_ID} | Loaded from localStorage: ${key} (${(json.length / 1024).toFixed(0)}KB)`
    );
    return record?.data ?? null;
  }

  /**
   * @param {string} key - Storage key
   * @param {*} data - JSON-serializable data
   * @returns {Promise<void>}
   * @throws {Error} When the payload exceeds the size ceiling or the browser quota
   */
  async write(key, data) {
    const json = JSON.stringify({ data, timestamp: Date.now() });
    if (json.length > this._maxBytes) {
      throw new Error(
        `Data too large for localStorage (${(json.length / 1024 / 1024).toFixed(1)}MB)`
      );
    }
    this._getStorage().setItem(key, json);
    console.log(
      `${MODULE_ID} | Saved to localStorage: ${key} (${(json.length / 1024).toFixed(0)}KB)`
    );
  }

  /**
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async remove(key) {
    this._getStorage().removeItem(key);
    console.log(`${MODULE_ID} | Removed from localStorage: ${key}`);
  }

  /**
   * Remove this module's keys only; other modules share the origin's storage.
   * @returns {Promise<void>}
   */
  async clear() {
    const storage = this._getStorage();
    const keysToRemove = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(this._keyPrefix)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) storage.removeItem(key);
    console.log(`${MODULE_ID} | Cleared ${keysToRemove.length} keys from localStorage`);
  }
}
