/**
 * Token Replacer FA - Search Service
 * Thin facade that initializes sub-services and delegates search operations
 * @module services/SearchService
 */

import { MODULE_ID } from '../core/Constants.js';
import { createModuleError, createDebugLogger } from '../core/Utils.js';
import { tvaCacheService } from './TVACacheService.js';
import { forgeBazaarService } from './ForgeBazaarService.js';
import { searchOrchestrator } from './SearchOrchestrator.js';

/**
 * SearchService - Initializes sub-services and delegates search operations
 * Externally called methods: init(), clearCache(), searchByCategory(), parallelSearchCreatures()
 */
export class SearchService {
  constructor() {
    this._debugLog = createDebugLogger('SearchService');
    this._initialized = false;
  }

  /**
   * Initialize the search service and wire up dependencies
   * Idempotent - safe to call multiple times
   */
  init() {
    if (this._initialized) {
      this._debugLog('Already initialized, skipping');
      return;
    }

    try {
      this._debugLog('Initializing SearchService...');
      tvaCacheService.init();
      forgeBazaarService.init();
      searchOrchestrator.setDependencies(tvaCacheService, forgeBazaarService);
      this._initialized = true;
      console.log(`${MODULE_ID} | SearchService initialized (delegates to TVACacheService, ForgeBazaarService, and SearchOrchestrator)`);
      this._debugLog('SearchService initialization complete');
    } catch (error) {
      console.error(`${MODULE_ID} | SearchService initialization failed:`, error);
      throw createModuleError(
        'unknown',
        `Failed to initialize SearchService: ${error.message || String(error)}`,
        ['reload_module', 'check_console']
      );
    }
  }

  /**
   * Clear all search caches
   */
  clearCache() {
    try {
      this._debugLog('Clearing search cache...');
      searchOrchestrator.clearCache();
      forgeBazaarService.clearCache();
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
      if (!categoryType || typeof categoryType !== 'string') {
        this._debugLog('Invalid category type for searchByCategory:', categoryType);
        throw createModuleError(
          'search_failed',
          'Invalid category type provided (must be a non-empty string)',
          ['check_console']
        );
      }

      if (localIndex && !Array.isArray(localIndex)) {
        this._debugLog('Invalid local index for searchByCategory:', typeof localIndex);
        throw createModuleError(
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
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      this._debugLog('Unexpected error in searchByCategory:', error);
      throw createModuleError(
        'search_failed',
        `Unexpected error searching by category "${categoryType}": ${error.message || String(error)}`,
        ['check_console', 'reload_module']
      );
    }
  }

  /**
   * Perform parallel searches for multiple creature groups
   * Delegates to SearchOrchestrator
   * @param {Map} groups - Creature groups
   * @param {Array} localIndex - Local image index
   * @param {Function} progressCallback - Progress callback
   * @returns {Promise<Map>} Search results map
   * @throws {Object} Structured error if search fails
   */
  async parallelSearchCreatures(groups, localIndex, progressCallback = null) {
    try {
      if (!groups || !(groups instanceof Map)) {
        this._debugLog('Invalid groups for parallelSearchCreatures:', groups);
        throw createModuleError(
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
        throw createModuleError(
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
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      this._debugLog('Unexpected error in parallelSearchCreatures:', error);
      throw createModuleError(
        'search_failed',
        `Unexpected error in parallel search: ${error.message || String(error)}`,
        ['check_console', 'reload_module']
      );
    }
  }
}

// Export singleton instance
export const searchService = new SearchService();
