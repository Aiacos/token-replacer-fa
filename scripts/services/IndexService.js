/**
 * Token Replacer FA - Index Service
 * Pre-builds keyword index from TVA cache for O(1) searches
 * @module services/IndexService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS } from '../core/Constants.js';
import { extractPathFromTVAResult, extractNameFromTVAResult } from '../core/Utils.js';

/**
 * IndexService - Builds and maintains a keyword index from TVA's cached images
 * Provides O(1) lookups instead of multiple API calls
 */
class IndexService {
  constructor() {
    this.images = [];           // Flat array of all images {path, name, keywords}
    this.keywordIndex = new Map();  // keyword (lowercase) → Set of image indices
    this.pathIndex = new Map();     // path → image index (for deduplication)
    this.isBuilt = false;
    this.buildPromise = null;
  }

  /**
   * Get TVA's internal cached images
   * TVA stores cached images in different locations depending on version
   * @returns {Array|Map|null} Cached images or null
   */
  getTVACachedImages() {
    try {
      const tvaModule = game.modules.get('token-variants');
      if (!tvaModule?.active) return null;

      // Try to access TVA's internal cache
      // Method 1: Check for exported CACHED_IMAGES
      if (window.TVA_CACHED_IMAGES) {
        console.log(`${MODULE_ID} | Found TVA cache via window.TVA_CACHED_IMAGES`);
        return window.TVA_CACHED_IMAGES;
      }

      // Method 2: Check TVA API for cache access
      const tvaAPI = tvaModule.api;
      if (tvaAPI) {
        // Some TVA versions expose getCache or similar
        if (typeof tvaAPI.getCache === 'function') {
          const cache = tvaAPI.getCache();
          if (cache) {
            console.log(`${MODULE_ID} | Found TVA cache via tvaAPI.getCache()`);
            return cache;
          }
        }

        // Check for cached images property
        if (tvaAPI.cachedImages) {
          console.log(`${MODULE_ID} | Found TVA cache via tvaAPI.cachedImages`);
          return tvaAPI.cachedImages;
        }

        if (tvaAPI.CACHED_IMAGES) {
          console.log(`${MODULE_ID} | Found TVA cache via tvaAPI.CACHED_IMAGES`);
          return tvaAPI.CACHED_IMAGES;
        }
      }

      // Method 3: Check globalThis/window for TVA internals
      if (globalThis.TokenVariants?.cachedImages) {
        console.log(`${MODULE_ID} | Found TVA cache via globalThis.TokenVariants.cachedImages`);
        return globalThis.TokenVariants.cachedImages;
      }

      console.log(`${MODULE_ID} | Could not find TVA internal cache, will use API calls`);
      return null;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error accessing TVA cache:`, error);
      return null;
    }
  }

  /**
   * Extract keywords from a path/name for indexing
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {Set<string>} Set of lowercase keywords
   */
  extractKeywords(path, name) {
    const keywords = new Set();

    // Extract from name
    if (name) {
      const nameParts = name.toLowerCase()
        .replace(/[-_\.]/g, ' ')
        .split(/\s+/)
        .filter(p => p.length >= 2);
      nameParts.forEach(p => keywords.add(p));
    }

    // Extract from path (folder names and filename)
    if (path) {
      const pathParts = path.toLowerCase()
        .replace(/\.[^/.]+$/, '')  // Remove extension
        .split(/[\/\\]/)
        .flatMap(segment => segment.replace(/[-_\.]/g, ' ').split(/\s+/))
        .filter(p => p.length >= 2);
      pathParts.forEach(p => keywords.add(p));
    }

    return keywords;
  }

  /**
   * Check if a path is from an excluded folder (assets, props, etc.)
   * @param {string} path - Image path to check
   * @returns {boolean} True if path should be excluded
   */
  isExcludedPath(path) {
    if (!path) return true;
    const pathLower = path.toLowerCase();
    return EXCLUDED_FOLDERS.some(folder => pathLower.includes(folder));
  }

  /**
   * Add an image to the index
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @param {number} score - Optional relevance score
   */
  addImage(path, name, score = 0.5) {
    // Skip if no path, already indexed, or from excluded folder
    if (!path || this.pathIndex.has(path) || this.isExcludedPath(path)) return;

    const index = this.images.length;
    const keywords = this.extractKeywords(path, name);

    this.images.push({
      path,
      name: name || path.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Unknown',
      keywords: Array.from(keywords),
      score
    });

    this.pathIndex.set(path, index);

    // Add to keyword index
    for (const keyword of keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, new Set());
      }
      this.keywordIndex.get(keyword).add(index);
    }
  }

  /**
   * Process TVA cache data in various formats
   * @param {*} cacheData - TVA cache in various formats
   */
  processTVACache(cacheData) {
    if (!cacheData) return;

    let processedCount = 0;

    // Handle Map format
    if (cacheData instanceof Map || (cacheData && typeof cacheData.entries === 'function')) {
      for (const [key, value] of cacheData.entries()) {
        // Value might be array of images
        if (Array.isArray(value)) {
          for (const item of value) {
            const path = extractPathFromTVAResult(item);
            if (path) {
              const name = extractNameFromTVAResult(item, path);
              this.addImage(path, name);
              processedCount++;
            }
          }
        } else if (value && typeof value === 'object') {
          const path = extractPathFromTVAResult(value);
          if (path) {
            const name = extractNameFromTVAResult(value, path);
            this.addImage(path, name);
            processedCount++;
          }
        }
        // Key might be a path itself
        if (typeof key === 'string' && (key.includes('/') || key.startsWith('http') || key.startsWith('forge://'))) {
          this.addImage(key, null);
          processedCount++;
        }
      }
    }
    // Handle Array format
    else if (Array.isArray(cacheData)) {
      for (const item of cacheData) {
        const path = extractPathFromTVAResult(item);
        if (path) {
          const name = extractNameFromTVAResult(item, path);
          this.addImage(path, name);
          processedCount++;
        }
      }
    }
    // Handle Object format
    else if (typeof cacheData === 'object') {
      // Check for nested arrays
      for (const key of Object.keys(cacheData)) {
        const value = cacheData[key];
        if (Array.isArray(value)) {
          for (const item of value) {
            const path = extractPathFromTVAResult(item);
            if (path) {
              const name = extractNameFromTVAResult(item, path);
              this.addImage(path, name);
              processedCount++;
            }
          }
        }
      }
    }

    console.log(`${MODULE_ID} | Processed ${processedCount} items from TVA cache`);
  }

  /**
   * Build index by fetching images via TVA API for common search terms
   * Fallback when direct cache access isn't available
   * @param {Object} tvaAPI - TVA API object
   */
  async buildFromAPI(tvaAPI) {
    if (!tvaAPI?.doImageSearch) return;

    console.log(`${MODULE_ID} | Building index from TVA API (fetching common terms)`);

    // Get unique terms from all creature type mappings
    const allTerms = new Set();
    for (const terms of Object.values(CREATURE_TYPE_MAPPINGS)) {
      terms.forEach(t => allTerms.add(t));
    }

    // Also add the category names themselves
    Object.keys(CREATURE_TYPE_MAPPINGS).forEach(cat => allTerms.add(cat));

    const termsArray = Array.from(allTerms);
    console.log(`${MODULE_ID} | Fetching ${termsArray.length} unique terms from TVA`);

    let fetchedCount = 0;
    const batchSize = 10;

    for (let i = 0; i < termsArray.length; i += batchSize) {
      const batch = termsArray.slice(i, i + batchSize);

      // Fetch batch in parallel
      const batchPromises = batch.map(async (term) => {
        try {
          const results = await tvaAPI.doImageSearch(term, {
            searchType: 'Portrait',
            simpleResults: false
          });
          return { term, results };
        } catch (e) {
          return { term, results: null };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const { term, results } of batchResults) {
        if (!results) continue;

        // Process results in various formats
        const processItems = (items) => {
          if (!items) return;
          if (Array.isArray(items)) {
            for (const item of items) {
              const path = extractPathFromTVAResult(item);
              if (path) {
                const name = extractNameFromTVAResult(item, path);
                this.addImage(path, name);
                fetchedCount++;
              }
            }
          }
        };

        if (Array.isArray(results)) {
          processItems(results);
        } else if (results instanceof Map || (results && typeof results.entries === 'function')) {
          for (const [, data] of results.entries()) {
            processItems(Array.isArray(data) ? data : [data]);
          }
        } else if (results && typeof results === 'object') {
          const arr = results.paths || results.images || results.results || results.data;
          processItems(Array.isArray(arr) ? arr : [results]);
        }
      }

      // Yield to main thread
      if (i % 50 === 0) {
        await new Promise(r => setTimeout(r, 10));
        console.log(`${MODULE_ID} | Index build progress: ${Math.min(i + batchSize, termsArray.length)}/${termsArray.length} terms, ${this.images.length} unique images`);
      }
    }

    console.log(`${MODULE_ID} | Finished API fetch, ${fetchedCount} items processed, ${this.images.length} unique images indexed`);
  }

  /**
   * Build the index from TVA cache or API
   * @returns {Promise<boolean>} True if index was built successfully
   */
  async build() {
    if (this.isBuilt) return true;
    if (this.buildPromise) return this.buildPromise;

    this.buildPromise = (async () => {
      console.log(`${MODULE_ID} | Building image index...`);
      const startTime = performance.now();

      // Try direct cache access first
      const cache = this.getTVACachedImages();
      if (cache) {
        this.processTVACache(cache);
      }

      // If we didn't get enough images, fetch via API
      if (this.images.length < 100) {
        const tvaAPI = game.modules.get('token-variants')?.api;
        if (tvaAPI) {
          await this.buildFromAPI(tvaAPI);
        }
      }

      const elapsed = performance.now() - startTime;
      console.log(`${MODULE_ID} | Index built in ${elapsed.toFixed(0)}ms: ${this.images.length} images, ${this.keywordIndex.size} keywords`);

      this.isBuilt = this.images.length > 0;
      return this.isBuilt;
    })();

    return this.buildPromise;
  }

  /**
   * Search the index for images matching a term
   * Uses contains-matching for flexible results
   * @param {string} searchTerm - Term to search for
   * @returns {Array} Matching images
   */
  search(searchTerm) {
    if (!this.isBuilt || !searchTerm) return [];

    const termLower = searchTerm.toLowerCase().trim();
    if (termLower.length < 2) return [];

    const matchingIndices = new Set();

    // Exact keyword match (O(1))
    if (this.keywordIndex.has(termLower)) {
      for (const idx of this.keywordIndex.get(termLower)) {
        matchingIndices.add(idx);
      }
    }

    // Partial/contains match - check keywords that contain the search term
    for (const [keyword, indices] of this.keywordIndex) {
      if (keyword.includes(termLower) || termLower.includes(keyword)) {
        for (const idx of indices) {
          matchingIndices.add(idx);
        }
      }
    }

    // Convert to results
    const results = [];
    for (const idx of matchingIndices) {
      const img = this.images[idx];
      results.push({
        path: img.path,
        name: img.name,
        score: img.score,
        source: 'index'
      });
    }

    return results;
  }

  /**
   * Search for multiple terms (OR logic)
   * @param {string[]} terms - Terms to search
   * @returns {Array} Combined unique results
   */
  searchMultiple(terms) {
    if (!this.isBuilt || !terms?.length) return [];

    const seenPaths = new Set();
    const results = [];

    for (const term of terms) {
      const termResults = this.search(term);
      for (const result of termResults) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Search by creature category
   * @param {string} category - Creature type category
   * @returns {Array} All images matching the category
   */
  searchByCategory(category) {
    if (!this.isBuilt || !category) return [];

    const categoryLower = category.toLowerCase();
    const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryLower];

    if (!categoryTerms) {
      // Just search the category name itself
      return this.search(category);
    }

    // Search all category terms
    return this.searchMultiple(categoryTerms);
  }

  /**
   * Get index statistics
   * @returns {Object} Stats about the index
   */
  getStats() {
    return {
      isBuilt: this.isBuilt,
      imageCount: this.images.length,
      keywordCount: this.keywordIndex.size,
      uniquePaths: this.pathIndex.size
    };
  }

  /**
   * Clear the index
   */
  clear() {
    this.images = [];
    this.keywordIndex.clear();
    this.pathIndex.clear();
    this.isBuilt = false;
    this.buildPromise = null;
  }
}

// Export singleton
export const indexService = new IndexService();
