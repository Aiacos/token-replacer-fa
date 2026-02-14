/**
 * Token Replacer FA - Index Service
 * Hierarchical JSON index organized by creature category
 * Features: Automatic updates based on configurable frequency
 * @module services/IndexService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS } from '../core/Constants.js';
import { extractPathFromTVAResult, extractNameFromTVAResult, isExcludedPath } from '../core/Utils.js';

const CACHE_KEY = 'token-replacer-fa-index-v3';
const INDEX_VERSION = 13;  // v2.9.0: Enhanced filtering with EXCLUDED_FILENAME_TERMS

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
 *   allPaths: { "path": { name, category, subcategories: [] } }
 * }
 */
export class IndexService {
  constructor() {
    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
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
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {Object} { category, subcategories }
   */
  categorizeImage(path, name) {
    const searchText = `${path} ${name}`.toLowerCase();
    let bestCategory = null;
    let subcategories = [];
    let maxMatches = 0;

    for (const [category, terms] of Object.entries(CREATURE_TYPE_MAPPINGS)) {
      let matches = 0;
      const matchedTerms = [];

      for (const term of terms) {
        if (searchText.includes(term.toLowerCase())) {
          matches++;
          matchedTerms.push(term);
        }
      }

      if (matches > maxMatches) {
        maxMatches = matches;
        bestCategory = category;
        subcategories = matchedTerms;
      }
    }

    return { category: bestCategory, subcategories };
  }

  /**
   * Load index from localStorage
   * @returns {boolean} True if loaded successfully
   */
  loadFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return false;

      const data = JSON.parse(cached);

      // Version check
      if (data.version !== INDEX_VERSION) {
        console.log(`${MODULE_ID} | Index version mismatch, rebuilding`);
        localStorage.removeItem(CACHE_KEY);
        return false;
      }

      this.index = data;
      console.log(`${MODULE_ID} | Loaded index from cache: ${Object.keys(data.allPaths || {}).length} images`);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to load cache:`, error);
      localStorage.removeItem(CACHE_KEY);
      return false;
    }
  }

  /**
   * Save index to localStorage
   * @returns {boolean} True if saved successfully
   */
  saveToCache() {
    try {
      const json = JSON.stringify(this.index);

      // Check size limit (~5MB for localStorage)
      if (json.length > 4.5 * 1024 * 1024) {
        console.warn(`${MODULE_ID} | Index too large for cache (${(json.length / 1024 / 1024).toFixed(1)}MB)`);
        return false;
      }

      localStorage.setItem(CACHE_KEY, json);
      console.log(`${MODULE_ID} | Saved index to cache (${(json.length / 1024).toFixed(0)}KB)`);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to save cache:`, error);
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
      allPaths: {}
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
    // Skip if no path, already indexed, or excluded folder
    if (!path || this.index.allPaths[path] || isExcludedPath(path)) return false;

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
   * If all strategies fail, returns 0 (no images indexed).
   *
   * @param {Function} onProgress - Progress callback
   * @param {Array} tvaCacheImages - Optional pre-loaded TVA cache images from TVACacheService
   * @returns {Promise<number>} Number of images indexed
   */
  async buildFromTVA(onProgress = null, tvaCacheImages = null) {
    const tvaAPI = game.modules.get('token-variants')?.api;
    if (!tvaAPI) {
      console.warn(`${MODULE_ID} | TVA API not available`);
      return 0;
    }

    console.log(`${MODULE_ID} | Building index from TVA cache...`);

    // Try to read TVA cache directly (much faster than doImageSearch)
    let allPaths = [];

    // Method 0 (FASTEST): Use pre-loaded cache passed from TVACacheService
    allPaths = this._tryPreloadedCache(tvaCacheImages);

    // Method 1: Try TVA's cacheImagePaths (direct cache access)
    if (allPaths.length === 0) {
      allPaths = this._tryCacheImagePaths(tvaAPI);
    }

    // Method 2: Try TVA's internal cache via getSearchCache
    if (allPaths.length === 0) {
      allPaths = await this._tryGetSearchCache(tvaAPI);
    }

    // Method 3: Check TVA_CONFIG for cache info
    if (allPaths.length === 0) {
      allPaths = this._tryTVAConfig(tvaAPI);
    }

    // Method 4: Try Foundry game settings for TVA static cache
    if (allPaths.length === 0) {
      allPaths = this._tryGameSettings();
    }

    // Method 5: Access TVA's internal cache structure directly
    if (allPaths.length === 0) {
      allPaths = this._tryInternalCache(tvaAPI);
    }

    // If we found paths in cache, index them directly
    if (allPaths.length > 0) {
      console.log(`${MODULE_ID} | Found ${allPaths.length} paths in TVA cache, indexing...`);
      return this.indexPathsDirectly(allPaths, onProgress);
    }

    // Fallback: Log available TVA API methods to find the cache
    console.log(`${MODULE_ID} | Could not find TVA cache directly. Available API methods:`);
    const apiMethods = Object.keys(tvaAPI).filter(k => typeof tvaAPI[k] === 'function');
    const apiProps = Object.keys(tvaAPI).filter(k => typeof tvaAPI[k] !== 'function');
    console.log(`${MODULE_ID} | Methods:`, apiMethods);
    console.log(`${MODULE_ID} | Properties:`, apiProps);

    // Ultimate fallback: use doImageSearch with a broad search
    console.log(`${MODULE_ID} | Falling back to broad search...`);
    return this.buildFromTVASearch(onProgress);
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
   * Index paths directly without search
   * @param {Array} paths - Array of path strings
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<number>} Number of images indexed
   */
  async indexPathsDirectly(paths, onProgress = null) {
    const totalPaths = paths.length;
    let imagesFound = 0;

    console.log(`${MODULE_ID} | Indexing ${totalPaths} paths directly...`);

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
      }

      // Progress callback
      if (onProgress) {
        const processed = Math.min(i + BATCH_SIZE, totalPaths);
        onProgress(processed, totalPaths, imagesFound);
      }

      // Yield to main thread
      await new Promise(r => setTimeout(r, 10));
    }

    console.log(`${MODULE_ID} | Indexed ${imagesFound} images from ${totalPaths} paths`);
    return imagesFound;
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
   */
  async build(forceRebuild = false, onProgress = null, tvaCacheImages = null) {
    if (this.buildPromise) return this.buildPromise;

    this.buildPromise = (async () => {
      const startTime = performance.now();
      console.log(`${MODULE_ID} | Starting index build...`);

      // Try to load from cache first
      if (!forceRebuild && this.loadFromCache()) {
        // Check if update is needed
        if (!this.needsUpdate()) {
          this.isBuilt = true;
          console.log(`${MODULE_ID} | Index loaded from cache, no update needed`);
          return true;
        }
        console.log(`${MODULE_ID} | Index needs update based on frequency setting`);
      }

      // Create new index
      this.index = this.createEmptyIndex();

      // Build from TVA (pass pre-loaded cache if available)
      await this.buildFromTVA(onProgress, tvaCacheImages);

      // Use actual count from allPaths
      const totalImages = Object.keys(this.index.allPaths).length;

      if (totalImages > 0) {
        this.index.lastUpdate = Date.now();
        this.saveToCache();
        this.isBuilt = true;

        const stats = this.getStats();
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`${MODULE_ID} | Index built: ${totalImages} total images (${stats.categorizedImages} categorized) in ${elapsed}s`);
        return true;
      }

      console.warn(`${MODULE_ID} | Index build returned 0 images`);
      this.isBuilt = false;
      return false;
    })();

    const result = await this.buildPromise;
    this.buildPromise = null;
    return result;
  }

  /**
   * Search by creature category
   * @param {string} category - Creature type (humanoid, beast, etc.)
   * @returns {Array} All images in category
   */
  searchByCategory(category) {
    if (!this.isBuilt || !this.index?.categories) return [];

    const categoryLower = category.toLowerCase();
    const categoryData = this.index.categories[categoryLower];

    if (!categoryData?._all) return [];

    // Return all images in this category
    return categoryData._all.map(item => ({
      path: item.path,
      name: item.name,
      source: 'index',
      category: categoryLower
    }));
  }

  /**
   * Search by subcategory (e.g., "elf" within humanoid)
   * @param {string} category - Main category
   * @param {string} subcategory - Subcategory term
   * @returns {Array} Matching images
   */
  searchBySubcategory(category, subcategory) {
    if (!this.isBuilt || !this.index?.categories) return [];

    const categoryLower = category.toLowerCase();
    const subcatLower = subcategory.toLowerCase();
    const categoryData = this.index.categories[categoryLower];

    if (!categoryData) return [];

    // Direct subcategory match
    if (categoryData[subcatLower]) {
      return categoryData[subcatLower].map(item => ({
        path: item.path,
        name: item.name,
        source: 'index',
        category: categoryLower,
        subcategory: subcatLower
      }));
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

    return results;
  }

  /**
   * Search by term across all categories
   * @param {string} term - Search term
   * @returns {Array} Matching images
   */
  search(term) {
    if (!this.isBuilt || !this.index?.allPaths) return [];

    const termLower = term.toLowerCase();
    const results = [];

    for (const [path, data] of Object.entries(this.index.allPaths)) {
      const searchText = `${path} ${data.name} ${data.subcategories?.join(' ') || ''}`.toLowerCase();
      if (searchText.includes(termLower)) {
        results.push({
          path,
          name: data.name,
          source: 'index',
          category: data.category
        });
      }
    }

    return results;
  }

  /**
   * Search multiple terms (OR logic)
   * @param {string[]} terms - Search terms
   * @returns {Array} Combined results
   */
  searchMultiple(terms) {
    if (!terms?.length) return [];

    const seenPaths = new Set();
    const results = [];

    for (const term of terms) {
      for (const result of this.search(term)) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push(result);
        }
      }
    }

    return results;
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
  clear() {
    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
    localStorage.removeItem(CACHE_KEY);
    console.log(`${MODULE_ID} | Index cleared`);
  }

  /**
   * Force rebuild the index
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<boolean>}
   */
  async forceRebuild(onProgress = null) {
    this.clear();
    return this.build(true, onProgress);
  }
}

// Export singleton
export const indexService = new IndexService();
