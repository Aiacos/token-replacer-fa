/**
 * Token Replacer FA - Search Service
 * Handles all search operations using TVA's static cache directly for speed
 * @module services/SearchService
 */

import { MODULE_ID } from '../core/Constants.js';
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
   * Create a structured error object with localized messages
   * @private
   * @param {string} errorType - Error type key (e.g., 'search_failed')
   * @param {string} details - Technical details about the error
   * @param {string[]} recoveryKeys - Array of recovery suggestion keys
   * @returns {Object} Structured error object
   */
  _createError(errorType, details, recoveryKeys = []) {
    return {
      errorType,
      message: game.i18n.localize(`TOKEN_REPLACER_FA.errors.${errorType}`),
      details,
      recoverySuggestions: recoveryKeys.map(key =>
        game.i18n.localize(`TOKEN_REPLACER_FA.recovery.${key}`)
      )
    };
  }

  /**
   * Log a debug message if debug mode is enabled
   * @private
   * @param {string} message - Debug message to log
   * @param {...any} args - Additional arguments to log
   */
  _debugLog(message, ...args) {
    if (game.settings.get(MODULE_ID, 'debugMode')) {
      console.log(`${MODULE_ID} | [SearchService] ${message}`, ...args);
    }
  }

  /**
   * Initialize the search service (basic setup only)
   * Call loadTVACache() separately after TVA has finished caching
   */
  init() {
    try {
      this._debugLog('Initializing SearchService...');
      tvaCacheService.init();
      // Set dependencies for SearchOrchestrator to enable delegation
      searchOrchestrator.setDependencies(this, tvaCacheService);
      console.log(`${MODULE_ID} | SearchService initialized (delegates to TVACacheService and SearchOrchestrator)`);
      this._debugLog('SearchService initialization complete');
    } catch (error) {
      console.error(`${MODULE_ID} | SearchService initialization failed:`, error);
      throw this._createError(
        'unknown',
        `Failed to initialize SearchService: ${error.message || String(error)}`,
        ['reload_module', 'check_console']
      );
    }
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
   * @throws {Object} Structured error if cache load fails
   */
  async loadTVACache(maxWaitMs = 30000) {
    try {
      this._debugLog(`Loading TVA cache (max wait: ${maxWaitMs}ms)...`);
      const result = await tvaCacheService.loadTVACache(maxWaitMs);
      this._debugLog(`TVA cache loaded successfully: ${result}`);
      return result;
    } catch (error) {
      // If it's already a structured error from TVACacheService, re-throw it
      if (error.errorType && error.message && error.recoverySuggestions) {
        this._debugLog('TVA cache load failed with structured error:', error.errorType);
        throw error;
      }

      // Otherwise, wrap unexpected errors
      this._debugLog('Unexpected error loading TVA cache:', error);
      throw this._createError(
        'cache_load_failed',
        `Unexpected error loading TVA cache: ${error.message || String(error)}`,
        ['reload_module', 'check_console', 'rebuild_cache']
      );
    }
  }

  /**
   * Force reload of TVA cache (use after TVA cache refresh)
   * @returns {Promise<boolean>} True if reloaded successfully
   * @throws {Object} Structured error if reload fails
   */
  async reloadTVACache() {
    try {
      this._debugLog('Reloading TVA cache...');
      const result = await tvaCacheService.reloadTVACache();
      this._debugLog(`TVA cache reloaded successfully: ${result}`);
      return result;
    } catch (error) {
      // If it's already a structured error from TVACacheService, re-throw it
      if (error.errorType && error.message && error.recoverySuggestions) {
        this._debugLog('TVA cache reload failed with structured error:', error.errorType);
        throw error;
      }

      // Otherwise, wrap unexpected errors
      this._debugLog('Unexpected error reloading TVA cache:', error);
      throw this._createError(
        'cache_load_failed',
        `Unexpected error reloading TVA cache: ${error.message || String(error)}`,
        ['reload_module', 'check_console', 'rebuild_cache']
      );
    }
  }

  /**
   * Search TVA cache directly using simple string matching (FAST)
   * @param {string} searchTerm - Term to search
   * @returns {Array} Matching images
   */
  searchTVACacheDirect(searchTerm) {
    try {
      if (!searchTerm || typeof searchTerm !== 'string') {
        this._debugLog('Invalid search term provided:', searchTerm);
        return [];
      }

      this._debugLog(`Searching TVA cache for: "${searchTerm}"`);
      const results = tvaCacheService.searchTVACacheDirect(searchTerm);
      this._debugLog(`Search completed: ${results.length} results found`);
      return results;
    } catch (error) {
      console.warn(`${MODULE_ID} | Search failed for term "${searchTerm}":`, error);
      this._debugLog('Search error:', error);
      return [];
    }
  }

  /**
   * Search TVA cache by category (FAST)
   * Only matches on image name and meaningful path segments, not TVA folder category
   * @param {string} categoryType - Creature type category
   * @returns {Array} Matching images
   */
  searchTVACacheByCategory(categoryType) {
    try {
      if (!categoryType || typeof categoryType !== 'string') {
        this._debugLog('Invalid category type provided:', categoryType);
        return [];
      }

      this._debugLog(`Searching TVA cache by category: "${categoryType}"`);
      const results = tvaCacheService.searchTVACacheByCategory(categoryType);
      this._debugLog(`Category search completed: ${results.length} results found`);
      return results;
    } catch (error) {
      console.warn(`${MODULE_ID} | Category search failed for "${categoryType}":`, error);
      this._debugLog('Category search error:', error);
      return [];
    }
  }

  /**
   * Search TVA cache for multiple terms (OR logic) - FAST
   * @param {string[]} searchTerms - Terms to search (any match)
   * @returns {Array} Matching images
   */
  searchTVACacheMultiple(searchTerms) {
    try {
      if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
        this._debugLog('Invalid search terms provided:', searchTerms);
        return [];
      }

      this._debugLog(`Searching TVA cache for ${searchTerms.length} terms`);
      const results = tvaCacheService.searchTVACacheMultiple(searchTerms);
      this._debugLog(`Multiple term search completed: ${results.length} results found`);
      return results;
    } catch (error) {
      console.warn(`${MODULE_ID} | Multiple term search failed:`, error);
      this._debugLog('Multiple term search error:', error);
      return [];
    }
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
    try {
      const stats = tvaCacheService.getTVACacheStats();
      this._debugLog('TVA cache stats retrieved:', stats);
      return stats;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to get TVA cache stats:`, error);
      this._debugLog('Stats retrieval error:', error);
      return { loaded: false, totalImages: 0, categories: 0 };
    }
  }

  /**
   * Clear the search cache
   * Also clears searchOrchestrator's cache
   */
  clearCache() {
    try {
      this._debugLog('Clearing search cache...');
      this.searchCache.clear();
      searchOrchestrator.clearCache();
      this._debugLog('Search cache cleared successfully');
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to clear search cache:`, error);
      this._debugLog('Cache clear error:', error);
    }
  }

  /**
   * Search by creature type category
   * Delegates to SearchOrchestrator
   * @param {string} categoryType - Creature type category
   * @param {Array} localIndex - Local image index
   * @param {string} directSearchTerm - Optional direct search term
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Array>} Search results
   * @throws {Object} Structured error if search fails
   */
  async searchByCategory(categoryType, localIndex, directSearchTerm = null, progressCallback = null) {
    try {
      // Validate inputs
      if (!categoryType || typeof categoryType !== 'string') {
        this._debugLog('Invalid category type for searchByCategory:', categoryType);
        throw this._createError(
          'search_failed',
          'Invalid category type provided (must be a non-empty string)',
          ['check_console']
        );
      }

      if (localIndex && !Array.isArray(localIndex)) {
        this._debugLog('Invalid local index for searchByCategory:', typeof localIndex);
        throw this._createError(
          'search_failed',
          'Invalid local index provided (must be an array)',
          ['check_console']
        );
      }

      this._debugLog(`Searching by category: "${categoryType}", directSearch: ${directSearchTerm || 'none'}`);
      const results = await searchOrchestrator.searchByCategory(categoryType, localIndex, directSearchTerm, progressCallback);
      this._debugLog(`Category search completed: ${results.length} results found`);
      return results;
    } catch (error) {
      // If it's already a structured error, re-throw it
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      // Otherwise, wrap unexpected errors
      this._debugLog('Unexpected error in searchByCategory:', error);
      throw this._createError(
        'search_failed',
        `Unexpected error searching by category "${categoryType}": ${error.message || String(error)}`,
        ['check_console', 'reload_module']
      );
    }
  }

  /**
   * Search for token art based on creature info
   * Delegates to SearchOrchestrator for complex search logic
   * @param {Object} creatureInfo - Creature information
   * @param {Array} localIndex - Local image index
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Array>} Search results
   * @throws {Object} Structured error if search fails
   */
  async searchTokenArt(creatureInfo, localIndex, useCache = true) {
    try {
      // Validate inputs
      if (!creatureInfo || typeof creatureInfo !== 'object') {
        this._debugLog('Invalid creature info for searchTokenArt:', creatureInfo);
        throw this._createError(
          'search_failed',
          'Invalid creature info provided (must be an object)',
          ['check_console']
        );
      }

      if (!creatureInfo.searchTerms || !Array.isArray(creatureInfo.searchTerms)) {
        this._debugLog('Invalid searchTerms in creature info:', creatureInfo);
        throw this._createError(
          'search_failed',
          'Invalid creature info: missing or invalid searchTerms array',
          ['check_console']
        );
      }

      if (localIndex && !Array.isArray(localIndex)) {
        this._debugLog('Invalid local index for searchTokenArt:', typeof localIndex);
        throw this._createError(
          'search_failed',
          'Invalid local index provided (must be an array)',
          ['check_console']
        );
      }

      this._debugLog(`Searching token art for creature: "${creatureInfo.actorName || 'unknown'}", terms: [${creatureInfo.searchTerms.join(', ')}]`);
      const results = await searchOrchestrator.searchTokenArt(creatureInfo, localIndex, useCache);
      this._debugLog(`Token art search completed: ${results.length} results found`);
      return results;
    } catch (error) {
      // If it's already a structured error, re-throw it
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      // Otherwise, wrap unexpected errors
      this._debugLog('Unexpected error in searchTokenArt:', error);
      throw this._createError(
        'search_failed',
        `Unexpected error searching token art: ${error.message || String(error)}`,
        ['check_console', 'reload_module']
      );
    }
  }

  /**
   * Perform parallel searches for multiple creature groups
   * Delegates to SearchOrchestrator for parallel search logic
   * @param {Map} groups - Creature groups
   * @param {Array} localIndex - Local image index
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Map>} Search results map
   * @throws {Object} Structured error if search fails
   */
  async parallelSearchCreatures(groups, localIndex, progressCallback = null) {
    try {
      // Validate inputs
      if (!groups || !(groups instanceof Map)) {
        this._debugLog('Invalid groups for parallelSearchCreatures:', groups);
        throw this._createError(
          'search_failed',
          'Invalid groups provided (must be a Map)',
          ['check_console']
        );
      }

      if (groups.size === 0) {
        this._debugLog('Empty groups map provided to parallelSearchCreatures');
        return new Map();
      }

      if (localIndex && !Array.isArray(localIndex)) {
        this._debugLog('Invalid local index for parallelSearchCreatures:', typeof localIndex);
        throw this._createError(
          'search_failed',
          'Invalid local index provided (must be an array)',
          ['check_console']
        );
      }

      this._debugLog(`Starting parallel search for ${groups.size} creature groups`);
      const results = await searchOrchestrator.parallelSearchCreatures(groups, localIndex, progressCallback);
      this._debugLog(`Parallel search completed: ${results.size} groups processed`);
      return results;
    } catch (error) {
      // If it's already a structured error, re-throw it
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      // Otherwise, wrap unexpected errors
      this._debugLog('Unexpected error in parallelSearchCreatures:', error);
      throw this._createError(
        'search_failed',
        `Unexpected error in parallel search: ${error.message || String(error)}`,
        ['check_console', 'reload_module']
      );
    }
  }
}

// Export singleton instance
export const searchService = new SearchService();
