/**
 * Token Replacer FA - Index Service
 * Hierarchical JSON index organized by creature category
 * Features: Automatic updates based on configurable frequency
 * @module services/IndexService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS, EXCLUDED_FILENAME_TERMS } from '../core/Constants.js';
import { extractPathFromTVAResult, extractNameFromTVAResult, isExcludedPath, createModuleError, createDebugLogger } from '../core/Utils.js';
import { storageService } from './StorageService.js';

const CACHE_KEY = 'token-replacer-fa-index-v3';
const INDEX_VERSION = 14;  // v2.10.0: Added termIndex for O(1) search term lookups

// Update frequency in milliseconds
const UPDATE_FREQUENCIES = {
  daily: 24 * 60 * 60 * 1000,           // 1 day
  weekly: 7 * 24 * 60 * 60 * 1000,      // 7 days
  monthly: 30 * 24 * 60 * 60 * 1000,    // 30 days
  quarterly: 90 * 24 * 60 * 60 * 1000   // 90 days
};

/**
 * IndexService - Hierarchical JSON index for fast creature-based lookups
 * Structure:
 * {
 *   version: 6,
 *   timestamp: Date.now(),
 *   lastUpdate: Date.now(),
 *   categories: {
 *     humanoid: { human: [{path, name}], elf: [...] },
 *     beast: { wolf: [...], bear: [...] },
 *     ...
 *   },
 *   allPaths: { "path": { name, category, subcategories: [] } },
 *   termIndex: { "term": ["path1", "path2", ...] }
 * }
 */
export class IndexService {
  constructor() {
    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
    this.termCategoryMap = this.buildTermCategoryMap();
    this.worker = null;
    // Shared utilities
    this._createError = createModuleError;
    this._debugLog = createDebugLogger('IndexService');

    // Initialize Web Worker if supported
    if (typeof Worker !== 'undefined') {
      try {
        const workerPath = `modules/${MODULE_ID}/scripts/workers/IndexWorker.js`;
        this.worker = new Worker(workerPath);
        console.log(`${MODULE_ID} | Web Worker initialized for background index building`);
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to initialize Web Worker:`, error);
        this.worker = null;
      }
    } else {
      console.warn(`${MODULE_ID} | Web Workers not supported in this browser, using fallback method`);
    }
  }

  /**
   * Build reverse lookup Map from CREATURE_TYPE_MAPPINGS
   * Maps each term to its category for O(1) lookups
   * @private
   * @returns {Map<string, Object>} Map of lowercase term → {category, originalTerm}
   */
  buildTermCategoryMap() {
    const map = new Map();

    for (const [category, terms] of Object.entries(CREATURE_TYPE_MAPPINGS)) {
      for (const term of terms) {
        const termLower = term.toLowerCase();
        map.set(termLower, { category, originalTerm: term });
      }
    }

    return map;
  }

  /**
   * Terminate the Web Worker and clean up resources
   * Should be called when the IndexService is no longer needed
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log(`${MODULE_ID} | Web Worker terminated`);
    }
  }

  /**
   * Cancel the current worker operation
   * Sends a cancel command to the worker, which will stop processing and send a 'cancelled' message
   */
  cancelOperation() {
    if (this.worker) {
      this.worker.postMessage({ command: 'cancel' });
      console.log(`${MODULE_ID} | Cancellation requested`);
    }
  }

  /**
   * Get the configured update frequency in milliseconds
   * @returns {number} Frequency in ms
   */
  getUpdateFrequency() {
    try {
      const setting = game.settings.get(MODULE_ID, 'indexUpdateFrequency');
      return UPDATE_FREQUENCIES[setting] || UPDATE_FREQUENCIES.weekly;
    } catch (e) {
      return UPDATE_FREQUENCIES.weekly;
    }
  }

  /**
   * Check if the index needs updating based on frequency setting
   * @returns {boolean} True if update is needed
   */
  needsUpdate() {
    if (!this.index?.lastUpdate) return true;
    const frequency = this.getUpdateFrequency();
    const elapsed = Date.now() - this.index.lastUpdate;
    return elapsed > frequency;
  }

  /**
   * Determine which category and subcategories an image belongs to
   * Uses pre-built Map for O(n) lookup instead of O(n*m) nested loops
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {Object} { category, subcategories }
   */
  categorizeImage(path, name) {
    // Validate inputs - return empty categorization on invalid input
    if (!path || typeof path !== 'string') {
      this._debugLog('Invalid path in categorizeImage:', path);
      return { category: null, subcategories: [] };
    }

    const searchText = `${path} ${name || ''}`.toLowerCase();
    const categoryMatches = new Map(); // category -> {count, terms}

    // Single loop through all terms using the pre-built map
    for (const [termLower, { category, originalTerm }] of this.termCategoryMap.entries()) {
      if (searchText.includes(termLower)) {
        if (!categoryMatches.has(category)) {
          categoryMatches.set(category, { count: 0, terms: [] });
        }
        const match = categoryMatches.get(category);
        match.count++;
        match.terms.push(originalTerm);
      }
    }

    // Find category with most matches
    let bestCategory = null;
    let subcategories = [];
    let maxMatches = 0;

    for (const [category, { count, terms }] of categoryMatches.entries()) {
      if (count > maxMatches) {
        maxMatches = count;
        bestCategory = category;
        subcategories = terms;
      }
    }

    return { category: bestCategory, subcategories };
  }

  /**
   * Tokenize search text into searchable terms
   * Splits by path separators and common delimiters, converts to lowercase
   * @param {string} text - Text to tokenize (e.g., file path)
   * @returns {string[]} Array of unique lowercase search terms
   */
  tokenizeSearchText(text) {
    if (!text) return [];

    // Split by path separators (/, \), hyphens, underscores, spaces, dots
    const terms = text
      .toLowerCase()
      .split(/[\/\\\-_\s\.]+/)
      .filter(term => term.length > 0);

    // Return unique terms
    return [...new Set(terms)];
  }

  /**
   * Load index from storage
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async loadFromCache() {
    try {
      this._debugLog('Attempting to load index from cache');

      // Check for migration from localStorage to IndexedDB
      if (await storageService.needsMigration(CACHE_KEY, CACHE_KEY)) {
        console.log(`${MODULE_ID} | Detected localStorage cache, migrating to IndexedDB...`);
        await storageService.migrateFromLocalStorage(CACHE_KEY, CACHE_KEY);
      }

      const data = await storageService.load(CACHE_KEY);
      if (!data) return false;

      // Version check
      if (data.version !== INDEX_VERSION) {
        this._debugLog(`Index version mismatch (cached: ${data.version}, current: ${INDEX_VERSION}), rebuilding`);
        console.log(`${MODULE_ID} | Index version mismatch, rebuilding`);
        await storageService.remove(CACHE_KEY);
        return false;
      }

      this.index = data;
      const imageCount = Object.keys(data.allPaths || {}).length;
      this._debugLog(`Loaded index from cache: ${imageCount} images`);
      console.log(`${MODULE_ID} | Loaded index from cache: ${imageCount} images`);

      // Rebuild termIndex if missing or empty (cached before v2.11.3)
      const termIndexSize = Object.keys(this.index.termIndex || {}).length;
      if (imageCount > 0 && termIndexSize === 0) {
        console.log(`${MODULE_ID} | Rebuilding termIndex from cached allPaths...`);
        this.index.termIndex = {};
        for (const [path, pathData] of Object.entries(this.index.allPaths)) {
          const searchTerms = this.tokenizeSearchText(`${path} ${pathData.name}`);
          for (const term of searchTerms) {
            if (!this.index.termIndex[term]) {
              this.index.termIndex[term] = [];
            }
            this.index.termIndex[term].push(path);
          }
        }
        const rebuiltSize = Object.keys(this.index.termIndex).length;
        console.log(`${MODULE_ID} | termIndex rebuilt: ${rebuiltSize} unique terms from ${imageCount} images`);
        // Save updated index back to cache so this only happens once
        await this.saveToCache();
      }

      return true;
    } catch (error) {
      this._debugLog('Failed to load cache:', error);
      console.warn(`${MODULE_ID} | Failed to load cache:`, error);
      // Clean up corrupted cache
      try {
        await storageService.remove(CACHE_KEY);
      } catch (e) {
        // Ignore errors during cleanup
      }
      return false;
    }
  }

  /**
   * Save index to storage
   * @returns {Promise<boolean>} True if saved successfully
   */
  async saveToCache() {
    try {
      if (!this.index) {
        this._debugLog('Cannot save cache: index is null');
        return false;
      }

      this._debugLog('Attempting to save index to localStorage');

      const json = JSON.stringify(this.index);
      const sizeKB = (json.length / 1024).toFixed(0);

      await storageService.save(CACHE_KEY, this.index);
      this._debugLog(`Saved index to cache: ${sizeKB}KB`);
      console.log(`${MODULE_ID} | Saved index to cache (${sizeKB}KB)`);
      return true;
    } catch (error) {
      this._debugLog('Failed to save cache:', error);

      // Check if it's a QuotaExceededError (localStorage full)
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        console.warn(`${MODULE_ID} | Failed to save cache: localStorage is full`, error);
        // This is expected for large indices, not a critical error
      } else {
        console.warn(`${MODULE_ID} | Failed to save cache:`, error);
      }
      return false;
    }
  }

  /**
   * Create empty index structure
   * @returns {Object} Empty index
   */
  createEmptyIndex() {
    const categories = {};
    for (const category of Object.keys(CREATURE_TYPE_MAPPINGS)) {
      categories[category] = {};
    }

    return {
      version: INDEX_VERSION,
      timestamp: Date.now(),
      lastUpdate: Date.now(),
      categories,
      allPaths: {},
      termIndex: {}
    };
  }

  /**
   * Add an image to the index
   * Stores ALL images in allPaths for general search, categorizes when possible
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {boolean} True if image was added, false if skipped
   */
  addImageToIndex(path, name) {
    // Validate path - skip if invalid
    if (!path || typeof path !== 'string') {
      this._debugLog('Invalid path in addImageToIndex:', path);
      return false;
    }

    // Validate index exists
    if (!this.index || !this.index.allPaths || !this.index.termIndex) {
      this._debugLog('Index not initialized, cannot add image');
      return false;
    }

    // Skip if already indexed or excluded folder
    if (this.index.allPaths[path] || isExcludedPath(path)) return false;

    try {
      // Extract name from path if not provided
      const imageName = name || path.split('/').pop()?.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Unknown';

      // Try to categorize the image
      const { category, subcategories } = this.categorizeImage(path, imageName);

      // ALWAYS add to allPaths (even if uncategorized) for general search
      this.index.allPaths[path] = {
        name: imageName,
        category: category || null,
        subcategories: subcategories || []
      };

      // Populate termIndex for O(1) search term lookups
      const searchTerms = this.tokenizeSearchText(`${path} ${imageName}`);
      for (const term of searchTerms) {
        if (!this.index.termIndex[term]) {
          this.index.termIndex[term] = [];
        }
        this.index.termIndex[term].push(path);
      }

      // If categorized, also add to category structure for fast category lookups
      if (category) {
        // Ensure category exists
        if (!this.index.categories[category]) {
          this.index.categories[category] = {};
        }

        // Add to each matching subcategory
        for (const subcat of subcategories) {
          if (!this.index.categories[category][subcat]) {
            this.index.categories[category][subcat] = [];
          }
          this.index.categories[category][subcat].push({ path, name: imageName });
        }

        // Also add to a "_all" subcategory for the category
        if (!this.index.categories[category]._all) {
          this.index.categories[category]._all = [];
        }
        this.index.categories[category]._all.push({ path, name: imageName });
      }

      return true;
    } catch (error) {
      this._debugLog(`Error adding image to index (${path}):`, error);
      return false;
    }
  }

  /**
   * Method 0: Try to use pre-loaded TVA cache passed from TVACacheService (FASTEST method)
   * This is the preferred fallback strategy when TVACacheService has already loaded the cache.
   * Uses direct cache access via TVACacheService._loadTVACacheFromFile() for maximum performance.
   * @param {Array} tvaCacheImages - Pre-loaded TVA cache images from TVACacheService.tvaCacheImages
   * @returns {Array} Array of {path, name, category} objects, or empty array if cache not available
   * @private
   */
  _tryPreloadedCache(tvaCacheImages) {
    if (tvaCacheImages && tvaCacheImages.length > 0) {
      console.log(`${MODULE_ID} | Using pre-loaded TVA cache (FAST PATH): ${tvaCacheImages.length} images`);
      return tvaCacheImages.map(img => ({
        path: img.path,
        name: img.name,
        category: img.category
      }));
    }
    return [];
  }

  /**
   * Method 1: Try to access TVA's cacheImagePaths property directly
   * This strategy accesses the internal cacheImagePaths property if exposed by TVA.
   * Falls back to this method when pre-loaded cache is unavailable.
   * @param {Object} tvaAPI - TVA API instance from game.modules.get('token-variants')?.api
   * @returns {Array} Array of {path, name, category} objects via extractPathsFromTVACache(), or empty array
   * @private
   */
  _tryCacheImagePaths(tvaAPI) {
    if (tvaAPI.cacheImagePaths && typeof tvaAPI.cacheImagePaths === 'object') {
      console.log(`${MODULE_ID} | Reading from TVA cacheImagePaths...`);
      return this.extractPathsFromTVACache(tvaAPI.cacheImagePaths);
    }
    return [];
  }

  /**
   * Method 2: Try to access TVA's internal cache via getSearchCache function
   * This strategy calls the public getSearchCache() API method if available.
   * Asynchronous fallback when direct property access fails.
   * @param {Object} tvaAPI - TVA API instance from game.modules.get('token-variants')?.api
   * @returns {Promise<Array>} Promise resolving to array of {path, name, category} objects via extractPathsFromTVACache(), or empty array on failure
   * @private
   */
  async _tryGetSearchCache(tvaAPI) {
    if (typeof tvaAPI.getSearchCache === 'function') {
      console.log(`${MODULE_ID} | Reading from TVA getSearchCache...`);
      try {
        const cache = await tvaAPI.getSearchCache();
        return this.extractPathsFromTVACache(cache);
      } catch (e) {
        console.warn(`${MODULE_ID} | getSearchCache failed:`, e);
      }
    }
    return [];
  }

  /**
   * Method 3: Attempt to inspect TVA_CONFIG and globalThis for cache data
   * This strategy tries multiple sub-strategies to find cache data in TVA's configuration:
   * - 3a: Inspect TVA_CONFIG object for large arrays/Maps/objects that might contain cache
   * - 3b: Check TVA_CONFIG.searchPaths for configured paths
   * - 3c: Search globalThis for TVA global variables (TVA_IMAGES, TVA_CACHE, etc.)
   * Falls back to this when TVA API methods don't expose cache directly.
   * @param {Object} tvaAPI - TVA API instance containing TVA_CONFIG property
   * @returns {Array} Array of {path, name, category} objects from any found cache source, or empty array
   * @private
   */
  _tryTVAConfig(tvaAPI) {
    let allPaths = [];

    // Method 3a: Check TVA_CONFIG for cache info
    if (tvaAPI.TVA_CONFIG) {
      console.log(`${MODULE_ID} | Checking TVA_CONFIG...`);
      const config = tvaAPI.TVA_CONFIG;
      const configKeys = Object.keys(config);
      console.log(`${MODULE_ID} | TVA_CONFIG keys (${configKeys.length}):`, configKeys);

      // Look for any property that might contain cache data (arrays, Maps, large objects)
      for (const key of configKeys) {
        const val = config[key];
        if (val && (Array.isArray(val) || val instanceof Map || (typeof val === 'object' && Object.keys(val).length > 100))) {
          console.log(`${MODULE_ID} | TVA_CONFIG.${key} is potential cache:`, {
            type: typeof val,
            isArray: Array.isArray(val),
            isMap: val instanceof Map,
            constructor: val?.constructor?.name,
            size: Array.isArray(val) ? val.length : (val instanceof Map ? val.size : Object.keys(val).length)
          });
        }
      }

      // staticCache is just a boolean flag, not the cache itself
      console.log(`${MODULE_ID} | staticCache is:`, config.staticCache, '(this is just a flag, not the cache)');
    }

    // Method 3b: Look for TVA's searchPaths - this might contain configured paths
    if (allPaths.length === 0 && tvaAPI.TVA_CONFIG?.searchPaths) {
      console.log(`${MODULE_ID} | Found searchPaths:`, tvaAPI.TVA_CONFIG.searchPaths);
    }

    // Method 3c: Check for globalThis variables that TVA might use
    if (allPaths.length === 0) {
      const tvaGlobals = ['TVA_IMAGES', 'TVA_CACHE', 'TVA_STATIC_CACHE', 'tvaImageCache'];
      for (const name of tvaGlobals) {
        if (globalThis[name]) {
          console.log(`${MODULE_ID} | Found global ${name}:`, typeof globalThis[name]);
          allPaths = this.extractPathsFromTVACache(globalThis[name]);
          if (allPaths.length > 0) break;
        }
      }
    }

    return allPaths;
  }

  /**
   * Method 4: Try to access TVA cache data from Foundry game settings
   * This strategy checks Foundry's game.settings storage where TVA may persist cache data.
   * Tries multiple possible setting names: staticCache, staticCachePaths, cachedImages, imageCache, cacheData.
   * Each setting access is wrapped in try-catch to handle missing settings gracefully.
   * Falls back to this when TVA API and config inspection fail.
   * @returns {Array} Array of {path, name, category} objects from game settings, or empty array if not found
   * @private
   */
  _tryGameSettings() {
    let allPaths = [];

    console.log(`${MODULE_ID} | Trying TVA game settings...`);
    try {
      // TVA stores static cache in game settings
      const staticCache = game.settings.get('token-variants', 'staticCache');
      if (staticCache) {
        console.log(`${MODULE_ID} | Found staticCache in game settings, type:`, typeof staticCache,
          Array.isArray(staticCache) ? `length: ${staticCache.length}` : '');
        allPaths = this.extractPathsFromTVACache(staticCache);
      }
    } catch (e) {
      console.log(`${MODULE_ID} | No staticCache in settings:`, e.message);
    }

    // Also try other possible setting names
    const settingNames = ['staticCachePaths', 'cachedImages', 'imageCache', 'cacheData'];
    for (const name of settingNames) {
      if (allPaths.length > 0) break;
      try {
        const data = game.settings.get('token-variants', name);
        if (data) {
          console.log(`${MODULE_ID} | Found ${name} in settings`);
          allPaths = this.extractPathsFromTVACache(data);
        }
      } catch (e) {
        // Setting doesn't exist
      }
    }

    return allPaths;
  }

  /**
   * Method 5: Try to access TVA's internal cache structure directly
   * This is the last-resort strategy before falling back to doImageSearch.
   * Attempts to access various internal/undocumented cache locations:
   * - tvaAPI.cache, tvaAPI._cache, tvaAPI.imageCache, tvaAPI.staticCache
   * - tvaModule.cache, tvaModule.api.cache
   * - window.TVA.cache, window.TVA.staticCache
   * - globalThis.TVA_CACHE
   * Only use when all documented access methods have failed.
   * @param {Object} tvaAPI - TVA API instance for inspecting internal properties
   * @returns {Array} Array of {path, name, category} objects from any found internal cache, or empty array
   * @private
   */
  _tryInternalCache(tvaAPI) {
    console.log(`${MODULE_ID} | Trying to access TVA internal cache...`);
    const tvaModule = game.modules.get('token-variants');

    // Try various internal cache locations
    const possibleCaches = [
      tvaAPI.cache,
      tvaAPI._cache,
      tvaAPI.imageCache,
      tvaAPI.staticCache,
      tvaModule?.cache,
      tvaModule?.api?.cache,
      window.TVA?.cache,
      window.TVA?.staticCache,
      globalThis.TVA_CACHE
    ];

    for (const cache of possibleCaches) {
      if (cache) {
        console.log(`${MODULE_ID} | Found potential cache:`, typeof cache, cache?.constructor?.name);
        const paths = this.extractPathsFromTVACache(cache);
        if (paths.length > 0) return paths;
      }
    }

    return [];
  }

  /**
   * Build index from TVA API - reads cache directly for speed
   *
   * Uses a fallback chain of 6 cache access strategies, tried in sequence until one succeeds:
   * 1. _tryPreloadedCache() - Pre-loaded cache from TVACacheService (FASTEST)
   * 2. _tryCacheImagePaths() - TVA's cacheImagePaths property
   * 3. _tryGetSearchCache() - TVA's getSearchCache() API method
   * 4. _tryTVAConfig() - TVA_CONFIG inspection and globalThis variables
   * 5. _tryGameSettings() - Foundry game.settings for TVA static cache
   * 6. _tryInternalCache() - Direct inspection of TVA's internal cache structure
   *
   * Each strategy is implemented as a separate method for maintainability and testing.
   * If all strategies fail, falls back to buildFromTVASearch().
   *
   * @param {Function} onProgress - Progress callback
   * @param {Array} tvaCacheImages - Optional pre-loaded TVA cache images from TVACacheService
   * @returns {Promise<number>} Number of images indexed
   * @throws {Object} Structured error if TVA not available
   */
  async buildFromTVA(onProgress = null, tvaCacheImages = null) {
    const tvaAPI = game.modules.get('token-variants')?.api;
    if (!tvaAPI) {
      this._debugLog('TVA API not available');
      console.warn(`${MODULE_ID} | TVA API not available`);
      throw this._createError(
        'tva_missing',
        'Token Variant Art module is not installed, enabled, or its API is not available',
        ['install_tva', 'check_console']
      );
    }

    this._debugLog('Building index from TVA cache...');
    console.log(`${MODULE_ID} | Building index from TVA cache...`);

    // Try to read TVA cache directly (much faster than doImageSearch)
    let allPaths = [];

    try {
      // Method 0 (FASTEST): Use pre-loaded cache passed from TVACacheService
      allPaths = this._tryPreloadedCache(tvaCacheImages);

      // Method 1: Try TVA's cacheImagePaths (direct cache access)
      if (allPaths.length === 0) {
        this._debugLog('Trying TVA cacheImagePaths...');
        allPaths = this._tryCacheImagePaths(tvaAPI);
      }

      // Method 2: Try TVA's internal cache via getSearchCache
      if (allPaths.length === 0) {
        this._debugLog('Trying TVA getSearchCache...');
        allPaths = await this._tryGetSearchCache(tvaAPI);
      }

      // Method 3: Check TVA_CONFIG for cache info
      if (allPaths.length === 0) {
        this._debugLog('Trying TVA_CONFIG inspection...');
        allPaths = this._tryTVAConfig(tvaAPI);
      }

      // Method 4: Try Foundry game settings for TVA static cache
      if (allPaths.length === 0) {
        this._debugLog('Trying game settings...');
        allPaths = this._tryGameSettings();
      }

      // Method 5: Access TVA's internal cache structure directly
      if (allPaths.length === 0) {
        this._debugLog('Trying internal cache access...');
        allPaths = this._tryInternalCache(tvaAPI);
      }

      // If we found paths in cache, index them directly
      if (allPaths.length > 0) {
        this._debugLog(`Found ${allPaths.length} paths in TVA cache, indexing...`);
        console.log(`${MODULE_ID} | Found ${allPaths.length} paths in TVA cache, indexing...`);

        // Use Web Worker if available, otherwise fallback to direct indexing
        if (this.worker) {
          this._debugLog('Using Web Worker for background index building');
          console.log(`${MODULE_ID} | Using Web Worker for background index building`);
          try {
            return await this.indexPathsWithWorker(allPaths, onProgress);
          } catch (error) {
            // Worker failed, fallback to direct indexing
            this._debugLog('Worker indexing failed, falling back to direct indexing:', error);
            console.warn(`${MODULE_ID} | Worker failed, falling back to direct indexing:`, error);
            this.worker = null; // Disable worker for future attempts
            return await this.indexPathsDirectly(allPaths, onProgress);
          }
        } else {
          this._debugLog('Using fallback method (main thread with yields)');
          console.log(`${MODULE_ID} | Using fallback method (main thread with yields)`);
          return await this.indexPathsDirectly(allPaths, onProgress);
        }
      }

      // Fallback: Log available TVA API methods to find the cache
      this._debugLog('Could not find TVA cache directly, logging available API methods');
      console.log(`${MODULE_ID} | Could not find TVA cache directly. Available API methods:`);
      const apiMethods = Object.keys(tvaAPI).filter(k => typeof tvaAPI[k] === 'function');
      const apiProps = Object.keys(tvaAPI).filter(k => typeof tvaAPI[k] !== 'function');
      console.log(`${MODULE_ID} | Methods:`, apiMethods);
      console.log(`${MODULE_ID} | Properties:`, apiProps);

      // Ultimate fallback: use doImageSearch with a broad search
      this._debugLog('Falling back to broad search via doImageSearch');
      console.log(`${MODULE_ID} | Falling back to broad search...`);
      return await this.buildFromTVASearch(onProgress);
    } catch (error) {
      this._debugLog('Error during TVA index build:', error);

      // Re-throw structured errors
      if (error.errorType) {
        throw error;
      }

      // Wrap unexpected errors
      throw this._createError(
        'index_build_failed',
        `Failed to build index from TVA: ${error.message || 'Unknown error'}`,
        ['rebuild_cache', 'reload_module', 'check_console']
      );
    }
  }

  /**
   * Extract paths from TVA cache structure (handles various formats)
   * @param {*} cache - TVA cache object
   * @returns {Array} Array of path strings
   */
  extractPathsFromTVACache(cache) {
    const paths = [];

    if (!cache) return paths;

    // If it's a Map
    if (cache instanceof Map) {
      for (const [key, value] of cache.entries()) {
        if (typeof key === 'string' && this.isValidImagePath(key)) {
          paths.push(key);
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const path = this.extractSinglePath(item);
            if (path) paths.push(path);
          }
        }
      }
    }
    // If it's an array
    else if (Array.isArray(cache)) {
      for (const item of cache) {
        const path = this.extractSinglePath(item);
        if (path) paths.push(path);
      }
    }
    // If it's an object with path arrays
    else if (typeof cache === 'object') {
      // Check for common property names
      const arrayProps = ['paths', 'images', 'data', 'items', 'results', 'files'];
      for (const prop of arrayProps) {
        if (Array.isArray(cache[prop])) {
          for (const item of cache[prop]) {
            const path = this.extractSinglePath(item);
            if (path) paths.push(path);
          }
        }
      }

      // Iterate all properties
      for (const [key, value] of Object.entries(cache)) {
        if (typeof key === 'string' && this.isValidImagePath(key)) {
          paths.push(key);
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            const path = this.extractSinglePath(item);
            if (path) paths.push(path);
          }
        }
      }
    }

    return [...new Set(paths)]; // Deduplicate
  }

  /**
   * Extract a single path from various item formats
   * @param {*} item - Item from TVA cache
   * @returns {string|null} Path or null
   */
  extractSinglePath(item) {
    if (!item) return null;

    // String path
    if (typeof item === 'string' && this.isValidImagePath(item)) {
      return item;
    }

    // Tuple [path, config]
    if (Array.isArray(item) && item.length > 0) {
      if (typeof item[0] === 'string' && this.isValidImagePath(item[0])) {
        return item[0];
      }
    }

    // Object with path property
    if (typeof item === 'object') {
      const pathProps = ['path', 'route', 'img', 'src', 'image', 'url', 'uri'];
      for (const prop of pathProps) {
        if (item[prop] && typeof item[prop] === 'string' && this.isValidImagePath(item[prop])) {
          return item[prop];
        }
      }
    }

    return null;
  }

  /**
   * Check if a string looks like a valid image path
   * @param {string} str - String to check
   * @returns {boolean} True if valid path
   */
  isValidImagePath(str) {
    if (!str || typeof str !== 'string') return false;
    return str.includes('/') || str.startsWith('http') || str.startsWith('forge://') ||
           str.endsWith('.webp') || str.endsWith('.png') || str.endsWith('.jpg') ||
           str.endsWith('.jpeg') || str.endsWith('.gif') || str.endsWith('.svg');
  }

  /**
   * Index an array of paths using the Web Worker
   * Runs in background without blocking the main thread
   * @param {Array} paths - Array of image paths or {path, name} objects
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<number>} Number of images indexed
   * @throws {Object} Structured error if worker fails
   */
  async indexPathsWithWorker(paths, onProgress = null) {
    if (!this.worker) {
      this._debugLog('Worker not available for indexPathsWithWorker');
      throw this._createError(
        'worker_failed',
        'Web Worker not available for background indexing',
        ['disable_worker', 'reload_module']
      );
    }

    // Validate paths array
    if (!Array.isArray(paths) || paths.length === 0) {
      this._debugLog('Invalid paths array in indexPathsWithWorker:', paths);
      throw this._createError(
        'invalid_paths',
        'Paths array is empty or invalid',
        ['check_paths', 'reload_module']
      );
    }

    this._debugLog(`Starting worker-based indexing for ${paths.length} paths`);

    return new Promise((resolve, reject) => {
      // Create a unique message handler for this indexing operation
      const messageHandler = (event) => {
        const { type, processed, total, imagesFound, result, message, stack } = event.data;

        switch (type) {
          case 'progress':
            // Call progress callback with worker's progress update
            this._debugLog(`Worker progress: ${processed}/${total} (${imagesFound} images found)`);
            if (onProgress) {
              onProgress(processed, total, imagesFound);
            }
            break;

          case 'complete':
            // Merge worker results into the index
            this.index.categories = result.categories;
            this.index.allPaths = result.allPaths;

            // Build termIndex from allPaths (worker doesn't build it)
            this.index.termIndex = {};
            for (const [path, data] of Object.entries(this.index.allPaths)) {
              const searchTerms = this.tokenizeSearchText(`${path} ${data.name}`);
              for (const term of searchTerms) {
                if (!this.index.termIndex[term]) {
                  this.index.termIndex[term] = [];
                }
                this.index.termIndex[term].push(path);
              }
            }

            // Clean up the message handler
            this.worker.removeEventListener('message', messageHandler);

            this._debugLog(`Worker completed: ${imagesFound} images from ${total} paths`);
            console.log(`${MODULE_ID} | Worker completed: ${imagesFound} images from ${total} paths`);
            resolve(imagesFound);
            break;

          case 'cancelled':
            // Clean up on cancellation
            this.worker.removeEventListener('message', messageHandler);
            console.log(`${MODULE_ID} | Operation cancelled by user`);
            reject(new Error('Operation cancelled'));
            break;

          case 'error':
            // Clean up and reject on error
            this.worker.removeEventListener('message', messageHandler);
            this._debugLog(`Worker error: ${message}`, stack);
            console.error(`${MODULE_ID} | Worker error:`, message);

            // Create structured error
            const error = this._createError(
              'worker_failed',
              `Web Worker indexing failed: ${message || 'Unknown error'}`,
              ['disable_worker', 'reload_module', 'check_console']
            );
            reject(error);
            break;

          default:
            // Ignore unknown message types (e.g., 'pong' from ping)
            break;
        }
      };

      // Attach message handler
      this.worker.addEventListener('message', messageHandler);

      // Add error handler for worker errors
      const errorHandler = (error) => {
        this.worker.removeEventListener('message', messageHandler);
        this.worker.removeEventListener('error', errorHandler);
        this._debugLog('Worker error event:', error);
        console.error(`${MODULE_ID} | Worker error event:`, error);

        const structuredError = this._createError(
          'worker_failed',
          `Web Worker crashed: ${error.message || 'Unknown error'}`,
          ['disable_worker', 'reload_module', 'check_console']
        );
        reject(structuredError);
      };

      this.worker.addEventListener('error', errorHandler);

      try {
        // Post the indexing task to the worker
        this.worker.postMessage({
          command: 'indexPaths',
          data: {
            paths: paths,
            creatureTypeMappings: CREATURE_TYPE_MAPPINGS,
            excludedFolders: EXCLUDED_FOLDERS,
            excludedFilenameTerms: EXCLUDED_FILENAME_TERMS
          }
        });
      } catch (error) {
        this.worker.removeEventListener('message', messageHandler);
        this.worker.removeEventListener('error', errorHandler);
        this._debugLog('Failed to post message to worker:', error);

        const structuredError = this._createError(
          'worker_failed',
          `Failed to start worker: ${error.message}`,
          ['disable_worker', 'reload_module']
        );
        reject(structuredError);
      }
    });
  }

  /**
   * Index paths directly without search
   * @param {Array} paths - Array of path strings
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<number>} Number of images indexed
   * @throws {Object} Structured error if indexing fails
   */
  async indexPathsDirectly(paths, onProgress = null) {
    // Validate paths array
    if (!Array.isArray(paths)) {
      this._debugLog('Invalid paths parameter in indexPathsDirectly:', paths);
      throw this._createError(
        'invalid_paths',
        'Paths parameter is not an array',
        ['check_paths', 'check_console']
      );
    }

    if (paths.length === 0) {
      this._debugLog('Empty paths array in indexPathsDirectly');
      return 0; // Not an error, just no paths to index
    }

    const totalPaths = paths.length;
    let imagesFound = 0;

    this._debugLog(`Starting direct indexing for ${totalPaths} paths`);
    console.log(`${MODULE_ID} | Indexing ${totalPaths} paths directly...`);

    // Performance tracking
    const startTime = performance.now();
    let batchStartTime = performance.now();
    let batchImagesProcessed = 0;

    try {
      const BATCH_SIZE = 1000;
      for (let i = 0; i < totalPaths; i += BATCH_SIZE) {
        const batch = paths.slice(i, i + BATCH_SIZE);

        for (const item of batch) {
          // Handle both string paths and {path, name, category} objects
          const path = typeof item === 'string' ? item : item?.path;
          const name = typeof item === 'string' ? null : item?.name;
          if (this.addImageToIndex(path, name)) {
            imagesFound++;
          }
          batchImagesProcessed++;
        }

        // Log performance stats every 1000 images
        const batchEndTime = performance.now();
        const batchDuration = batchEndTime - batchStartTime;
        const timePerImage = batchDuration / batchImagesProcessed;
        const processed = Math.min(i + BATCH_SIZE, totalPaths);

        this._debugLog(`Progress: ${processed}/${totalPaths} images | Batch: ${batchDuration.toFixed(1)}ms (${timePerImage.toFixed(3)}ms/image)`);
        console.log(`${MODULE_ID} | Progress: ${processed}/${totalPaths} images | Batch: ${batchDuration.toFixed(1)}ms (${timePerImage.toFixed(3)}ms/image, ${(1000/batchDuration*batchImagesProcessed).toFixed(0)} images/sec)`);

        // Reset batch tracking
        batchStartTime = performance.now();
        batchImagesProcessed = 0;

        // Progress callback
        if (onProgress) {
          onProgress(processed, totalPaths, imagesFound);
        }

        // Yield to main thread
        await new Promise(r => setTimeout(r, 10));
      }

      // Final performance summary
      const totalTime = performance.now() - startTime;
      const avgTimePerImage = totalTime / totalPaths;
      const throughput = (totalPaths / totalTime * 1000).toFixed(0);

      this._debugLog(`Indexed ${imagesFound} images from ${totalPaths} paths in ${totalTime.toFixed(0)}ms`);
      console.log(`${MODULE_ID} | Indexed ${imagesFound} images from ${totalPaths} paths`);
      console.log(`${MODULE_ID} | Performance: Total ${totalTime.toFixed(0)}ms | Avg ${avgTimePerImage.toFixed(3)}ms/image | ${throughput} images/sec`);

      return imagesFound;
    } catch (error) {
      this._debugLog('Error during direct indexing:', error);
      throw this._createError(
        'index_build_failed',
        `Failed to index paths: ${error.message || 'Unknown error'}`,
        ['reload_module', 'check_console']
      );
    }
  }

  /**
   * Fallback: Build index using TVA doImageSearch
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<number>} Number of images indexed
   */
  async buildFromTVASearch(onProgress = null) {
    const tvaAPI = game.modules.get('token-variants')?.api;

    // Collect all unique search terms
    const allTerms = new Set();
    for (const [category, terms] of Object.entries(CREATURE_TYPE_MAPPINGS)) {
      allTerms.add(category);
      terms.forEach(t => allTerms.add(t));
    }

    const termsArray = Array.from(allTerms);
    const totalTerms = termsArray.length;
    let processed = 0;
    let imagesFound = 0;
    let debugLogged = false;

    // Performance tracking
    const startTime = performance.now();

    console.log(`${MODULE_ID} | Searching ${totalTerms} terms via doImageSearch...`);

    const BATCH_SIZE = 20;
    for (let i = 0; i < termsArray.length; i += BATCH_SIZE) {
      const batch = termsArray.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (term) => {
        try {
          let results = await tvaAPI.doImageSearch(term, { searchType: 'Portrait' });
          if (!results || (Array.isArray(results) && results.length === 0)) {
            results = await tvaAPI.doImageSearch(term);
          }
          return { term, results };
        } catch (e) {
          return { term, results: null, error: e.message };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status !== 'fulfilled' || !result.value?.results) continue;
        const { term, results } = result.value;

        // DEBUG: Log first few results to understand format
        if (!debugLogged && results) {
          console.log(`${MODULE_ID} | DEBUG doImageSearch for "${term}":`, {
            type: typeof results,
            isArray: Array.isArray(results),
            isMap: results instanceof Map,
            constructor: results?.constructor?.name,
            size: results instanceof Map ? results.size : 'N/A'
          });

          // If it's a Map, log detailed structure of entries
          if (results instanceof Map) {
            console.log(`${MODULE_ID} | DEBUG Map keys:`, [...results.keys()]);
            for (const [mapKey, mapValue] of results.entries()) {
              console.log(`${MODULE_ID} | DEBUG Map entry "${mapKey}":`, {
                valueType: typeof mapValue,
                isArray: Array.isArray(mapValue),
                length: Array.isArray(mapValue) ? mapValue.length : 'N/A',
                sample: Array.isArray(mapValue) ? mapValue.slice(0, 2) : mapValue
              });
            }
          }
          debugLogged = true;
        }

        const items = this.extractItemsFromResults(results);

        // DEBUG: Log extraction results
        if (processed < BATCH_SIZE && items.length > 0) {
          console.log(`${MODULE_ID} | DEBUG extracted ${items.length} items from "${term}", first:`, items[0]);
        }

        for (const item of items) {
          const path = extractPathFromTVAResult(item);

          // DEBUG: Log path extraction for first few
          if (processed < BATCH_SIZE && !path && items.length > 0) {
            console.log(`${MODULE_ID} | DEBUG path extraction FAILED for:`, item);
          }

          if (path) {
            const name = extractNameFromTVAResult(item, path);
            if (this.addImageToIndex(path, name)) {
              imagesFound++;
            }
          }
        }
      }

      processed += batch.length;
      if (onProgress && (processed % 50 === 0 || processed === totalTerms)) {
        onProgress(processed, totalTerms, Object.keys(this.index.allPaths).length);
      }
      await new Promise(r => setTimeout(r, 50));
    }

    // Final performance summary
    const totalTime = performance.now() - startTime;
    const totalImages = Object.keys(this.index.allPaths).length;
    if (totalImages > 0) {
      const avgTimePerImage = totalTime / totalImages;
      const throughput = (totalImages / totalTime * 1000).toFixed(0);
      console.log(`${MODULE_ID} | Performance: Total ${totalTime.toFixed(0)}ms | Avg ${avgTimePerImage.toFixed(3)}ms/image | ${throughput} images/sec`);
    }

    return imagesFound;
  }

  /**
   * Extract items from various TVA result formats
   * @param {*} results - TVA results
   * @returns {Array} Array of items
   */
  extractItemsFromResults(results) {
    const items = [];

    if (Array.isArray(results)) {
      items.push(...results);
    } else if (results instanceof Map) {
      for (const [key, value] of results.entries()) {
        if (Array.isArray(value)) {
          items.push(...value);
        } else if (value) {
          items.push(value);
        }
        // Key might be a path
        if (typeof key === 'string' && (key.includes('/') || key.startsWith('http'))) {
          items.push({ path: key });
        }
      }
    } else if (results && typeof results === 'object') {
      const arr = results.paths || results.images || results.results || results.data;
      if (Array.isArray(arr)) {
        items.push(...arr);
      } else {
        items.push(results);
      }
    }

    return items;
  }

  /**
   * Build or update the index
   * @param {boolean} forceRebuild - Force full rebuild
   * @param {Function} onProgress - Progress callback
   * @param {Array} tvaCacheImages - Optional pre-loaded TVA cache images from TVACacheService
   * @returns {Promise<boolean>} True if successful
   * @throws {Object} Structured error if build fails
   */
  async build(forceRebuild = false, onProgress = null, tvaCacheImages = null) {
    if (this.buildPromise) {
      this._debugLog('Build already in progress, returning existing promise');
      return this.buildPromise;
    }

    this.buildPromise = (async () => {
      const startTime = performance.now();
      this._debugLog(`Starting index build (forceRebuild: ${forceRebuild})`);
      console.log(`${MODULE_ID} | Starting index build...`);

      try {
        // Try to load from cache first
        if (!forceRebuild && await this.loadFromCache()) {
          // Check if update is needed
          if (!this.needsUpdate()) {
            this.isBuilt = true;
            this._debugLog('Index loaded from cache, no update needed');
            console.log(`${MODULE_ID} | Index loaded from cache, no update needed`);
            return true;
          }
          this._debugLog('Index needs update based on frequency setting');
          console.log(`${MODULE_ID} | Index needs update based on frequency setting`);
        }

        // Create new index
        this.index = this.createEmptyIndex();
        this._debugLog('Created empty index structure');

        // Build from TVA (pass pre-loaded cache if available)
        await this.buildFromTVA(onProgress, tvaCacheImages);

        // Use actual count from allPaths
        const totalImages = Object.keys(this.index.allPaths).length;

        if (totalImages > 0) {
          this.index.lastUpdate = Date.now();
          await this.saveToCache();
          this.isBuilt = true;

          const stats = this.getStats();
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
          this._debugLog(`Index built: ${totalImages} total images (${stats.categorizedImages} categorized) in ${elapsed}s`);
          console.log(`${MODULE_ID} | Index built: ${totalImages} total images (${stats.categorizedImages} categorized) in ${elapsed}s`);
          return true;
        }

        this._debugLog('Index build returned 0 images');
        console.warn(`${MODULE_ID} | Index build returned 0 images`);
        this.isBuilt = false;

        // Throw error instead of returning false for clearer error handling
        throw this._createError(
          'index_build_failed',
          'Index build completed but no images were indexed',
          ['rebuild_cache', 'check_paths', 'check_console']
        );
      } catch (error) {
        this._debugLog('Index build failed:', error);
        this.isBuilt = false;

        // Re-throw structured errors as-is
        if (error.errorType) {
          throw error;
        }

        // Wrap unexpected errors
        throw this._createError(
          'index_build_failed',
          `Index build failed: ${error.message || 'Unknown error'}`,
          ['reload_module', 'check_console', 'contact_support']
        );
      }
    })();

    try {
      const result = await this.buildPromise;
      return result;
    } finally {
      this.buildPromise = null;
    }
  }

  /**
   * Search by creature category
   * @param {string} category - Creature type (humanoid, beast, etc.)
   * @returns {Array} All images in category
   */
  searchByCategory(category) {
    // Validate index is built
    if (!this.isBuilt || !this.index?.categories) {
      this._debugLog('Index not built, cannot search by category');
      return [];
    }

    // Validate category parameter
    if (!category || typeof category !== 'string') {
      this._debugLog('Invalid category parameter:', category);
      return [];
    }

    try {
      const categoryLower = category.toLowerCase();
      const categoryData = this.index.categories[categoryLower];

      if (!categoryData?._all) {
        this._debugLog(`No data found for category: ${categoryLower}`);
        return [];
      }

      // Return all images in this category
      const results = categoryData._all.map(item => ({
        path: item.path,
        name: item.name,
        source: 'index',
        category: categoryLower
      }));

      this._debugLog(`Found ${results.length} results for category: ${categoryLower}`);
      return results;
    } catch (error) {
      this._debugLog(`Error searching by category (${category}):`, error);
      return [];
    }
  }

  /**
   * Search by subcategory (e.g., "elf" within humanoid)
   * @param {string} category - Main category
   * @param {string} subcategory - Subcategory term
   * @returns {Array} Matching images
   */
  searchBySubcategory(category, subcategory) {
    // Validate index is built
    if (!this.isBuilt || !this.index?.categories) {
      this._debugLog('Index not built, cannot search by subcategory');
      return [];
    }

    // Validate parameters
    if (!category || typeof category !== 'string' || !subcategory || typeof subcategory !== 'string') {
      this._debugLog('Invalid category or subcategory parameters:', { category, subcategory });
      return [];
    }

    try {
      const categoryLower = category.toLowerCase();
      const subcatLower = subcategory.toLowerCase();
      const categoryData = this.index.categories[categoryLower];

      if (!categoryData) {
        this._debugLog(`Category not found: ${categoryLower}`);
        return [];
      }

      // Direct subcategory match
      if (categoryData[subcatLower]) {
        const results = categoryData[subcatLower].map(item => ({
          path: item.path,
          name: item.name,
          source: 'index',
          category: categoryLower,
          subcategory: subcatLower
        }));
        this._debugLog(`Found ${results.length} results for subcategory: ${categoryLower}/${subcatLower}`);
        return results;
      }

      // Partial match in subcategory names
      const results = [];
      const seenPaths = new Set();

      for (const [subcat, items] of Object.entries(categoryData)) {
        if (subcat === '_all') continue;
        if (subcat.includes(subcatLower) || subcatLower.includes(subcat)) {
          for (const item of items) {
            if (!seenPaths.has(item.path)) {
              seenPaths.add(item.path);
              results.push({
                path: item.path,
                name: item.name,
                source: 'index',
                category: categoryLower,
                subcategory: subcat
              });
            }
          }
        }
      }

      this._debugLog(`Found ${results.length} partial matches for subcategory: ${categoryLower}/${subcatLower}`);
      return results;
    } catch (error) {
      this._debugLog(`Error searching by subcategory (${category}/${subcategory}):`, error);
      return [];
    }
  }

  /**
   * Search by term across all categories using O(1) termIndex lookup
   * @param {string} term - Search term
   * @returns {Array} Matching images
   */
  search(term) {
    // Validate index is built
    if (!this.isBuilt || !this.index?.allPaths || !this.index?.termIndex) {
      this._debugLog('Index not built or incomplete, cannot search');
      return [];
    }

    // Validate term parameter
    if (!term || typeof term !== 'string') {
      this._debugLog('Invalid search term:', term);
      return [];
    }

    try {
      const termLower = term.toLowerCase();
      const tokens = this.tokenizeSearchText(termLower);
      const seenPaths = new Set();
      const results = [];

      this._debugLog(`Searching for term: "${term}" (tokens: ${tokens.join(', ')})`);

      // O(1) lookup in termIndex for each token
      for (const token of tokens) {
        const paths = this.index.termIndex[token];
        if (paths) {
          for (const path of paths) {
            if (!seenPaths.has(path)) {
              seenPaths.add(path);
              const data = this.index.allPaths[path];
              if (data) {
                results.push({
                  path,
                  name: data.name,
                  source: 'index',
                  category: data.category
                });
              }
            }
          }
        }
      }

      this._debugLog(`Found ${results.length} results for term: "${term}"`);
      return results;
    } catch (error) {
      this._debugLog(`Error searching for term (${term}):`, error);
      return [];
    }
  }

  /**
   * Search multiple terms (OR logic) - optimized to use termIndex directly
   * @param {string[]} terms - Search terms
   * @returns {Array} Combined results
   */
  searchMultiple(terms) {
    // Validate terms parameter
    if (!terms || !Array.isArray(terms) || terms.length === 0) {
      this._debugLog('Invalid or empty terms array:', terms);
      return [];
    }

    // Validate index is built
    if (!this.isBuilt || !this.index?.allPaths || !this.index?.termIndex) {
      this._debugLog('Index not built or incomplete, cannot search multiple terms');
      return [];
    }

    try {
      const seenPaths = new Set();
      const results = [];

      // Tokenize all terms once and collect unique tokens
      const allTokens = new Set();
      for (const term of terms) {
        if (term && typeof term === 'string') {
          const tokens = this.tokenizeSearchText(term.toLowerCase());
          for (const token of tokens) {
            allTokens.add(token);
          }
        }
      }

      this._debugLog(`Searching for multiple terms: [${terms.join(', ')}] (${allTokens.size} unique tokens)`);

      // O(1) lookup in termIndex for each unique token
      for (const token of allTokens) {
        const paths = this.index.termIndex[token];
        if (paths) {
          for (const path of paths) {
            if (!seenPaths.has(path)) {
              seenPaths.add(path);
              const data = this.index.allPaths[path];
              if (data) {
                results.push({
                  path,
                  name: data.name,
                  source: 'index',
                  category: data.category
                });
              }
            }
          }
        }
      }

      this._debugLog(`Found ${results.length} results for multiple terms`);
      return results;
    } catch (error) {
      this._debugLog('Error searching multiple terms:', error);
      return [];
    }
  }

  /**
   * Get index statistics
   * @returns {Object} Stats
   */
  getStats() {
    const categoryStats = {};
    let categorizedCount = 0;

    if (this.index?.categories) {
      for (const [cat, data] of Object.entries(this.index.categories)) {
        const count = data._all?.length || 0;
        categoryStats[cat] = count;
        categorizedCount += count;
      }
    }

    const totalImages = Object.keys(this.index?.allPaths || {}).length;

    return {
      isBuilt: this.isBuilt,
      version: this.index?.version || 0,
      totalImages: totalImages,
      categorizedImages: categorizedCount,
      uncategorizedImages: totalImages - categorizedCount,
      lastUpdate: this.index?.lastUpdate ? new Date(this.index.lastUpdate).toLocaleString() : 'Never',
      categories: categoryStats
    };
  }

  /**
   * Clear the index
   */
  async clear() {
    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
    await storageService.remove(CACHE_KEY);
    console.log(`${MODULE_ID} | Index cleared`);
  }

  /**
   * Force rebuild the index
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<boolean>}
   */
  async forceRebuild(onProgress = null) {
    await this.clear();
    return this.build(true, onProgress);
  }
}

// Export singleton
export const indexService = new IndexService();
