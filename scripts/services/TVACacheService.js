/**
 * Token Replacer FA - TVA Cache Service
 * Manages TVA (Token Variant Art) cache loading and direct cache access
 * @module services/TVACacheService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS } from '../core/Constants.js';
import { isExcludedPath, clearExcludedPathCache, yieldToMain, createModuleError, createDebugLogger } from '../core/Utils.js';
import { storageService } from './StorageService.js';

const TVA_CACHE_KEY = 'tva-cache-v1';

/**
 * TVACacheService - Direct access to TVA's static cache for maximum performance
 * Loads TVA cache file directly and provides fast search methods
 */
export class TVACacheService {
  constructor() {
    this.tvaAPI = null;
    this.hasTVA = false;
    // Direct TVA cache access
    this.tvaCacheLoaded = false;
    this.tvaCacheImages = []; // Flat array of all images for fast search
    this.tvaCacheByCategory = {}; // Original category structure
    this._loadPromise = null; // Promise deduplication for concurrent loads
    // Shared utilities
    this._createError = createModuleError;
    this._debugLog = createDebugLogger('TVACacheService');
  }

  /**
   * Initialize the TVA cache service (basic setup only)
   * Call loadTVACache() separately after TVA has finished caching
   */
  init() {
    this.tvaAPI = game.modules.get('token-variants')?.api;
    this.hasTVA = !!this.tvaAPI;
    console.log(`${MODULE_ID} | TVACacheService initialized. TVA available: ${this.hasTVA}`);
  }

  /**
   * Wait for TVA to finish caching, then load the cache directly
   * This should be called AFTER any TVA cache refresh operations
   * @param {number} maxWaitMs - Maximum time to wait for TVA caching (default 30s)
   * @returns {Promise<boolean>} True if cache loaded successfully
   * @throws {Object} Structured error if TVA not available or cache load fails
   */
  async loadTVACache(maxWaitMs = 30000) {
    // Fast path: already loaded
    if (this.tvaCacheLoaded) return true;

    // Promise deduplication: join in-progress load
    if (this._loadPromise) {
      this._debugLog('Cache load already in progress, joining existing promise');
      return this._loadPromise;
    }

    if (!this.hasTVA || !this.tvaAPI) {
      this._debugLog('TVA not available, cannot load cache');
      throw this._createError(
        'tva_missing',
        'Token Variant Art module is not installed or enabled',
        ['install_tva', 'check_console']
      );
    }

    // Wait for TVA to finish caching if it's in progress
    const isCaching = this.tvaAPI.isCaching;
    if (typeof isCaching === 'function') {
      const startWait = Date.now();
      while (isCaching() && (Date.now() - startWait) < maxWaitMs) {
        this._debugLog(`Waiting for TVA to finish caching... (${Date.now() - startWait}ms elapsed)`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (isCaching()) {
        this._debugLog(`TVA still caching after ${maxWaitMs}ms, proceeding anyway`);
        // Throw error instead of proceeding - cache likely not ready
        throw this._createError(
          'tva_still_caching',
          `Token Variant Art still caching after ${maxWaitMs}ms timeout`,
          ['wait_for_cache', 'reload_module']
        );
      } else {
        this._debugLog('TVA caching complete, loading cache directly');
      }
    }

    this._loadPromise = this._loadTVACacheFromFile().finally(() => { this._loadPromise = null; });
    return this._loadPromise;
  }

  /**
   * Internal: Load TVA's static cache file directly for fast access
   * This bypasses doImageSearch and Fuse.js for maximum performance
   * @returns {Promise<boolean>} True if loaded successfully
   * @throws {Object} Structured error if cache cannot be loaded
   */
  async _loadTVACacheFromFile() {
    if (this.tvaCacheLoaded) {
      this._debugLog('TVA cache already loaded, skipping');
      return true;
    }

    try {
      const tvaConfig = this.tvaAPI?.TVA_CONFIG;
      if (!tvaConfig) {
        this._debugLog('TVA_CONFIG not accessible');
        throw this._createError(
          'cache_load_failed',
          'TVA_CONFIG not accessible - TVA API may not be fully initialized',
          ['reload_module', 'check_console']
        );
      }

      // Check if static cache is enabled
      if (!tvaConfig.staticCache) {
        this._debugLog('TVA static cache is disabled in settings');
        throw this._createError(
          'tva_cache_disabled',
          'TVA static cache is disabled in Token Variant Art settings',
          ['enable_static_cache', 'rebuild_cache']
        );
      }

      const staticCacheFile = tvaConfig.staticCacheFile;
      if (!staticCacheFile) {
        this._debugLog('No static cache file configured in TVA');
        throw this._createError(
          'cache_load_failed',
          'No static cache file path configured in Token Variant Art',
          ['rebuild_cache', 'enable_static_cache']
        );
      }

      // Try restoring from IndexedDB first (skips fetch + parse entirely)
      const cached = await this._tryRestoreFromIndexedDB(staticCacheFile);
      if (cached) {
        this.tvaCacheByCategory = cached.tvaCacheByCategory;
        this.tvaCacheImages = cached.tvaCacheImages;
        this.tvaCacheLoaded = true;
        const categories = Object.keys(this.tvaCacheByCategory).length;
        this._debugLog(`TVA cache restored from IndexedDB: ${this.tvaCacheImages.length} images in ${categories} categories`);
        console.log(`${MODULE_ID} | TVA cache restored from IndexedDB: ${this.tvaCacheImages.length} images in ${categories} categories`);
        return true;
      }

      // IndexedDB miss — full fetch + parse
      this._debugLog(`Loading TVA cache from file: ${staticCacheFile}`);

      const response = await fetch(staticCacheFile);
      if (!response.ok) {
        this._debugLog(`Failed to load TVA cache file: HTTP ${response.status}`);
        throw this._createError(
          'network_error',
          `Failed to fetch TVA cache file: HTTP ${response.status} ${response.statusText}`,
          ['check_network', 'rebuild_cache', 'check_file_access']
        );
      }

      // Capture headers for IndexedDB invalidation metadata
      const lastModified = response.headers.get('Last-Modified') || '';
      const contentLength = parseInt(response.headers.get('Content-Length') || '0');

      let json;
      try {
        json = await response.json();
      } catch (parseError) {
        this._debugLog('Failed to parse TVA cache JSON:', parseError);
        throw this._createError(
          'cache_load_failed',
          `Invalid JSON in TVA cache file: ${parseError.message}`,
          ['rebuild_cache', 'check_console']
        );
      }

      // Validate cache structure
      if (!json || typeof json !== 'object') {
        this._debugLog('TVA cache file contains invalid data structure');
        throw this._createError(
          'cache_load_failed',
          'TVA cache file contains invalid data structure (not an object)',
          ['rebuild_cache']
        );
      }

      this.tvaCacheByCategory = {};
      this.tvaCacheImages = [];

      // Parse the cache file (same logic as TVA's _readCacheFromFile)
      // Yields every 5000 images to prevent main thread freeze with large caches
      let parseCount = 0;
      for (const category in json) {
        this.tvaCacheByCategory[category] = [];

        for (const img of json[category]) {
          let imageObj;

          if (Array.isArray(img)) {
            if (img.length === 3) {
              imageObj = { path: img[0], name: img[1], tags: img[2], category };
            } else {
              imageObj = { path: img[0], name: img[1], category };
            }
          } else {
            // Just a path string - extract name from filename
            const fileName = img.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
            imageObj = { path: img, name: fileName, category };
          }

          this.tvaCacheByCategory[category].push(imageObj);
          this.tvaCacheImages.push(imageObj);
          if (++parseCount % 5000 === 0) await yieldToMain(0);
        }
      }

      // Check if cache is empty
      if (this.tvaCacheImages.length === 0) {
        this._debugLog('TVA cache loaded but contains no images');
        throw this._createError(
          'tva_cache_empty',
          'TVA cache file loaded successfully but contains no images',
          ['rebuild_cache', 'check_paths']
        );
      }

      this.tvaCacheLoaded = true;
      const categories = Object.keys(this.tvaCacheByCategory).length;
      this._debugLog(`TVA cache parsed from file: ${this.tvaCacheImages.length} images in ${categories} categories`);
      console.log(`${MODULE_ID} | TVA cache parsed from file: ${this.tvaCacheImages.length} images in ${categories} categories`);

      // Save to IndexedDB for next startup (fire-and-forget)
      this._persistToIndexedDB(staticCacheFile, lastModified, contentLength);

      return true;

    } catch (error) {
      // If it's already a structured error, re-throw it
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      // Otherwise, wrap unexpected errors
      this._debugLog('Unexpected error loading TVA cache:', error);
      throw this._createError(
        'unknown',
        `Unexpected error loading TVA cache: ${error.message || String(error)}`,
        ['check_console', 'reload_module', 'contact_support']
      );
    }
  }

  /**
   * Try to restore TVA cache from IndexedDB
   * Validates freshness by comparing Content-Length with a HEAD request
   * @param {string} cacheFilePath - TVA cache file path
   * @returns {Promise<Object|null>} Cached data or null if miss/stale
   * @private
   */
  async _tryRestoreFromIndexedDB(cacheFilePath) {
    try {
      const cached = await storageService.load(TVA_CACHE_KEY);
      if (!cached?.tvaCacheImages?.length || !cached?.tvaCacheByCategory) {
        this._debugLog('No valid TVA cache in IndexedDB');
        return null;
      }

      // Verify same cache file path
      if (cached.cacheFilePath !== cacheFilePath) {
        this._debugLog('IndexedDB cache is for a different file, invalidating');
        return null;
      }

      // Check freshness: HEAD request to compare Content-Length
      try {
        const headResponse = await fetch(cacheFilePath, { method: 'HEAD' });
        if (headResponse.ok) {
          const serverLength = parseInt(headResponse.headers.get('Content-Length') || '0');
          const serverModified = headResponse.headers.get('Last-Modified') || '';

          // If server provides Last-Modified and it differs → stale
          if (serverModified && cached.lastModified && serverModified !== cached.lastModified) {
            this._debugLog(`Last-Modified changed: "${cached.lastModified}" → "${serverModified}"`);
            return null;
          }

          // If server provides Content-Length and it differs → stale
          if (serverLength > 0 && cached.contentLength > 0 && serverLength !== cached.contentLength) {
            this._debugLog(`Content-Length changed: ${cached.contentLength} → ${serverLength}`);
            return null;
          }
        }
        // If HEAD fails (e.g., CORS), use cached data anyway
      } catch (headError) {
        this._debugLog('HEAD request failed, using cached data:', headError.message);
      }

      this._debugLog(`IndexedDB cache hit: ${cached.tvaCacheImages.length} images`);
      return cached;
    } catch (error) {
      this._debugLog('Error restoring from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Persist parsed TVA cache to IndexedDB for fast restore on next startup
   * Fire-and-forget — does not block the caller
   * @param {string} cacheFilePath - TVA cache file path
   * @param {string} lastModified - Last-Modified response header
   * @param {number} contentLength - Content-Length response header
   * @private
   */
  _persistToIndexedDB(cacheFilePath, lastModified, contentLength) {
    const data = {
      tvaCacheImages: this.tvaCacheImages,
      tvaCacheByCategory: this.tvaCacheByCategory,
      imageCount: this.tvaCacheImages.length,
      cacheFilePath,
      lastModified,
      contentLength,
      timestamp: Date.now()
    };

    storageService.save(TVA_CACHE_KEY, data).then(success => {
      if (success) {
        this._debugLog(`TVA cache persisted to IndexedDB: ${data.imageCount} images`);
      } else {
        this._debugLog('Failed to persist TVA cache to IndexedDB');
      }
    }).catch(error => {
      this._debugLog('Error persisting TVA cache to IndexedDB:', error);
    });
  }

  /**
   * Force reload of TVA cache (use after TVA cache refresh)
   * @returns {Promise<boolean>} True if reloaded successfully
   * @throws {Object} Structured error if reload fails
   */
  async reloadTVACache() {
    this._debugLog('Reloading TVA cache...');
    this.tvaCacheLoaded = false;
    this.tvaCacheImages = [];
    this.tvaCacheByCategory = {};
    clearExcludedPathCache();
    // Clear IndexedDB cache to force fresh fetch
    await storageService.remove(TVA_CACHE_KEY).catch(() => {});

    try {
      const result = await this.loadTVACache();
      this._debugLog('TVA cache reloaded successfully');
      return result;
    } catch (error) {
      this._debugLog('Failed to reload TVA cache:', error);
      throw error;
    }
  }

  /**
   * Search TVA cache directly using simple string matching (FAST)
   * @param {string} searchTerm - Term to search
   * @returns {Array} Matching images
   */
  async searchTVACacheDirect(searchTerm) {
    if (!this.tvaCacheLoaded) {
      this._debugLog('Cannot search: TVA cache not loaded');
      return [];
    }

    if (!searchTerm) {
      this._debugLog('Cannot search: empty search term');
      return [];
    }

    this._debugLog(`Searching TVA cache for: "${searchTerm}"`);
    const startTime = Date.now();

    const termLower = searchTerm.toLowerCase();
    const results = [];
    let count = 0;

    for (const img of this.tvaCacheImages) {
      if (++count % 5000 === 0) await yieldToMain(0);

      // Skip excluded paths
      if (isExcludedPath(img.path)) continue;

      // Simple string matching on name and path
      const nameLower = (img.name || '').toLowerCase();
      const pathLower = (img.path || '').toLowerCase();

      if (nameLower.includes(termLower) || pathLower.includes(termLower)) {
        results.push({
          path: img.path,
          name: img.name,
          category: img.category,
          tags: img.tags,
          source: 'tva-direct',
          score: nameLower === termLower ? 0 : nameLower.startsWith(termLower) ? 0.1 : 0.3
        });
      }
    }

    // Sort by score (exact matches first)
    results.sort((a, b) => a.score - b.score);

    const elapsed = Date.now() - startTime;
    this._debugLog(`Search completed in ${elapsed}ms: ${results.length} matches found`);

    return results;
  }

  /**
   * Search TVA cache by category (FAST)
   * Only matches on image name and meaningful path segments, not TVA folder category
   * @param {string} categoryType - Creature type category
   * @returns {Array} Matching images
   */
  async searchTVACacheByCategory(categoryType) {
    if (!this.tvaCacheLoaded) {
      this._debugLog('Cannot search by category: TVA cache not loaded');
      return [];
    }

    if (!categoryType) {
      this._debugLog('Cannot search by category: empty category type');
      return [];
    }

    const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType.toLowerCase()] || [];
    if (categoryTerms.length === 0) {
      this._debugLog(`No category mapping found for: "${categoryType}"`);
      return [];
    }

    this._debugLog(`Searching TVA cache by category: "${categoryType}" (${categoryTerms.length} terms)`);
    const startTime = Date.now();

    const results = [];
    const seenPaths = new Set();
    let count = 0;

    for (const img of this.tvaCacheImages) {
      if (++count % 5000 === 0) await yieldToMain(0);

      if (seenPaths.has(img.path)) continue;
      if (isExcludedPath(img.path)) continue;

      const nameLower = (img.name || '').toLowerCase();
      // Extract meaningful path parts (last 2-3 folder names, excluding CDN structure)
      const pathParts = (img.path || '').toLowerCase().split('/');
      const meaningfulPath = pathParts.slice(-4).join('/'); // Last 4 segments

      // Check if matches any category term
      // Note: We intentionally DON'T check img.category (TVA folder name) as it's unreliable
      const matches = categoryTerms.some(term => {
        const termLower = term.toLowerCase();
        return nameLower.includes(termLower) || meaningfulPath.includes(termLower);
      });

      if (matches) {
        seenPaths.add(img.path);
        results.push({
          path: img.path,
          name: img.name,
          category: img.category,
          tags: img.tags,
          source: 'tva-direct',
          score: 0.3
        });
      }
    }

    const elapsed = Date.now() - startTime;
    this._debugLog(`Category search completed in ${elapsed}ms: ${results.length} matches found`);

    return results;
  }

  /**
   * Search TVA cache for multiple terms (OR logic) - FAST
   * @param {string[]} searchTerms - Terms to search (any match)
   * @returns {Array} Matching images
   */
  async searchTVACacheMultiple(searchTerms) {
    if (!this.tvaCacheLoaded) {
      this._debugLog('Cannot search multiple terms: TVA cache not loaded');
      return [];
    }

    if (!searchTerms || searchTerms.length === 0) {
      this._debugLog('Cannot search multiple terms: empty search terms array');
      return [];
    }

    this._debugLog(`Searching TVA cache for ${searchTerms.length} terms: [${searchTerms.join(', ')}]`);
    const startTime = Date.now();

    const termsLower = searchTerms.map(t => t.toLowerCase());
    const results = [];
    const seenPaths = new Set();
    let count = 0;

    for (const img of this.tvaCacheImages) {
      if (++count % 5000 === 0) await yieldToMain(0);

      if (seenPaths.has(img.path)) continue;
      if (isExcludedPath(img.path)) continue;

      const nameLower = (img.name || '').toLowerCase();
      const pathLower = (img.path || '').toLowerCase();

      // Check if matches ANY term (OR logic)
      const matchedTerm = termsLower.find(term =>
        nameLower.includes(term) || pathLower.includes(term)
      );

      if (matchedTerm) {
        seenPaths.add(img.path);
        results.push({
          path: img.path,
          name: img.name,
          category: img.category,
          tags: img.tags,
          source: 'tva-direct',
          score: nameLower === matchedTerm ? 0 : nameLower.startsWith(matchedTerm) ? 0.1 : 0.3,
          matchedTerm
        });
      }
    }

    // Sort by score
    results.sort((a, b) => a.score - b.score);

    const elapsed = Date.now() - startTime;
    this._debugLog(`Multiple term search completed in ${elapsed}ms: ${results.length} matches found`);

    return results;
  }

  /**
   * Check if TVA direct cache is loaded
   * @returns {boolean}
   */
  get isTVACacheLoaded() {
    return this.tvaCacheLoaded;
  }

  /**
   * Get TVA cache statistics
   * @returns {Object}
   */
  getTVACacheStats() {
    const stats = {
      loaded: this.tvaCacheLoaded,
      totalImages: this.tvaCacheImages.length,
      categories: Object.keys(this.tvaCacheByCategory).length
    };

    this._debugLog('Cache stats:', stats);
    return stats;
  }
}

// Export singleton instance
export const tvaCacheService = new TVACacheService();
