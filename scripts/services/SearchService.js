/**
 * Token Replacer FA - Search Service
 * Thin facade that initializes sub-services and delegates search operations
 * @module services/SearchService
 */

import { MODULE_ID } from '../core/Constants.js';
import { ModuleError } from '../core/ModuleError.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { tvaCacheService } from './TVACacheService.js';
import { forgeBazaarService } from './ForgeBazaarService.js';
import { searchOrchestrator } from './SearchOrchestrator.js';

/**
 * SearchService - Initializes sub-services and delegates search operations
 * Externally called methods: init(), clearCache(), searchByCategory(), parallelSearchCreatures()
 */
export class SearchService {
  constructor() {
    this._logger = new DebugLogger('SearchService');
    this._initialized = false;
  }

  /**
   * Initialize the search service and wire up dependencies
   * Idempotent - safe to call multiple times
   * @returns {void}
   */
  init() {
    if (this._initialized) {
      this._logger.log('Already initialized, skipping');
      return;
    }

    try {
      this._logger.log('Initializing SearchService...');
      tvaCacheService.init();
      forgeBazaarService.init();
      searchOrchestrator.setDependencies(tvaCacheService, forgeBazaarService);
      this._initialized = true;
      console.log(
        `${MODULE_ID} | SearchService initialized (delegates to TVACacheService, ForgeBazaarService, and SearchOrchestrator)`
      );
      this._logger.log('SearchService initialization complete');
    } catch (error) {
      console.error(`${MODULE_ID} | SearchService initialization failed:`, error);
      throw ModuleError.of(
        'unknown',
        `Failed to initialize SearchService: ${error.message || String(error)}`,
        ['reload_module', 'check_console']
      );
    }
  }

  /**
   * Clear all search caches
   * @returns {void}
   */
  clearCache() {
    try {
      this._logger.log('Clearing search cache...');
      searchOrchestrator.clearCache();
      forgeBazaarService.clearCache();
      this._logger.log('Search cache cleared successfully');
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to clear search cache:`, error);
      this._logger.log('Cache clear error:', error);
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
  async searchByCategory(
    categoryType,
    localIndex,
    directSearchTerm = null,
    progressCallback = null
  ) {
    try {
      if (!categoryType || typeof categoryType !== 'string') {
        this._logger.log('Invalid category type for searchByCategory:', categoryType);
        throw ModuleError.of(
          'search_failed',
          'Invalid category type provided (must be a non-empty string)',
          ['check_console']
        );
      }

      if (localIndex && !Array.isArray(localIndex)) {
        this._logger.log('Invalid local index for searchByCategory:', typeof localIndex);
        throw ModuleError.of('search_failed', 'Invalid local index provided (must be an array)', [
          'check_console',
        ]);
      }

      this._logger.log(
        `Searching by category: "${categoryType}", directSearch: ${directSearchTerm || 'none'}`
      );
      const results = await searchOrchestrator.searchByCategory(
        categoryType,
        localIndex,
        directSearchTerm,
        progressCallback
      );
      this._logger.log(`Category search completed: ${results.length} results found`);
      return results;
    } catch (error) {
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      this._logger.log('Unexpected error in searchByCategory:', error);
      throw ModuleError.of(
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
        this._logger.log('Invalid groups for parallelSearchCreatures:', groups);
        throw ModuleError.of('search_failed', 'Invalid groups provided (must be a Map)', [
          'check_console',
        ]);
      }

      if (groups.size === 0) {
        this._logger.log('Empty groups map provided to parallelSearchCreatures');
        return new Map();
      }

      if (localIndex && !Array.isArray(localIndex)) {
        this._logger.log('Invalid local index for parallelSearchCreatures:', typeof localIndex);
        throw ModuleError.of('search_failed', 'Invalid local index provided (must be an array)', [
          'check_console',
        ]);
      }

      this._logger.log(`Starting parallel search for ${groups.size} creature groups`);
      const results = await searchOrchestrator.parallelSearchCreatures(
        groups,
        localIndex,
        progressCallback
      );
      this._logger.log(`Parallel search completed: ${results.size} groups processed`);
      return results;
    } catch (error) {
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      this._logger.log('Unexpected error in parallelSearchCreatures:', error);
      throw ModuleError.of(
        'search_failed',
        `Unexpected error in parallel search: ${error.message || String(error)}`,
        ['check_console', 'reload_module']
      );
    }
  }
}

// Export singleton instance
export const searchService = new SearchService();
