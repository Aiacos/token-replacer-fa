/**
 * Token Replacer FA - TVA Cache Service
 * Manages TVA (Token Variant Art) cache loading and direct cache access
 * @module services/TVACacheService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS } from '../core/Constants.js';
import { isExcludedPath } from '../core/Utils.js';

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
   */
  async loadTVACache(maxWaitMs = 30000) {
    if (!this.hasTVA || !this.tvaAPI) {
      console.log(`${MODULE_ID} | TVA not available, skipping cache load`);
      return false;
    }

    // Wait for TVA to finish caching if it's in progress
    const isCaching = this.tvaAPI.isCaching;
    if (typeof isCaching === 'function') {
      const startWait = Date.now();
      while (isCaching() && (Date.now() - startWait) < maxWaitMs) {
        console.log(`${MODULE_ID} | Waiting for TVA to finish caching...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (isCaching()) {
        console.warn(`${MODULE_ID} | TVA still caching after ${maxWaitMs}ms, proceeding anyway`);
      } else {
        console.log(`${MODULE_ID} | TVA caching complete, loading cache directly`);
      }
    }

    return await this._loadTVACacheFromFile();
  }

  /**
   * Internal: Load TVA's static cache file directly for fast access
   * This bypasses doImageSearch and Fuse.js for maximum performance
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async _loadTVACacheFromFile() {
    if (this.tvaCacheLoaded) {
      console.log(`${MODULE_ID} | TVA cache already loaded`);
      return true;
    }

    try {
      const tvaConfig = this.tvaAPI?.TVA_CONFIG;
      if (!tvaConfig) {
        console.warn(`${MODULE_ID} | TVA_CONFIG not accessible`);
        return false;
      }

      // Check if static cache is enabled
      if (!tvaConfig.staticCache) {
        console.warn(`${MODULE_ID} | TVA static cache is disabled in settings`);
        return false;
      }

      const staticCacheFile = tvaConfig.staticCacheFile;
      if (!staticCacheFile) {
        console.warn(`${MODULE_ID} | No static cache file configured in TVA`);
        return false;
      }

      console.log(`${MODULE_ID} | Loading TVA cache directly from: ${staticCacheFile}`);

      const response = await fetch(staticCacheFile);
      if (!response.ok) {
        console.warn(`${MODULE_ID} | Failed to load TVA cache file: ${response.status}`);
        return false;
      }

      const json = await response.json();
      this.tvaCacheByCategory = {};
      this.tvaCacheImages = [];

      // Parse the cache file (same logic as TVA's _readCacheFromFile)
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
        }
      }

      this.tvaCacheLoaded = true;
      console.log(`${MODULE_ID} | TVA cache loaded directly: ${this.tvaCacheImages.length} images in ${Object.keys(this.tvaCacheByCategory).length} categories`);
      return true;

    } catch (error) {
      console.warn(`${MODULE_ID} | Error loading TVA cache directly:`, error);
      return false;
    }
  }

  /**
   * Force reload of TVA cache (use after TVA cache refresh)
   * @returns {Promise<boolean>} True if reloaded successfully
   */
  async reloadTVACache() {
    this.tvaCacheLoaded = false;
    this.tvaCacheImages = [];
    this.tvaCacheByCategory = {};
    return await this.loadTVACache();
  }

  /**
   * Search TVA cache directly using simple string matching (FAST)
   * @param {string} searchTerm - Term to search
   * @returns {Array} Matching images
   */
  searchTVACacheDirect(searchTerm) {
    if (!this.tvaCacheLoaded || !searchTerm) return [];

    const termLower = searchTerm.toLowerCase();
    const results = [];

    for (const img of this.tvaCacheImages) {
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

    return results;
  }

  /**
   * Search TVA cache by category (FAST)
   * Only matches on image name and meaningful path segments, not TVA folder category
   * @param {string} categoryType - Creature type category
   * @returns {Array} Matching images
   */
  searchTVACacheByCategory(categoryType) {
    if (!this.tvaCacheLoaded || !categoryType) return [];

    const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType.toLowerCase()] || [];
    const results = [];
    const seenPaths = new Set();

    for (const img of this.tvaCacheImages) {
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

    return results;
  }

  /**
   * Search TVA cache for multiple terms (OR logic) - FAST
   * @param {string[]} searchTerms - Terms to search (any match)
   * @returns {Array} Matching images
   */
  searchTVACacheMultiple(searchTerms) {
    if (!this.tvaCacheLoaded || !searchTerms || searchTerms.length === 0) return [];

    const termsLower = searchTerms.map(t => t.toLowerCase());
    const results = [];
    const seenPaths = new Set();

    for (const img of this.tvaCacheImages) {
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
    return {
      loaded: this.tvaCacheLoaded,
      totalImages: this.tvaCacheImages.length,
      categories: Object.keys(this.tvaCacheByCategory).length
    };
  }
}

// Export singleton instance
export const tvaCacheService = new TVACacheService();
