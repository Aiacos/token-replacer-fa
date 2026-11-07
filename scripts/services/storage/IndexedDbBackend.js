/**
 * Token Replacer FA - IndexedDB storage backend
 * @module services/storage/IndexedDbBackend
 */

import { MODULE_ID } from '../../core/Constants.js';

const DB_NAME = 'token-replacer-fa';
const DB_VERSION = 1;
const STORE_NAME = 'index';

/** Grace period before giving up on a blocked open (another tab holds an older version). */
const BLOCKED_TIMEOUT_MS = 10_000;

/**
 * The primary storage backend: one IndexedDB object store keyed by `id`,
 * holding `{ id, data, timestamp }` records. IndexedDB has no practical size
 * ceiling for the index, unlike `localStorage` (Constitution, Article IV.5).
 *
 * Every operation throws on failure; deciding whether to fall back is the
 * facade's job, not the backend's. The connection is opened once and shared;
 * a close or a version change from another tab drops it so the next call
 * reopens.
 *
 * API reference: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
 *
 * @pattern Strategy — one of the two interchangeable backends behind
 * StorageService (`isAvailable`, `has`, `read`, `write`, `remove`, `clear`).
 */
export class IndexedDbBackend {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {function(): (IDBFactory|null|undefined)} [deps.getFactory] - Returns the IDBFactory (default: window.indexedDB)
   * @param {string} [deps.dbName] - Database name (default: 'token-replacer-fa')
   */
  constructor(deps = {}) {
    const {
      getFactory = () => (typeof window !== 'undefined' ? window.indexedDB : undefined),
      dbName = DB_NAME,
    } = deps;
    this._dbName = dbName;
    /** @type {IDBDatabase|null} */
    this._db = null;
    /** @type {Promise<IDBDatabase>|null} */
    this._dbPromise = null;
    /** @type {IDBFactory|null} */
    this._factory = null;
    try {
      this._factory = getFactory() ?? null;
    } catch (error) {
      console.warn(`${MODULE_ID} | IndexedDB support check failed:`, error);
    }
  }

  /**
   * @returns {boolean} True if this browser exposes IndexedDB
   */
  isAvailable() {
    return this._factory !== null;
  }

  /**
   * The open connection, or null when none is open.
   * @returns {IDBDatabase|null}
   */
  get connection() {
    return this._db;
  }

  /**
   * Open the database, reusing the open connection or a pending open.
   * @returns {Promise<IDBDatabase>} Database instance
   */
  async open() {
    if (this._db) return this._db;
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve, reject) => {
      const request = this._factory.open(this._dbName, DB_VERSION);
      let blockedTimeoutId = null;

      request.onerror = () => {
        clearTimeout(blockedTimeoutId);
        console.error(`${MODULE_ID} | Failed to open IndexedDB:`, request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        clearTimeout(blockedTimeoutId);
        const db = request.result;
        this._db = db;
        console.log(`${MODULE_ID} | IndexedDB connection opened successfully`);

        db.onclose = () => {
          console.warn(`${MODULE_ID} | IndexedDB connection closed unexpectedly`);
          this._forget();
        };
        // Another tab deleted or upgraded the database: let it proceed.
        db.onversionchange = () => {
          console.warn(`${MODULE_ID} | IndexedDB version change detected, closing connection`);
          db.close();
          this._forget();
        };

        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        /** @type {IDBDatabase} */
        const db = /** @type {IDBRequest} */ (event.target).result;
        const oldVersion = event.oldVersion || 0;

        console.log(`${MODULE_ID} | IndexedDB upgrade: v${oldVersion} → v${DB_VERSION}`);

        // Incremental migrations — each case falls through to apply all needed upgrades
        switch (oldVersion) {
          case 0:
            // Fresh install: create the object store
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: 'id' });
              console.log(`${MODULE_ID} | Created IndexedDB object store: ${STORE_NAME}`);
            }
            break;
          // Future migrations: add cases here with fallthrough
          // case 1:
          //   // v1 → v2: add indexes, transform data, etc.
        }
      };

      request.onblocked = () => {
        console.warn(`${MODULE_ID} | IndexedDB open request blocked - close other tabs or wait`);
        // The block may clear if the other tab closes (onsuccess then fires). Reject only if
        // it persists past the grace period so callers don't hang forever in multi-tab setups.
        if (blockedTimeoutId) return;
        blockedTimeoutId = setTimeout(() => {
          reject(
            new Error(
              `${MODULE_ID} | IndexedDB open blocked for ${BLOCKED_TIMEOUT_MS / 1000}s — close other Foundry tabs and reload`
            )
          );
        }, BLOCKED_TIMEOUT_MS);
      };
    });

    try {
      return await this._dbPromise;
    } catch (error) {
      this._dbPromise = null;
      throw error;
    }
  }

  /**
   * @param {string} key - Record id
   * @returns {Promise<boolean>} True if a record exists, without reading it
   */
  async has(key) {
    const count = await this._request('readonly', (store) => store.count(key));
    return count > 0;
  }

  /**
   * @param {string} key - Record id
   * @returns {Promise<*|null>} The stored data (unsanitized), or null on a miss
   */
  async read(key) {
    const record = await this._request('readonly', (store) => store.get(key));
    if (!record) {
      console.log(`${MODULE_ID} | No data found in IndexedDB: ${key}`);
      return null;
    }
    console.log(`${MODULE_ID} | Loaded from IndexedDB: ${key}`);
    return record.data;
  }

  /**
   * @param {string} key - Record id
   * @param {*} data - Structured-cloneable data
   * @returns {Promise<void>} Resolves once the transaction has committed
   */
  async write(key, data) {
    await this._commit((store) => store.put({ id: key, data, timestamp: Date.now() }));
    console.log(`${MODULE_ID} | Saved to IndexedDB: ${key}`);
  }

  /**
   * @param {string} key - Record id
   * @returns {Promise<void>} Resolves once the transaction has committed
   */
  async remove(key) {
    await this._commit((store) => store.delete(key));
    console.log(`${MODULE_ID} | Removed from IndexedDB: ${key}`);
  }

  /**
   * @returns {Promise<void>} Resolves once every record is gone
   */
  async clear() {
    await this._commit((store) => store.clear());
    console.log(`${MODULE_ID} | Cleared all data from IndexedDB`);
  }

  /**
   * Close the connection; the next call reopens it.
   * @returns {void}
   */
  close() {
    if (!this._db) return;
    this._db.close();
    this._forget();
    console.log(`${MODULE_ID} | IndexedDB connection closed`);
  }

  /** @private */
  _forget() {
    this._db = null;
    this._dbPromise = null;
  }

  /**
   * Run one request and resolve with its result. Rejects on a request error
   * or a transaction error/abort, whichever comes first.
   * @param {IDBTransactionMode} mode - Transaction mode
   * @param {function(IDBObjectStore): IDBRequest} makeRequest - Issues the request
   * @returns {Promise<*>} The request's result
   * @private
   */
  async _request(mode, makeRequest) {
    const db = await this.open();
    const transaction = db.transaction([STORE_NAME], mode);
    const request = makeRequest(transaction.objectStore(STORE_NAME));
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
    });
  }

  /**
   * Run one write and resolve only when its transaction commits — a request's
   * success does not mean the data is durable yet.
   * @param {function(IDBObjectStore): IDBRequest} makeRequest - Issues the write
   * @returns {Promise<void>}
   * @private
   */
  async _commit(makeRequest) {
    const db = await this.open();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const request = makeRequest(transaction.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
    });
  }
}
