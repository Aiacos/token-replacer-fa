/**
 * Token Replacer FA - Storage Service
 * IndexedDB wrapper for token index storage
 * Features: Automatic connection management, version control, localStorage fallback
 * @module services/StorageService
 */

import { MODULE_ID } from '../core/Constants.js';

const DB_NAME = 'token-replacer-fa';
const DB_VERSION = 1;
const STORE_NAME = 'index';

/**
 * StorageService - IndexedDB wrapper with localStorage fallback
 * Provides async storage API for token index data
 * Handles connection pooling to avoid repeated database open calls
 */
export class StorageService {
  constructor() {
    this.db = null;
    this.dbPromise = null;
    this.isIndexedDBSupported = this.checkIndexedDBSupport();

    if (!this.isIndexedDBSupported) {
      console.warn(`${MODULE_ID} | IndexedDB not supported, falling back to localStorage`);
    }
  }

  /**
   * Check if IndexedDB is supported in this browser
   * @private
   * @returns {boolean} True if IndexedDB is available
   */
  checkIndexedDBSupport() {
    try {
      return typeof window !== 'undefined' &&
             typeof window.indexedDB !== 'undefined' &&
             window.indexedDB !== null;
    } catch (error) {
      console.warn(`${MODULE_ID} | IndexedDB support check failed:`, error);
      return false;
    }
  }

  /**
   * Open IndexedDB connection with connection pooling
   * Reuses existing connection if already open
   * @private
   * @returns {Promise<IDBDatabase>} Database instance
   */
  async openDatabase() {
    // Return cached connection if available
    if (this.db) {
      return this.db;
    }

    // Return pending connection if already opening
    if (this.dbPromise) {
      return this.dbPromise;
    }

    // Create new connection
    this.dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        const error = request.error;
        console.error(`${MODULE_ID} | Failed to open IndexedDB:`, error);
        this.dbPromise = null;
        reject(error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log(`${MODULE_ID} | IndexedDB connection opened successfully`);

        // Handle unexpected close events
        this.db.onclose = () => {
          console.warn(`${MODULE_ID} | IndexedDB connection closed unexpectedly`);
          this.db = null;
          this.dbPromise = null;
        };

        // Handle version change (if database is deleted in another tab)
        this.db.onversionchange = () => {
          console.warn(`${MODULE_ID} | IndexedDB version change detected, closing connection`);
          this.db.close();
          this.db = null;
          this.dbPromise = null;
        };

        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          console.log(`${MODULE_ID} | Created IndexedDB object store: ${STORE_NAME}`);
        }
      };

      request.onblocked = () => {
        console.warn(`${MODULE_ID} | IndexedDB open request blocked - close other tabs or wait`);
      };
    });

    try {
      const db = await this.dbPromise;
      return db;
    } catch (error) {
      this.dbPromise = null;
      throw error;
    }
  }

  /**
   * Test database connection
   * Useful for verification and debugging
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      if (!this.isIndexedDBSupported) {
        console.log(`${MODULE_ID} | IndexedDB not supported, using localStorage fallback`);
        return true; // localStorage fallback is always available
      }

      const db = await this.openDatabase();
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
   * Close database connection
   * Should be called when service is no longer needed
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPromise = null;
      console.log(`${MODULE_ID} | IndexedDB connection closed`);
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
