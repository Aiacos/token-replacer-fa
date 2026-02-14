/**
 * Token Replacer FA - Search Service
 * Handles all search operations using TVA's static cache directly for speed
 * @module services/SearchService
 */

import { MODULE_ID } from '../core/Constants.js';
import { tvaCacheService } from './TVACacheService.js';
import { forgeBazaarService } from './ForgeBazaarService.js';
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
    forgeBazaarService.init();
    // Set dependencies for SearchOrchestrator to enable delegation
    searchOrchestrator.setDependencies(this, tvaCacheService, forgeBazaarService);
    console.log(`${MODULE_ID} | SearchService initialized (delegates to TVACacheService, ForgeBazaarService, and SearchOrchestrator)`);
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
   * Also clears searchOrchestrator's and forgeBazaarService's cache
   */
  clearCache() {
    this.searchCache.clear();
    searchOrchestrator.clearCache();
    forgeBazaarService.clearCache();
  }

  /**
   * Search by creature type category
   * Delegates to SearchOrchestrator
   * @param {string} categoryType - Creature type category
   * @param {Array} localIndex - Local image index
   * @param {string} directSearchTerm - Optional direct search term
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  async searchByCategory(categoryType, localIndex, directSearchTerm = null, progressCallback = null) {
    return await searchOrchestrator.searchByCategory(categoryType, localIndex, directSearchTerm, progressCallback);
  }

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
