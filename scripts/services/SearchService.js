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
import { tvaCacheService } from './TVACacheService.js';
import { searchOrchestrator } from './SearchOrchestrator.js';

/**
 * SearchService class for handling search operations
 * Delegates TVA cache operations to TVACacheService for better modularity
 */
export class SearchService {
  constructor() {
    this.searchCache = new Map();
  }

  /**
   * Initialize the search service (basic setup only)
   * Call loadTVACache() separately after TVA has finished caching
   */
  init() {
    tvaCacheService.init();
    // Set dependencies for SearchOrchestrator to enable delegation
    searchOrchestrator.setDependencies(this, tvaCacheService);
    console.log(`${MODULE_ID} | SearchService initialized (delegates to TVACacheService and SearchOrchestrator)`);
  }

  /**
   * Get TVA API reference
   * @returns {Object} TVA API
   */
  get tvaAPI() {
    return tvaCacheService.tvaAPI;
  }

  /**
   * Check if TVA is available
   * @returns {boolean}
   */
  get hasTVA() {
    return tvaCacheService.hasTVA;
  }

  /**
   * Get TVA cache images array (for backward compatibility)
   * @returns {Array}
   */
  get tvaCacheImages() {
    return tvaCacheService.tvaCacheImages;
  }

  /**
   * Get TVA cache by category (for backward compatibility)
   * @returns {Object}
   */
  get tvaCacheByCategory() {
    return tvaCacheService.tvaCacheByCategory;
  }

  /**
   * Check if TVA cache is loaded (for backward compatibility)
   * @returns {boolean}
   */
  get tvaCacheLoaded() {
    return tvaCacheService.tvaCacheLoaded;
  }

  /**
   * Wait for TVA to finish caching, then load the cache directly
   * This should be called AFTER any TVA cache refresh operations
   * @param {number} maxWaitMs - Maximum time to wait for TVA caching (default 30s)
   * @returns {Promise<boolean>} True if cache loaded successfully
   */
  async loadTVACache(maxWaitMs = 30000) {
    return await tvaCacheService.loadTVACache(maxWaitMs);
  }

  /**
   * Force reload of TVA cache (use after TVA cache refresh)
   * @returns {Promise<boolean>} True if reloaded successfully
   */
  async reloadTVACache() {
    return await tvaCacheService.reloadTVACache();
  }

  /**
   * Search TVA cache directly using simple string matching (FAST)
   * @param {string} searchTerm - Term to search
   * @returns {Array} Matching images
   */
  searchTVACacheDirect(searchTerm) {
    return tvaCacheService.searchTVACacheDirect(searchTerm);
  }

  /**
   * Search TVA cache by category (FAST)
   * Only matches on image name and meaningful path segments, not TVA folder category
   * @param {string} categoryType - Creature type category
   * @returns {Array} Matching images
   */
  searchTVACacheByCategory(categoryType) {
    return tvaCacheService.searchTVACacheByCategory(categoryType);
  }

  /**
   * Search TVA cache for multiple terms (OR logic) - FAST
   * @param {string[]} searchTerms - Terms to search (any match)
   * @returns {Array} Matching images
   */
  searchTVACacheMultiple(searchTerms) {
    return tvaCacheService.searchTVACacheMultiple(searchTerms);
  }

  /**
   * Check if TVA direct cache is loaded
   * @returns {boolean}
   */
  get isTVACacheLoaded() {
    return tvaCacheService.isTVACacheLoaded;
  }

  /**
   * Get TVA cache statistics
   * @returns {Object}
   */
  getTVACacheStats() {
    return tvaCacheService.getTVACacheStats();
  }

  /**
   * Clear the search cache
   * Also clears searchOrchestrator's cache
   */
  clearCache() {
    this.searchCache.clear();
    searchOrchestrator.clearCache();
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
  /**
   * Search for token art based on creature info
   * Delegates to SearchOrchestrator for complex search logic
   * @param {Object} creatureInfo - Creature information
   * @param {Array} localIndex - Local image index
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Array>} Search results
   */
  async searchTokenArt(creatureInfo, localIndex, useCache = true) {
    return await searchOrchestrator.searchTokenArt(creatureInfo, localIndex, useCache);
  }

  /**
   * Perform parallel searches for multiple creature groups
   * Delegates to SearchOrchestrator for parallel search logic
   * @param {Map} groups - Creature groups
   * @param {Array} localIndex - Local image index
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Map>} Search results map
   */
  async parallelSearchCreatures(groups, localIndex, progressCallback = null) {
    return await searchOrchestrator.parallelSearchCreatures(groups, localIndex, progressCallback);
  }
}

// Export singleton instance
export const searchService = new SearchService();
