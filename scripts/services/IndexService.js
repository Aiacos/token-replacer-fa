/**
 * Token Replacer FA - Index Service
 * Pre-builds keyword index from TVA cache for O(1) searches
 * Features: Persistent localStorage cache, direct TVA cache access, parallel fetching
 * @module services/IndexService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS } from '../core/Constants.js';
import { extractPathFromTVAResult, extractNameFromTVAResult } from '../core/Utils.js';

const CACHE_KEY = 'token-replacer-fa-index-cache';
const CACHE_VERSION = 2; // Increment when index structure changes
const BATCH_SIZE = 25; // Parallel API calls per batch

/**
 * IndexService - Builds and maintains a keyword index from TVA's cached images
 * Provides O(1) lookups instead of multiple API calls
 */
class IndexService {
  constructor() {
    this.images = [];               // Flat array of all images {path, name, keywords}
    this.keywordIndex = new Map();  // keyword (lowercase) → Set of image indices
    this.pathIndex = new Map();     // path → image index (for deduplication)
    this.isBuilt = false;
    this.buildPromise = null;
  }

  /**
   * Try to load index from localStorage cache
   * @returns {boolean} True if cache was loaded successfully
   */
  loadFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return false;

      const data = JSON.parse(cached);

      // Check cache version
      if (data.version !== CACHE_VERSION) {
        console.log(`${MODULE_ID} | Cache version mismatch, rebuilding`);
        localStorage.removeItem(CACHE_KEY);
        return false;
      }

      // Check cache age (max 24 hours)
      const age = Date.now() - (data.timestamp || 0);
      if (age > 24 * 60 * 60 * 1000) {
        console.log(`${MODULE_ID} | Cache expired, rebuilding`);
        localStorage.removeItem(CACHE_KEY);
        return false;
      }

      // Restore data
      this.images = data.images || [];

      // Rebuild indexes from images
      for (let i = 0; i < this.images.length; i++) {
        const img = this.images[i];
        this.pathIndex.set(img.path, i);

        for (const keyword of (img.keywords || [])) {
          if (!this.keywordIndex.has(keyword)) {
            this.keywordIndex.set(keyword, new Set());
          }
          this.keywordIndex.get(keyword).add(i);
        }
      }

      console.log(`${MODULE_ID} | Loaded ${this.images.length} images from cache`);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to load cache:`, error);
      localStorage.removeItem(CACHE_KEY);
      return false;
    }
  }

  /**
   * Save index to localStorage cache
   */
  saveToCache() {
    try {
      const data = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        images: this.images
      };

      const json = JSON.stringify(data);

      // Check size (localStorage limit is ~5MB)
      if (json.length > 4 * 1024 * 1024) {
        console.warn(`${MODULE_ID} | Index too large for cache (${(json.length / 1024 / 1024).toFixed(1)}MB)`);
        return false;
      }

      localStorage.setItem(CACHE_KEY, json);
      console.log(`${MODULE_ID} | Saved ${this.images.length} images to cache (${(json.length / 1024).toFixed(0)}KB)`);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to save cache:`, error);
      return false;
    }
  }

  /**
   * Get TVA's internal cached images using multiple access methods
   * @returns {Array|Map|null} Cached images or null
   */
  getTVACachedImages() {
    try {
      const tvaModule = game.modules.get('token-variants');
      if (!tvaModule?.active) return null;

      // Method 1: TVA API direct cache access
      const tvaAPI = tvaModule.api;
      if (tvaAPI) {
        // Try various cache access patterns
        const cacheLocations = [
          () => tvaAPI.cache,
          () => tvaAPI.getCache?.(),
          () => tvaAPI.cachedImages,
          () => tvaAPI.CACHED_IMAGES,
          () => tvaAPI.imageCache,
          () => tvaAPI.getAllCachedImages?.(),
        ];

        for (const getCacheFn of cacheLocations) {
          try {
            const cache = getCacheFn();
            if (cache && (Array.isArray(cache) || cache instanceof Map || (typeof cache === 'object' && Object.keys(cache).length > 0))) {
              console.log(`${MODULE_ID} | Found TVA cache via API`);
              return cache;
            }
          } catch (e) { /* continue */ }
        }
      }

      // Method 2: Check window/globalThis for TVA internals
      const globalLocations = [
        () => window.TVA_CACHED_IMAGES,
        () => globalThis.TokenVariants?.cachedImages,
        () => globalThis.TokenVariants?.cache,
        () => window.TokenVariants?.cachedImages,
      ];

      for (const getGlobalFn of globalLocations) {
        try {
          const cache = getGlobalFn();
          if (cache && (Array.isArray(cache) || cache instanceof Map || (typeof cache === 'object' && Object.keys(cache).length > 0))) {
            console.log(`${MODULE_ID} | Found TVA cache via global`);
            return cache;
          }
        } catch (e) { /* continue */ }
      }

      console.log(`${MODULE_ID} | Could not access TVA internal cache`);
      return null;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error accessing TVA cache:`, error);
      return null;
    }
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
   * @returns {number} Number of items processed
   */
  processTVACache(cacheData) {
    if (!cacheData) return 0;

    let processedCount = 0;

    const processItem = (item) => {
      const path = extractPathFromTVAResult(item);
      if (path) {
        const name = extractNameFromTVAResult(item, path);
        this.addImage(path, name);
        processedCount++;
      }
    };

    // Handle Map format
    if (cacheData instanceof Map || (cacheData && typeof cacheData.entries === 'function')) {
      for (const [key, value] of cacheData.entries()) {
        if (Array.isArray(value)) {
          value.forEach(processItem);
        } else if (value && typeof value === 'object') {
          processItem(value);
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
      cacheData.forEach(processItem);
    }
    // Handle Object format
    else if (typeof cacheData === 'object') {
      for (const key of Object.keys(cacheData)) {
        const value = cacheData[key];
        if (Array.isArray(value)) {
          value.forEach(processItem);
        } else if (typeof value === 'string' && (value.includes('/') || value.startsWith('http'))) {
          this.addImage(value, key);
          processedCount++;
        }
      }
    }

    return processedCount;
  }

  /**
   * Build index by fetching images via TVA API for common search terms
   * Uses parallel fetching with increased batch size
   * @param {Object} tvaAPI - TVA API object
   */
  async buildFromAPI(tvaAPI) {
    if (!tvaAPI?.doImageSearch) return;

    console.log(`${MODULE_ID} | Building index from TVA API (parallel fetch, batch size: ${BATCH_SIZE})`);

    // Get unique terms from all creature type mappings
    const allTerms = new Set();
    for (const terms of Object.values(CREATURE_TYPE_MAPPINGS)) {
      terms.forEach(t => allTerms.add(t));
    }
    Object.keys(CREATURE_TYPE_MAPPINGS).forEach(cat => allTerms.add(cat));

    const termsArray = Array.from(allTerms);
    const totalTerms = termsArray.length;
    console.log(`${MODULE_ID} | Fetching ${totalTerms} unique terms from TVA`);

    const startTime = performance.now();

    for (let i = 0; i < termsArray.length; i += BATCH_SIZE) {
      const batch = termsArray.slice(i, i + BATCH_SIZE);

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

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status !== 'fulfilled' || !result.value.results) continue;
        const { results } = result.value;

        // Process results
        if (Array.isArray(results)) {
          for (const item of results) {
            const path = extractPathFromTVAResult(item);
            if (path) {
              this.addImage(path, extractNameFromTVAResult(item, path));
            }
          }
        } else if (results instanceof Map || (results && typeof results.entries === 'function')) {
          for (const [, data] of results.entries()) {
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
              const path = extractPathFromTVAResult(item);
              if (path) {
                this.addImage(path, extractNameFromTVAResult(item, path));
              }
            }
          }
        } else if (results && typeof results === 'object') {
          const arr = results.paths || results.images || results.results || results.data;
          const items = Array.isArray(arr) ? arr : [results];
          for (const item of items) {
            const path = extractPathFromTVAResult(item);
            if (path) {
              this.addImage(path, extractNameFromTVAResult(item, path));
            }
          }
        }
      }

      // Progress update
      const progress = Math.min(i + BATCH_SIZE, totalTerms);
      if (progress % 50 === 0 || progress === totalTerms) {
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`${MODULE_ID} | Index build: ${progress}/${totalTerms} terms, ${this.images.length} images (${elapsed}s)`);
      }

      // Yield to main thread
      await new Promise(r => setTimeout(r, 5));
    }

    const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`${MODULE_ID} | API fetch complete: ${this.images.length} images in ${totalTime}s`);
  }

  /**
   * Build the index from localStorage cache, TVA cache, or API
   * @returns {Promise<boolean>} True if index was built successfully
   */
  async build() {
    if (this.isBuilt) return true;
    if (this.buildPromise) return this.buildPromise;

    this.buildPromise = (async () => {
      const startTime = performance.now();
      console.log(`${MODULE_ID} | Starting index build...`);

      // Step 1: Try localStorage cache first (fastest)
      if (this.loadFromCache()) {
        this.isBuilt = true;
        const elapsed = (performance.now() - startTime).toFixed(0);
        console.log(`${MODULE_ID} | Index loaded from cache in ${elapsed}ms`);
        return true;
      }

      // Step 2: Try direct TVA cache access
      const tvaCache = this.getTVACachedImages();
      if (tvaCache) {
        const processed = this.processTVACache(tvaCache);
        if (processed > 100) {
          console.log(`${MODULE_ID} | Processed ${processed} items from TVA cache`);
        }
      }

      // Step 3: If not enough images, fetch via API
      if (this.images.length < 500) {
        const tvaAPI = game.modules.get('token-variants')?.api;
        if (tvaAPI) {
          await this.buildFromAPI(tvaAPI);
        }
      }

      // Step 4: Save to localStorage for next session
      if (this.images.length > 0) {
        this.saveToCache();
      }

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      console.log(`${MODULE_ID} | Index built: ${this.images.length} images, ${this.keywordIndex.size} keywords in ${elapsed}s`);

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

    // Partial/contains match
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
      return this.search(category);
    }

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
   * Clear the index and cache
   */
  clear() {
    this.images = [];
    this.keywordIndex.clear();
    this.pathIndex.clear();
    this.isBuilt = false;
    this.buildPromise = null;
    localStorage.removeItem(CACHE_KEY);
    console.log(`${MODULE_ID} | Index cleared`);
  }
}

// Export singleton
export const indexService = new IndexService();
