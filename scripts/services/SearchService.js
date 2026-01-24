/**
 * Token Replacer FA - Search Service
 * Handles all search operations using TVA's static cache directly for speed
 * @module services/SearchService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, PRIMARY_CATEGORY_TERMS, PARALLEL_BATCH_SIZE, SLOW_MODE_BATCH_SIZE } from '../core/Constants.js';
import {
  loadFuse,
  parseSubtypeTerms,
  hasGenericSubtype,
  getCreatureCacheKey,
  yieldToMain,
  extractPathFromTVAResult,
  extractNameFromTVAResult,
  isExcludedPath
} from '../core/Utils.js';
import { indexService } from './IndexService.js';

/**
 * SearchService class for handling search operations
 * Reads TVA's static cache file directly for maximum performance
 */
export class SearchService {
  constructor() {
    this.searchCache = new Map();
    this.tvaAPI = null;
    this.hasTVA = false;
    // Direct TVA cache access
    this.tvaCacheLoaded = false;
    this.tvaCacheImages = []; // Flat array of all images for fast search
    this.tvaCacheByCategory = {}; // Original category structure
  }

  /**
   * Initialize the search service (basic setup only)
   * Call loadTVACache() separately after TVA has finished caching
   */
  init() {
    this.tvaAPI = game.modules.get('token-variants')?.api;
    this.hasTVA = !!this.tvaAPI;
    console.log(`${MODULE_ID} | SearchService initialized. TVA available: ${this.hasTVA}`);
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

  /**
   * Clear the search cache
   */
  clearCache() {
    this.searchCache.clear();
  }

  /**
   * Check if folder name matches a creature type
   * @param {string} folderName - Folder name to check
   * @param {string} creatureType - Creature type to match
   * @returns {boolean} True if match
   */
  folderMatchesCreatureType(folderName, creatureType) {
    if (!folderName || !creatureType) return false;
    const folderLower = folderName.toLowerCase();
    const typeLower = creatureType.toLowerCase();

    // Direct match
    if (folderLower.includes(typeLower)) return true;

    // Check against mappings
    const mappings = CREATURE_TYPE_MAPPINGS[typeLower];
    if (mappings) {
      return mappings.some(term => folderLower.includes(term.toLowerCase()));
    }

    return false;
  }

  /**
   * Search Token Variant Art for a term
   * Uses direct cache access for speed, falls back to doImageSearch API
   * @param {string} searchTerm - Term to search
   * @returns {Promise<Array>} Search results
   */
  async searchTVA(searchTerm) {
    if (!this.hasTVA || !this.tvaAPI) return [];

    // FAST PATH: Use direct cache access if available
    if (this.tvaCacheLoaded) {
      const directResults = this.searchTVACacheDirect(searchTerm);
      if (directResults.length > 0) {
        return directResults;
      }
      // If direct search found nothing, don't fall back - cache is complete
      return [];
    }

    // SLOW PATH: Fall back to doImageSearch API (only if cache not loaded)
    try {
      const results = [];
      const seenPaths = new Set();

      // Try different search configurations for TVA compatibility
      let searchResults = await this.tvaAPI.doImageSearch(searchTerm, {
        searchType: 'Portrait',
        simpleResults: false
      });

      // If no results, try without options (TVA 6.x compatibility)
      if (!searchResults || (Array.isArray(searchResults) && searchResults.length === 0) ||
          (searchResults instanceof Map && searchResults.size === 0)) {
        searchResults = await this.tvaAPI.doImageSearch(searchTerm);
      }

      // Debug: Log raw results for first few searches
      if (!this._debugLogged) {
        this._debugLogged = true;
        console.log(`${MODULE_ID} | DEBUG TVA raw results for "${searchTerm}":`, searchResults);
        console.log(`${MODULE_ID} | DEBUG TVA result type:`, typeof searchResults, searchResults?.constructor?.name);
      }

      if (!searchResults) return [];

      // Helper function to process a single item
      const processItem = (item) => {
        const imagePath = extractPathFromTVAResult(item);
        // Skip if no path, already seen, or from excluded folder
        if (!imagePath || seenPaths.has(imagePath) || isExcludedPath(imagePath)) return;

        seenPaths.add(imagePath);
        const name = extractNameFromTVAResult(item, imagePath);
        results.push({
          path: imagePath,
          name: name,
          source: 'tva',
          score: item?.score ?? 0.5
        });
      };

      // Handle different TVA result formats
      if (Array.isArray(searchResults)) {
        // Direct array of results
        for (const item of searchResults) {
          processItem(item);
        }
      } else if (searchResults instanceof Map || (searchResults && typeof searchResults.entries === 'function')) {
        // Map format: key is search term, value is array of results
        for (const [key, data] of searchResults.entries()) {
          if (Array.isArray(data)) {
            // Value is array - iterate over each item
            for (const item of data) {
              processItem(item);
            }
          } else if (data && typeof data === 'object') {
            // Value is single object
            processItem(data);
          } else if (typeof key === 'string' && (key.includes('/') || key.includes('.'))) {
            // Key itself is a path (older TVA format)
            // Skip if already seen or from excluded folder
            if (!seenPaths.has(key) && !isExcludedPath(key)) {
              seenPaths.add(key);
              results.push({
                path: key,
                name: extractNameFromTVAResult(data, key),
                source: 'tva',
                score: 0.5
              });
            }
          }
        }
      } else if (searchResults && typeof searchResults === 'object') {
        // Object with nested paths/images/results property
        const pathsArray = searchResults.paths || searchResults.images || searchResults.results || searchResults.data;
        if (Array.isArray(pathsArray)) {
          for (const item of pathsArray) {
            processItem(item);
          }
        } else {
          // Single object result
          processItem(searchResults);
        }
      }

      return results;
    } catch (error) {
      console.warn(`${MODULE_ID} | TVA search error for "${searchTerm}":`, error);
      return [];
    }
  }

  /**
   * Search local index using fuzzy search
   * @param {string[]} searchTerms - Terms to search
   * @param {Array} index - Local image index
   * @param {string} creatureType - Optional creature type filter
   * @returns {Promise<Array>} Search results
   */
  async searchLocalIndex(searchTerms, index, creatureType = null) {
    if (!index || index.length === 0) return [];

    const Fuse = await loadFuse();
    if (!Fuse) return [];

    const results = [];
    const seenPaths = new Set(); // Use Set for O(1) duplicate check
    const threshold = game.settings.get(MODULE_ID, 'fuzzyThreshold') ?? 0.1;

    const fuseOptions = {
      keys: ['name', 'fileName', 'category'],
      threshold: threshold,
      includeScore: true,
      minMatchCharLength: 2
    };

    const fuse = new Fuse(index, fuseOptions);

    for (const term of searchTerms) {
      const searchResults = fuse.search(term);
      for (const result of searchResults) {
        const item = result.item;
        // Skip if already seen or from excluded folder
        if (seenPaths.has(item.path) || isExcludedPath(item.path)) continue;

        // Optionally filter by creature type
        if (creatureType && item.category) {
          if (!this.folderMatchesCreatureType(item.category, creatureType)) {
            continue;
          }
        }
        seenPaths.add(item.path);
        results.push({
          ...item,
          score: result.score,
          source: 'local'
        });
      }
    }

    return results;
  }

  /**
   * Search by creature type category
   * Uses TVA's doImageSearch API directly
   * @param {string} categoryType - Creature type category
   * @param {Array} localIndex - Local image index
   * @param {string} directSearchTerm - Optional direct search term
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  async searchByCategory(categoryType, localIndex, directSearchTerm = null, progressCallback = null) {
    console.log(`${MODULE_ID} | searchByCategory START - type: ${categoryType}, directSearch: ${directSearchTerm}`);
    const results = [];
    const seenPaths = new Set();

    // Direct search term mode
    if (directSearchTerm) {
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: directSearchTerm, resultsFound: 0 });
      }

      // Search TVA
      if (this.hasTVA) {
        const tvaResults = await this.searchTVA(directSearchTerm);
        for (const result of tvaResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            results.push(result);
          }
        }
      }

      // Search local index
      if (localIndex?.length > 0) {
        const termLower = directSearchTerm.toLowerCase();
        const localMatches = localIndex.filter(img =>
          !isExcludedPath(img.path) && (
            img.name?.toLowerCase().includes(termLower) ||
            img.fileName?.toLowerCase().includes(termLower) ||
            img.category?.toLowerCase().includes(termLower) ||
            img.path?.toLowerCase().includes(termLower)
          )
        );
        for (const match of localMatches) {
          if (!seenPaths.has(match.path)) {
            seenPaths.add(match.path);
            results.push({ ...match, source: 'local' });
          }
        }
      }

      if (progressCallback) {
        progressCallback({ current: 1, total: 1, term: directSearchTerm, resultsFound: results.length });
      }

      console.log(`${MODULE_ID} | Direct search for "${directSearchTerm}" found ${results.length} results`);
      return results;
    }

    // Category-based comprehensive search
    console.log(`${MODULE_ID} | Starting comprehensive search for category: ${categoryType}`);

    // Try FAST mode using pre-built index first
    if (indexService.isBuilt) {
      console.log(`${MODULE_ID} | Using pre-built index (FAST mode)`);
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'index lookup', resultsFound: 0 });
      }

      const indexResults = indexService.searchByCategory(categoryType);
      for (const result of indexResults) {
        // Double-check exclusion filter for safety
        if (!seenPaths.has(result.path) && !isExcludedPath(result.path)) {
          seenPaths.add(result.path);
          results.push({
            ...result,
            source: result.source || 'index'
          });
        }
      }

      if (progressCallback) {
        progressCallback({ current: 1, total: 1, term: 'index lookup', resultsFound: results.length });
      }

      console.log(`${MODULE_ID} | Index search found ${results.length} results (FAST mode)`);
    }
    // FAST PATH: Use TVA direct cache if loaded
    else if (this.tvaCacheLoaded) {
      console.log(`${MODULE_ID} | Using TVA direct cache (FAST mode)`);
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'TVA cache lookup', resultsFound: 0 });
      }

      const tvaCacheResults = this.searchTVACacheByCategory(categoryType);
      for (const result of tvaCacheResults) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push(result);
        }
      }

      if (progressCallback) {
        progressCallback({ current: 1, total: 1, term: 'TVA cache lookup', resultsFound: results.length });
      }

      console.log(`${MODULE_ID} | TVA direct cache found ${results.length} results (FAST mode)`);
    }
    // Fallback to SLOW mode - multiple TVA API calls
    else if (this.hasTVA) {
      const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType?.toLowerCase()];

      if (categoryTerms) {
        console.log(`${MODULE_ID} | Searching ${categoryTerms.length} terms for ${categoryType} (SLOW mode - index not built)`);
        const totalTerms = categoryTerms.length;
        let searchCount = 0;

        // Process in parallel batches for better performance
        for (let i = 0; i < categoryTerms.length; i += SLOW_MODE_BATCH_SIZE) {
          const batch = categoryTerms.slice(i, i + SLOW_MODE_BATCH_SIZE);

          if (progressCallback) {
            progressCallback({
              current: searchCount,
              total: totalTerms,
              term: batch.join(', '),
              resultsFound: results.length
            });
          }

          // Execute batch in parallel
          const batchPromises = batch.map(term => this.searchTVA(term));
          const batchResults = await Promise.allSettled(batchPromises);

          // Process results
          for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value) {
              for (const item of result.value) {
                if (!seenPaths.has(item.path)) {
                  seenPaths.add(item.path);
                  results.push(item);
                }
              }
            }
          }

          searchCount += batch.length;

          if (searchCount % 12 === 0 || searchCount === totalTerms) {
            console.log(`${MODULE_ID} | Search progress: ${searchCount}/${totalTerms} terms, ${results.length} results`);
          }

          // Yield to main thread after each batch for UI responsiveness
          await yieldToMain(50);
        }
      } else {
        // Fallback to primary terms - also parallelized
        const primaryTerms = PRIMARY_CATEGORY_TERMS[categoryType?.toLowerCase()];
        if (primaryTerms) {
          console.log(`${MODULE_ID} | No full mapping, using ${primaryTerms.length} primary terms`);
          const totalTerms = primaryTerms.length;
          let searchCount = 0;

          for (let i = 0; i < primaryTerms.length; i += SLOW_MODE_BATCH_SIZE) {
            const batch = primaryTerms.slice(i, i + SLOW_MODE_BATCH_SIZE);

            if (progressCallback) {
              progressCallback({
                current: searchCount,
                total: totalTerms,
                term: batch.join(', '),
                resultsFound: results.length
              });
            }

            const batchPromises = batch.map(term => this.searchTVA(term));
            const batchResults = await Promise.allSettled(batchPromises);

            for (const result of batchResults) {
              if (result.status === 'fulfilled' && result.value) {
                for (const item of result.value) {
                  if (!seenPaths.has(item.path)) {
                    seenPaths.add(item.path);
                    results.push(item);
                  }
                }
              }
            }

            searchCount += batch.length;
            await yieldToMain(50);
          }
        }
      }
      console.log(`${MODULE_ID} | TVA search complete, total unique results: ${results.length}`);
    }

    // Search local index by category
    if (localIndex?.length > 0) {
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'local index', resultsFound: results.length });
      }

      const categoryMatches = localIndex.filter(img =>
        !isExcludedPath(img.path) &&
        img.category && this.folderMatchesCreatureType(img.category, categoryType)
      );
      for (const match of categoryMatches) {
        if (!seenPaths.has(match.path)) {
          seenPaths.add(match.path);
          results.push({ ...match, source: 'local' });
        }
      }
    }

    console.log(`${MODULE_ID} | searchByCategory END - found ${results.length} results for ${categoryType}`);
    return results;
  }

  /**
   * Search for token art based on creature info
   * @param {Object} creatureInfo - Creature information
   * @param {Array} localIndex - Local image index
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Array>} Search results
   */
  async searchTokenArt(creatureInfo, localIndex, useCache = true) {
    const searchTerms = creatureInfo.searchTerms;
    if (searchTerms.length === 0) return [];

    const cacheKey = getCreatureCacheKey(creatureInfo);
    if (useCache && this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey);
    }

    const priority = game.settings.get(MODULE_ID, 'searchPriority');
    const useTVACache = game.settings.get(MODULE_ID, 'useTVACache');
    const results = [];
    const useTVAForAll = this.hasTVA && useTVACache;

    // Check for specific subtypes
    const isGenericSubtype = hasGenericSubtype(creatureInfo.subtype);
    const subtypeTerms = parseSubtypeTerms(creatureInfo.subtype);
    const hasSpecificSubtypes = subtypeTerms.length > 0 && !isGenericSubtype && creatureInfo.type;

    // Case: Specific subtypes - search each term separately (OR logic)
    if (hasSpecificSubtypes) {
      console.log(`${MODULE_ID} | OR Logic Mode: "${creatureInfo.type}" with subtypes (${subtypeTerms.join(', ')})`);

      const seenPaths = new Set();

      // Try FAST mode using pre-built index
      if (indexService.isBuilt) {
        console.log(`${MODULE_ID} | Using index for subtype search (FAST mode)`);

        // First search for actor name (highest priority - exact matches)
        if (creatureInfo.actorName) {
          const nameResults = indexService.search(creatureInfo.actorName.toLowerCase());
          console.log(`${MODULE_ID} | Index returned ${nameResults.length} results for actor name "${creatureInfo.actorName}"`);
          for (const result of nameResults) {
            // Double-check exclusion filter for safety
            if (!seenPaths.has(result.path) && !isExcludedPath(result.path)) {
              seenPaths.add(result.path);
              results.push({
                ...result,
                score: result.score ?? 0.1, // Higher priority (lower score = better)
                fromName: true
              });
            }
          }
        }

        // Then search for subtypes
        const indexResults = indexService.searchMultiple(subtypeTerms);
        console.log(`${MODULE_ID} | Index returned ${indexResults.length} results for subtypes`);

        for (const result of indexResults) {
          // Double-check exclusion filter for safety
          if (!seenPaths.has(result.path) && !isExcludedPath(result.path)) {
            seenPaths.add(result.path);
            results.push({
              ...result,
              score: result.score ?? 0.3,
              fromSubtype: true
            });
          }
        }
      }
      // FAST PATH: Use TVA direct cache if loaded
      else if (this.tvaCacheLoaded) {
        console.log(`${MODULE_ID} | Using TVA direct cache for subtype search (FAST mode)`);

        // First search for actor name (highest priority)
        if (creatureInfo.actorName) {
          const nameResults = this.searchTVACacheDirect(creatureInfo.actorName);
          console.log(`${MODULE_ID} | TVA direct cache returned ${nameResults.length} results for actor name "${creatureInfo.actorName}"`);

          for (const result of nameResults) {
            if (!seenPaths.has(result.path)) {
              seenPaths.add(result.path);
              results.push({
                ...result,
                score: result.score ?? 0.1,
                fromName: true
              });
            }
          }
        }

        // Then search for all subtypes at once (more efficient)
        const subtypeResults = this.searchTVACacheMultiple(subtypeTerms);
        console.log(`${MODULE_ID} | TVA direct cache returned ${subtypeResults.length} results for subtypes (${subtypeTerms.join(', ')})`);

        for (const result of subtypeResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            results.push({
              ...result,
              score: result.score ?? 0.3,
              fromSubtype: true
            });
          }
        }
      }
      // Fallback to SLOW mode - TVA API calls (only if cache not loaded)
      else if (this.hasTVA) {
        console.log(`${MODULE_ID} | Searching TVA for each subtype separately (SLOW mode - cache not loaded)`);

        // First search for actor name (highest priority)
        if (creatureInfo.actorName) {
          console.log(`${MODULE_ID} | Searching TVA for actor name: "${creatureInfo.actorName}"`);
          const nameResults = await this.searchTVA(creatureInfo.actorName);
          console.log(`${MODULE_ID} | TVA returned ${nameResults.length} results for actor name`);

          for (const result of nameResults) {
            if (!seenPaths.has(result.path)) {
              seenPaths.add(result.path);
              results.push({
                ...result,
                score: result.score ?? 0.1,
                fromName: true
              });
            }
          }
        }

        // Then search for subtypes
        for (const term of subtypeTerms) {
          console.log(`${MODULE_ID} | Searching TVA for subtype: "${term}"`);

          const tvaResults = await this.searchTVA(term);
          console.log(`${MODULE_ID} | TVA returned ${tvaResults.length} results for "${term}"`);

          for (const result of tvaResults) {
            if (!seenPaths.has(result.path)) {
              seenPaths.add(result.path);
              results.push({
                ...result,
                score: result.score ?? 0.3,
                fromSubtype: true,
                matchedTerm: term
              });
            }
          }
        }
      }

      // Also search local index for actor name and subtypes
      if (localIndex?.length > 0) {
        // First search for actor name
        if (creatureInfo.actorName) {
          const actorNameLower = creatureInfo.actorName.toLowerCase();
          const nameMatches = localIndex.filter(img => {
            if (isExcludedPath(img.path)) return false;
            const nameLower = (img.name || '').toLowerCase();
            const pathLower = (img.path || '').toLowerCase();
            return nameLower.includes(actorNameLower) || pathLower.includes(actorNameLower);
          });

          for (const match of nameMatches) {
            if (!seenPaths.has(match.path)) {
              seenPaths.add(match.path);
              results.push({
                ...match,
                source: 'local',
                score: match.score ?? 0.15,
                fromName: true
              });
            }
          }
        }

        // Then search for subtypes
        for (const term of subtypeTerms) {
          const termLower = term.toLowerCase();
          const localMatches = localIndex.filter(img => {
            // Skip excluded paths
            if (isExcludedPath(img.path)) return false;
            const nameLower = (img.name || '').toLowerCase();
            const pathLower = (img.path || '').toLowerCase();
            const categoryLower = (img.category || '').toLowerCase();
            return nameLower.includes(termLower) ||
                   pathLower.includes(termLower) ||
                   categoryLower.includes(termLower);
          });

          for (const match of localMatches) {
            if (!seenPaths.has(match.path)) {
              seenPaths.add(match.path);
              results.push({
                ...match,
                source: 'local',
                score: match.score ?? 0.4,
                fromSubtype: true,
                matchedTerm: term
              });
            }
          }
        }
      }

      console.log(`${MODULE_ID} | Total results after OR search: ${results.length} (matching ${subtypeTerms.join(' OR ')})`);

      this.searchCache.set(cacheKey, results);
      return results;
    }

    // Use Set for O(1) duplicate check
    const seenPaths = new Set();

    // Standard search flow
    if (localIndex?.length > 0 && (priority === 'faNexus' || priority === 'both')) {
      const localResults = await this.searchLocalIndex(searchTerms, localIndex, creatureInfo.type);
      for (const r of localResults) {
        seenPaths.add(r.path);
      }
      results.push(...localResults);
    }

    if (this.hasTVA && (useTVAForAll || priority === 'forgeBazaar' || priority === 'both')) {
      for (const term of searchTerms) {
        const tvaResults = await this.searchTVA(term);
        for (const result of tvaResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            results.push(result);
          }
        }
        if (tvaResults.length >= 5 && term === searchTerms[0]) {
          break;
        }
      }
    }

    // Case: Generic subtype - show all category results
    // searchByCategory already handles both index and local index searches
    if (isGenericSubtype && creatureInfo.type) {
      console.log(`${MODULE_ID} | Generic subtype mode for ${creatureInfo.type}`);
      const categoryResults = await this.searchByCategory(creatureInfo.type, localIndex);

      for (const result of categoryResults) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push({
            ...result,
            score: result.score ?? 0.6,
            fromCategory: true
          });
        }
      }
    }

    // Filter and sort results
    const validResults = results.filter(r => {
      if (!r.path || typeof r.path !== 'string') return false;
      return r.path.includes('/') || r.path.includes('.') || r.path.startsWith('http') || r.path.startsWith('forge://');
    });

    validResults.sort((a, b) => {
      // Priority order: fromName > fromSubtype > fromCategory > other
      const aIsName = a.fromName === true;
      const bIsName = b.fromName === true;
      const aIsSubtype = a.fromSubtype === true;
      const bIsSubtype = b.fromSubtype === true;
      const aIsCategory = a.fromCategory === true;
      const bIsCategory = b.fromCategory === true;

      // Name matches have highest priority
      if (aIsName && !bIsName) return -1;
      if (!aIsName && bIsName) return 1;

      // Subtype matches next
      if (aIsSubtype && !bIsSubtype && !bIsName) return -1;
      if (!aIsSubtype && bIsSubtype && !aIsName) return 1;

      // Category matches last
      if (aIsCategory && bIsCategory) { /* same priority */ }
      else if (!aIsCategory && bIsCategory) return -1;
      else if (aIsCategory && !bIsCategory) return 1;

      // Within same priority, respect source preference
      if (priority === 'faNexus') {
        if (a.source === 'local' && b.source !== 'local') return -1;
        if (a.source !== 'local' && b.source === 'local') return 1;
      } else if (priority === 'forgeBazaar') {
        if (a.source === 'tva' && b.source !== 'tva') return -1;
        if (a.source !== 'tva' && b.source === 'tva') return 1;
      }

      // Finally sort by score (lower is better)
      return (a.score || 0.5) - (b.score || 0.5);
    });

    this.searchCache.set(cacheKey, validResults);
    return validResults;
  }

  /**
   * Perform parallel searches for multiple creature groups
   * @param {Map} groups - Creature groups
   * @param {Array} localIndex - Local image index
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Map>} Search results map
   */
  async parallelSearchCreatures(groups, localIndex, progressCallback = null) {
    const groupArray = Array.from(groups.entries());
    const totalGroups = groupArray.length;
    const results = new Map();

    for (let i = 0; i < groupArray.length; i += PARALLEL_BATCH_SIZE) {
      const batch = groupArray.slice(i, i + PARALLEL_BATCH_SIZE);

      if (progressCallback) {
        const completed = Math.min(i, groupArray.length);
        progressCallback({
          type: 'batch',
          completed: completed,
          total: totalGroups,
          currentBatch: batch.map(([key, group]) => group.creatureInfo.actorName)
        });
      }

      const batchPromises = batch.map(async ([key, group]) => {
        const searchResults = await this.searchTokenArt(group.creatureInfo, localIndex, true);
        return { key, searchResults, group };
      });

      const batchResults = await Promise.all(batchPromises);

      for (const { key, searchResults, group } of batchResults) {
        results.set(key, {
          matches: searchResults,
          tokens: group.tokens,
          creatureInfo: group.creatureInfo
        });
      }
    }

    return results;
  }
}

// Export singleton instance
export const searchService = new SearchService();
