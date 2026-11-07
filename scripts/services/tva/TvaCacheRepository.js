/**
 * Token Replacer FA - Persisted parsed TVA cache
 * @module services/tva/TvaCacheRepository
 */

import { MODULE_ID } from '../../core/Constants.js';

const STORAGE_KEY = 'tva-cache-v1';

/** Bump when the shape of a saved record changes; older records are then ignored. */
const RECORD_VERSION = 1;

/** A freshness check must never delay startup by more than this. */
const HEAD_TIMEOUT_MS = 3000;

/**
 * @typedef {Object} TvaCacheSource
 * @property {string} cacheFilePath - TVA static cache file the data was parsed from
 * @property {string} lastModified - Its Last-Modified header ('' when absent)
 * @property {number} contentLength - Its Content-Length header (0 when absent)
 */

/**
 * Keeps the parsed TVA cache in storage so the next start skips the fetch and
 * the 50k-entry parse.
 *
 * A saved record is used only when it has the current record version, was
 * parsed from the same file, and a HEAD request does not show that file
 * changed (Last-Modified or Content-Length). When the HEAD itself fails (CORS,
 * timeout) the record is used anyway: a slightly stale cache beats a slow
 * start, and a reload clears it. Everything read back is shape-checked, since
 * storage contents are untrusted (Constitution, Article I.7).
 *
 * @pattern Repository — the TVA cache facade asks for "the saved cache for
 * this file" and never sees storage keys, record layout or freshness rules.
 */
export class TvaCacheRepository {
  /**
   * @param {Object} deps - Dependencies
   * @param {{load: Function, save: Function, remove: Function}} deps.storage - StorageService-compatible store
   * @param {function(string, RequestInit): Promise<Response>} [deps.fetch] - Fetch (default: global fetch, read per call)
   * @param {{log: Function}} [deps.logger] - Debug logger
   */
  constructor(deps) {
    const { storage, fetch = (url, init) => globalThis.fetch(url, init), logger } = deps;
    this._storage = storage;
    this._fetch = fetch;
    this._logger = logger ?? { log: () => {} };
  }

  /**
   * Load the saved cache for a file, if it is still valid.
   * @param {string} cacheFilePath - TVA static cache file
   * @returns {Promise<{images: Object[], byCategory: Object<string, Object[]>}|null>} Saved cache, or null on a miss
   */
  async restore(cacheFilePath) {
    let record;
    try {
      record = await this._storage.load(STORAGE_KEY);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not read the saved TVA cache:`, error);
      return null;
    }

    if (!this._isValid(record)) {
      this._logger.log('No valid TVA cache in storage');
      return null;
    }
    if (record.version !== RECORD_VERSION) {
      this._logger.log(`Saved TVA cache has version ${record.version}, expected ${RECORD_VERSION}`);
      return null;
    }
    if (record.cacheFilePath !== cacheFilePath) {
      this._logger.log('Saved TVA cache is for a different file, invalidating');
      return null;
    }
    if (await this._fileChanged(record)) return null;

    this._logger.log(`Saved TVA cache hit: ${record.tvaCacheImages.length} images`);
    return { images: record.tvaCacheImages, byCategory: record.tvaCacheByCategory };
  }

  /**
   * Save a parsed cache. Never rejects: a failed save only costs a re-parse
   * on the next start, so it is logged and reported, not thrown.
   * @param {Object[]} images - All parsed images
   * @param {Object<string, Object[]>} byCategory - Images per TVA category
   * @param {TvaCacheSource} source - Where the data came from
   * @returns {Promise<boolean>} True if saved
   */
  async save(images, byCategory, source) {
    const record = {
      version: RECORD_VERSION,
      tvaCacheImages: images,
      tvaCacheByCategory: byCategory,
      imageCount: images.length,
      cacheFilePath: source.cacheFilePath,
      lastModified: source.lastModified,
      contentLength: source.contentLength,
      timestamp: Date.now(),
    };
    try {
      const saved = await this._storage.save(STORAGE_KEY, record);
      if (saved) {
        this._logger.log(`TVA cache persisted: ${record.imageCount} images`);
      } else {
        console.warn(
          `${MODULE_ID} | Could not save the parsed TVA cache; it will be re-parsed next start`
        );
      }
      return saved;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error saving the parsed TVA cache:`, error);
      return false;
    }
  }

  /**
   * Delete the saved cache.
   * @returns {Promise<boolean>} True if removed
   */
  async remove() {
    try {
      return await this._storage.remove(STORAGE_KEY);
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to clear the saved TVA cache:`, error);
      return false;
    }
  }

  /**
   * @param {*} record - Data read back from storage
   * @returns {boolean} True if it has the fields restore() relies on
   * @private
   */
  _isValid(record) {
    return (
      record !== null &&
      typeof record === 'object' &&
      Array.isArray(record.tvaCacheImages) &&
      record.tvaCacheImages.length > 0 &&
      record.tvaCacheByCategory !== null &&
      typeof record.tvaCacheByCategory === 'object'
    );
  }

  /**
   * @param {{cacheFilePath: string, lastModified?: string, contentLength?: number}} record - Saved record
   * @returns {Promise<boolean>} True if the server shows the file changed since the record was saved
   * @private
   */
  async _fileChanged(record) {
    try {
      const response = await this._fetch(record.cacheFilePath, {
        method: 'HEAD',
        credentials: 'omit',
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      });
      if (!response.ok) return false;

      const serverModified = response.headers.get('Last-Modified') || '';
      if (serverModified && record.lastModified && serverModified !== record.lastModified) {
        this._logger.log(`Last-Modified changed: "${record.lastModified}" → "${serverModified}"`);
        return true;
      }
      const serverLength = parseInt(response.headers.get('Content-Length') || '0', 10);
      if (serverLength > 0 && record.contentLength > 0 && serverLength !== record.contentLength) {
        this._logger.log(`Content-Length changed: ${record.contentLength} → ${serverLength}`);
        return true;
      }
      return false;
    } catch (error) {
      console.debug(`${MODULE_ID} | TVA cache HEAD check failed, using saved data:`, error);
      return false;
    }
  }
}
