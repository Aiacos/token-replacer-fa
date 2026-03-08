/**
 * Token Replacer FA - Search Orchestrator
 * Handles complex search logic and result aggregation
 * @module services/SearchOrchestrator
 */

import {
  MODULE_ID,
  PARALLEL_BATCH_SIZE,
  CREATURE_TYPE_MAPPINGS,
  PRIMARY_CATEGORY_TERMS,
  SLOW_MODE_BATCH_SIZE,
} from '../core/Constants.js';
import {
  parseSubtypeTerms,
  hasGenericSubtype,
  getCreatureCacheKey,
  isExcludedPath,
  loadFuse,
  extractPathFromTVAResult,
  extractNameFromTVAResult,
  yieldToMain,
  createDebugLogger,
  createDefaultGetSetting,
  createModuleError,
} from '../core/Utils.js';
import { indexService } from './IndexService.js';

/**
 * SearchOrchestrator class for complex search orchestration
 * Handles searchTokenArt with all its subtype logic, result aggregation, and search coordination
 */
export class SearchOrchestrator {
  constructor(deps = {}) {
    const {
      tvaCacheService: injectedTVACache,
      forgeBazaarService: injectedForgeBazaar,
      indexService: injectedIndex = indexService,
      getSetting = createDefaultGetSetting(),
      workerFactory = () => new Worker(`modules/${MODULE_ID}/scripts/workers/IndexWorker.js`),
    } = deps;

    /** @type {Map<string, Array>} Search result cache with max 200 entries */
    this.searchCache = new Map();
    this._tvaCacheService = injectedTVACache ?? null;
    this._forgeBazaarService = injectedForgeBazaar ?? null;
    this._indexService = injectedIndex;
    this._getSetting = getSetting;
    this._workerFactory = workerFactory;
    this.worker = null;
    this._workerInitialized = false;
    this._debugLog = createDebugLogger('SearchOrchestrator');
  }

  /**
   * Lazy-initialize the Web Worker on first use
   * @private
   */
  _ensureWorker() {
    if (this._workerInitialized) return;
    this._workerInitialized = true;
    try {
      this.worker = this._workerFactory();
      this._debugLog('Web Worker initialized for background search operations');
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to initialize Web Worker:`, error);
      this.worker = null;
    }
  }

  /**
   * Set dependencies for the orchestrator
   * @param {Object} tvaCacheService - TVACacheService instance
   * @param {Object} forgeBazaarService - ForgeBazaarService instance
   */
  setDependencies(tvaCacheService, forgeBazaarService) {
    this._tvaCacheService = tvaCacheService;
    this._forgeBazaarService = forgeBazaarService;
  }

  /**
   * Clear the search cache
   * @returns {void}
   */
  /** @private Maximum search cache entries before eviction */
  static MAX_SEARCH_CACHE = 200;

  clearCache() {
    this.searchCache.clear();
  }

  /**
   * Set a cache entry, evicting oldest entries if cache exceeds max size
   * @private
   */
  _cacheSet(key, value) {
    // Delete first so re-insertion moves key to end (most recent)
    this.searchCache.delete(key);
    this.searchCache.set(key, value);
    if (this.searchCache.size > SearchOrchestrator.MAX_SEARCH_CACHE) {
      // Map iterates in insertion order — delete oldest 25%
      const toDelete = Math.floor(SearchOrchestrator.MAX_SEARCH_CACHE * 0.25);
      let count = 0;
      for (const k of this.searchCache.keys()) {
        if (count++ >= toDelete) break;
        this.searchCache.delete(k);
      }
    }
  }

  /**
   * Terminate the Web Worker and clean up resources
   * Should be called when the SearchOrchestrator is no longer needed
   * @returns {void}
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log(`${MODULE_ID} | Web Worker terminated`);
    }
  }

  /**
   * Cancel the current worker operation
   * Sends a cancel command to the worker, which will stop processing and send a 'cancelled' message
   * @returns {void}
   */
  cancelOperation() {
    if (this.worker) {
      this.worker.postMessage({ command: 'cancel' });
      console.log(`${MODULE_ID} | Cancellation requested`);
    }
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
      return mappings.some((term) => folderLower.includes(term.toLowerCase()));
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
    if (!this._tvaCacheService?.hasTVA || !this._tvaCacheService?.tvaAPI) return [];

    // FAST PATH: Use direct cache access if available
    if (this._tvaCacheService.tvaCacheLoaded) {
      const directResults = await this._tvaCacheService.searchTVACacheDirect(searchTerm);
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
      let searchResults = await this._tvaCacheService.tvaAPI.doImageSearch(searchTerm, {
        searchType: 'Portrait',
        simpleResults: false,
      });

      // If no results, try without options (TVA 6.x compatibility)
      if (
        !searchResults ||
        (Array.isArray(searchResults) && searchResults.length === 0) ||
        (searchResults instanceof Map && searchResults.size === 0)
      ) {
        searchResults = await this._tvaCacheService.tvaAPI.doImageSearch(searchTerm);
      }

      this._debugLog(`TVA raw results for "${searchTerm}":`, searchResults);

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
          score: item?.score ?? 0.5,
        });
      };

      // Handle different TVA result formats
      if (Array.isArray(searchResults)) {
        // Direct array of results
        for (const item of searchResults) {
          processItem(item);
        }
      } else if (
        searchResults instanceof Map ||
        (searchResults && typeof searchResults.entries === 'function')
      ) {
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
                score: 0.5,
              });
            }
          }
        }
      } else if (searchResults && typeof searchResults === 'object') {
        // Object with nested paths/images/results property
        const pathsArray =
          searchResults.paths ||
          searchResults.images ||
          searchResults.results ||
          searchResults.data;
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
   * Uses Web Worker for background processing when available, falls back to main thread
   * @param {string[]} searchTerms - Terms to search
   * @param {Array} index - Local image index
   * @param {string} creatureType - Optional creature type filter
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  async searchLocalIndex(searchTerms, index, creatureType = null, onProgress = null) {
    if (!index || index.length === 0) return [];

    // Lazy-init Worker on first search
    this._ensureWorker();

    // Use Web Worker if available, otherwise fallback to direct search
    if (this.worker) {
      console.log(`${MODULE_ID} | Using Web Worker for fuzzy search`);
      try {
        return await this.searchLocalIndexWithWorker(searchTerms, index, creatureType, onProgress);
      } catch (error) {
        // Worker failed, fallback to direct search on main thread
        console.warn(`${MODULE_ID} | Worker search failed, falling back to main thread:`, error);
        this.worker = null;
        try {
          ui.notifications.warn(
            game.i18n.localize('TOKEN_REPLACER_FA.notifications.workerFallback') ||
              'Token Replacer FA: Background worker failed, using slower method.',
            { permanent: false }
          );
        } catch {
          /* ui.notifications may not be ready */
        }
        return this.searchLocalIndexDirectly(searchTerms, index, creatureType);
      }
    } else {
      console.log(`${MODULE_ID} | Using fallback method (main thread)`);
      return this.searchLocalIndexDirectly(searchTerms, index, creatureType);
    }
  }

  /**
   * Search local index directly on main thread (fallback when worker unavailable)
   * @param {string[]} searchTerms - Terms to search
   * @param {Array} index - Local image index
   * @param {string} creatureType - Optional creature type filter
   * @returns {Promise<Array>} Search results
   */
  async searchLocalIndexDirectly(searchTerms, index, creatureType = null) {
    if (!index || index.length === 0) return [];

    const Fuse = await loadFuse();
    if (!Fuse) {
      console.warn(`${MODULE_ID} | Fuse.js unavailable — search skipped. Results will be empty.`);
      return [];
    }

    const results = [];
    const seenPaths = new Set(); // Use Set for O(1) duplicate check
    const threshold = this._getSetting(MODULE_ID, 'fuzzyThreshold') ?? 0.1;

    const fuseOptions = {
      keys: ['name', 'fileName', 'category'],
      threshold: threshold,
      includeScore: true,
      minMatchCharLength: 2,
    };

    // @ts-expect-error Fuse constructor injected via DI, type cannot express constructor constraint in JSDoc
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
          source: 'local',
        });
      }
    }

    return results;
  }

  /**
   * Search local index using Web Worker for background processing
   * Runs fuzzy search in background without blocking the main thread
   * @param {string[]} searchTerms - Terms to search
   * @param {Array} index - Local image index
   * @param {string} creatureType - Optional creature type filter
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  async searchLocalIndexWithWorker(searchTerms, index, creatureType = null, onProgress = null) {
    if (!this.worker) {
      throw createModuleError('worker_failed', 'Web Worker not available for background search', [
        'reload_module',
      ]);
    }

    if (!index || index.length === 0) return [];

    return new Promise((resolve, reject) => {
      let timeoutId;
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.worker.removeEventListener('message', messageHandler);
        this.worker.removeEventListener('error', errorHandler);
      };

      // Create a unique message handler for this search operation
      const messageHandler = (event) => {
        const { type, result, current, total, term: _term, message, stack: _stack } = event.data;

        switch (type) {
          case 'progress':
            if (onProgress) {
              onProgress(current, total);
            }
            break;

          case 'complete': {
            cleanup();
            let results = result || [];
            // Post-filter by creature type on main thread (Worker doesn't have category logic)
            if (creatureType && results.length > 0) {
              const before = results.length;
              results = results.filter(
                (item) =>
                  !item.category || this.folderMatchesCreatureType(item.category, creatureType)
              );
              if (results.length < before) {
                console.log(
                  `${MODULE_ID} | Worker results filtered by "${creatureType}": ${before} → ${results.length}`
                );
              }
            }
            console.log(`${MODULE_ID} | Worker search completed: ${results.length} results found`);
            resolve(results);
            break;
          }

          case 'cancelled':
            cleanup();
            console.log(`${MODULE_ID} | Search operation cancelled by user`);
            reject(new Error('Operation cancelled'));
            break;

          case 'error':
            cleanup();
            console.error(`${MODULE_ID} | Worker search error:`, message);
            reject(
              createModuleError(
                'worker_failed',
                `Worker search error: ${message || 'Unknown error'}`,
                ['reload_module', 'check_console']
              )
            );
            break;

          default:
            break;
        }
      };

      // Handle Worker crashes (unhandled exceptions, out-of-memory, import failures)
      const errorHandler = (error) => {
        cleanup();
        console.error(`${MODULE_ID} | Worker crashed during search:`, error);
        reject(
          createModuleError(
            'worker_failed',
            `Worker crashed: ${error.message || 'Unknown error'}`,
            ['reload_module', 'check_console']
          )
        );
      };

      this.worker.addEventListener('message', messageHandler);
      this.worker.addEventListener('error', errorHandler);

      // Get fuzzy threshold setting
      const threshold = this._getSetting(MODULE_ID, 'fuzzyThreshold') ?? 0.1;

      // 60s timeout to prevent Promise hanging if Worker stalls
      timeoutId = setTimeout(() => {
        cleanup();
        // Terminate zombie worker to prevent out-of-order results on subsequent calls
        if (this.worker) {
          this.worker.terminate();
          this.worker = null;
        }
        reject(
          createModuleError('worker_failed', 'Worker search timed out after 60 seconds', [
            'reload_module',
            'check_console',
          ])
        );
      }, 60000);

      // TODO [PERF]: Full localIndex serialized via structured clone per search call.
      // With 4 parallel batches × 10K entries = 4 concurrent large serializations.
      // Consider transferring index to Worker once and reusing across searches.
      this.worker.postMessage({
        command: 'fuzzySearch',
        data: {
          searchTerms: searchTerms,
          index: index,
          options: {
            keys: ['name', 'fileName', 'category'],
            threshold: threshold,
            includeScore: true,
            minMatchCharLength: 2,
          },
        },
      });
    });
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
  async searchByCategory(
    categoryType,
    localIndex,
    directSearchTerm = null,
    progressCallback = null
  ) {
    console.log(
      `${MODULE_ID} | searchByCategory START - type: ${categoryType}, directSearch: ${directSearchTerm}`
    );
    const results = [];
    const seenPaths = new Set();

    // Direct search term mode
    if (directSearchTerm) {
      // Get search priority setting
      const priority = this._getSetting(MODULE_ID, 'searchPriority');

      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: directSearchTerm, resultsFound: 0 });
      }

      // Priority: forgeBazaar - Try ForgeBazaarService first
      if (priority === 'forgeBazaar' && this._forgeBazaarService?.isServiceAvailable()) {
        const bazaarResults = await this._forgeBazaarService.search(directSearchTerm);
        for (const result of bazaarResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            results.push({ ...result, source: 'forge-bazaar' });
          }
        }
      }
      // Search TVA (when priority is faNexus, both, or forgeBazaar unavailable)
      else if (
        this._tvaCacheService?.hasTVA &&
        (priority === 'faNexus' ||
          priority === 'both' ||
          !this._forgeBazaarService?.isServiceAvailable())
      ) {
        const tvaResults = await this.searchTVA(directSearchTerm);
        for (const result of tvaResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            results.push(result);
          }
        }
      }
      // Fallback to ForgeBazaarService when TVA is not available (unless priority is faNexus only)
      else if (priority !== 'faNexus' && this._forgeBazaarService?.isServiceAvailable()) {
        const bazaarResults = await this._forgeBazaarService.search(directSearchTerm);
        for (const result of bazaarResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            results.push({ ...result, source: 'forge-bazaar' });
          }
        }
      }

      // Search local index
      if (localIndex?.length > 0) {
        const termLower = directSearchTerm.toLowerCase();
        const localMatches = localIndex.filter(
          (img) =>
            !isExcludedPath(img.path) &&
            (img.name?.toLowerCase().includes(termLower) ||
              img.fileName?.toLowerCase().includes(termLower) ||
              img.category?.toLowerCase().includes(termLower) ||
              img.path?.toLowerCase().includes(termLower))
        );
        for (const match of localMatches) {
          if (!seenPaths.has(match.path)) {
            seenPaths.add(match.path);
            results.push({ ...match, source: 'local' });
          }
        }
      }

      if (progressCallback) {
        progressCallback({
          current: 1,
          total: 1,
          term: directSearchTerm,
          resultsFound: results.length,
        });
      }

      console.log(
        `${MODULE_ID} | Direct search for "${directSearchTerm}" found ${results.length} results`
      );
      return results;
    }

    // Category-based comprehensive search
    console.log(`${MODULE_ID} | Starting comprehensive search for category: ${categoryType}`);

    // Get search priority setting
    const priority = this._getSetting(MODULE_ID, 'searchPriority');

    // Try FAST mode using pre-built index first
    if (this._indexService.isBuilt) {
      console.log(`${MODULE_ID} | Using pre-built index (FAST mode)`);
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'index lookup', resultsFound: 0 });
      }

      const indexResults = this._indexService.searchByCategory(categoryType);
      for (const result of indexResults) {
        // Double-check exclusion filter for safety
        if (!seenPaths.has(result.path) && !isExcludedPath(result.path)) {
          seenPaths.add(result.path);
          results.push({
            ...result,
            source: result.source || 'index',
          });
        }
      }

      if (progressCallback) {
        progressCallback({
          current: 1,
          total: 1,
          term: 'index lookup',
          resultsFound: results.length,
        });
      }

      console.log(`${MODULE_ID} | Index search found ${results.length} results (FAST mode)`);
    }
    // Priority: forgeBazaar - Try ForgeBazaarService first
    else if (priority === 'forgeBazaar' && this._forgeBazaarService?.isServiceAvailable()) {
      console.log(`${MODULE_ID} | Using ForgeBazaarService (priority: forgeBazaar)`);
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'Forge Bazaar', resultsFound: 0 });
      }

      const bazaarResults = await this._forgeBazaarService.browseCategory(categoryType);
      for (const result of bazaarResults) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push({
            ...result,
            source: 'forge-bazaar',
          });
        }
      }

      if (progressCallback) {
        progressCallback({
          current: 1,
          total: 1,
          term: 'Forge Bazaar',
          resultsFound: results.length,
        });
      }

      console.log(`${MODULE_ID} | ForgeBazaarService found ${results.length} results`);
    }
    // FAST PATH: Use TVA direct cache if loaded (when priority is not forgeBazaar, or when forgeBazaar unavailable)
    else if (
      this._tvaCacheService?.tvaCacheLoaded &&
      (priority === 'faNexus' ||
        priority === 'both' ||
        !this._forgeBazaarService?.isServiceAvailable())
    ) {
      console.log(`${MODULE_ID} | Using TVA direct cache (FAST mode)`);
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'TVA cache lookup', resultsFound: 0 });
      }

      const tvaCacheResults = await this._tvaCacheService.searchTVACacheByCategory(categoryType);
      for (const result of tvaCacheResults) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push(result);
        }
      }

      if (progressCallback) {
        progressCallback({
          current: 1,
          total: 1,
          term: 'TVA cache lookup',
          resultsFound: results.length,
        });
      }

      console.log(`${MODULE_ID} | TVA direct cache found ${results.length} results (FAST mode)`);
    }
    // Fallback to SLOW mode - multiple TVA API calls (when priority is not forgeBazaar, or when forgeBazaar unavailable)
    else if (
      this._tvaCacheService?.hasTVA &&
      (priority === 'faNexus' ||
        priority === 'both' ||
        !this._forgeBazaarService?.isServiceAvailable())
    ) {
      const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType?.toLowerCase()];

      if (categoryTerms) {
        console.log(
          `${MODULE_ID} | Searching ${categoryTerms.length} terms for ${categoryType} (SLOW mode - index not built)`
        );
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
              resultsFound: results.length,
            });
          }

          // Execute batch in parallel
          const batchPromises = batch.map((term) => this.searchTVA(term));
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
            console.log(
              `${MODULE_ID} | Search progress: ${searchCount}/${totalTerms} terms, ${results.length} results`
            );
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
                resultsFound: results.length,
              });
            }

            const batchPromises = batch.map((term) => this.searchTVA(term));
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
    // Fallback to ForgeBazaarService when TVA is not available (unless priority is faNexus only)
    else if (priority !== 'faNexus' && this._forgeBazaarService?.isServiceAvailable()) {
      console.log(`${MODULE_ID} | Using ForgeBazaarService (TVA not available)`);
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'Forge Bazaar', resultsFound: 0 });
      }

      const bazaarResults = await this._forgeBazaarService.browseCategory(categoryType);
      for (const result of bazaarResults) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push({
            ...result,
            source: 'forge-bazaar',
          });
        }
      }

      if (progressCallback) {
        progressCallback({
          current: 1,
          total: 1,
          term: 'Forge Bazaar',
          resultsFound: results.length,
        });
      }

      console.log(`${MODULE_ID} | ForgeBazaarService found ${results.length} results`);
    }

    // Search local index by category
    if (localIndex?.length > 0) {
      if (progressCallback) {
        progressCallback({
          current: 0,
          total: 1,
          term: 'local index',
          resultsFound: results.length,
        });
      }

      const categoryMatches = localIndex.filter(
        (img) =>
          !isExcludedPath(img.path) &&
          img.category &&
          this.folderMatchesCreatureType(img.category, categoryType)
      );
      for (const match of categoryMatches) {
        if (!seenPaths.has(match.path)) {
          seenPaths.add(match.path);
          results.push({ ...match, source: 'local' });
        }
      }
    }

    console.log(
      `${MODULE_ID} | searchByCategory END - found ${results.length} results for ${categoryType}`
    );
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
      const cached = this.searchCache.get(cacheKey);
      // Promote to most-recent position for LRU ordering
      this.searchCache.delete(cacheKey);
      this.searchCache.set(cacheKey, cached);
      return cached;
    }

    const priority = this._getSetting(MODULE_ID, 'searchPriority');
    const useTVACache = this._getSetting(MODULE_ID, 'useTVACache');
    const results = [];
    const useTVAForAll = this._tvaCacheService?.hasTVA && useTVACache;

    // Check for specific subtypes
    const isGenericSubtype = hasGenericSubtype(creatureInfo.subtype);
    const subtypeTerms = parseSubtypeTerms(creatureInfo.subtype);
    const hasSpecificSubtypes = subtypeTerms.length > 0 && !isGenericSubtype && creatureInfo.type;

    // Case: Specific subtypes - search each term separately (OR logic)
    if (hasSpecificSubtypes) {
      console.log(
        `${MODULE_ID} | OR Logic Mode: "${creatureInfo.type}" with subtypes (${subtypeTerms.join(', ')})`
      );

      const seenPaths = new Set();

      // Try FAST mode using pre-built index
      if (this._indexService.isBuilt) {
        console.log(`${MODULE_ID} | Using index for subtype search (FAST mode)`);

        // First search for actor name (highest priority - exact matches)
        if (creatureInfo.actorName) {
          const nameResults = this._indexService.search(creatureInfo.actorName.toLowerCase());
          console.log(
            `${MODULE_ID} | Index returned ${nameResults.length} results for actor name "${creatureInfo.actorName}"`
          );
          for (const result of nameResults) {
            // Double-check exclusion filter for safety
            if (!seenPaths.has(result.path) && !isExcludedPath(result.path)) {
              seenPaths.add(result.path);
              results.push({
                ...result,
                score: result.score ?? 0.1, // Higher priority (lower score = better)
                fromName: true,
              });
            }
          }
        }

        // Then search for subtypes
        const indexResults = this._indexService.searchMultiple(subtypeTerms);
        console.log(`${MODULE_ID} | Index returned ${indexResults.length} results for subtypes`);

        for (const result of indexResults) {
          // Double-check exclusion filter for safety
          if (!seenPaths.has(result.path) && !isExcludedPath(result.path)) {
            seenPaths.add(result.path);
            results.push({
              ...result,
              score: result.score ?? 0.3,
              fromSubtype: true,
            });
          }
        }
      }
      // FAST PATH: Use TVA direct cache if loaded
      else if (this._tvaCacheService?.isTVACacheLoaded) {
        console.log(`${MODULE_ID} | Using TVA direct cache for subtype search (FAST mode)`);

        // First search for actor name (highest priority)
        if (creatureInfo.actorName) {
          const nameResults = await this._tvaCacheService.searchTVACacheDirect(
            creatureInfo.actorName
          );
          console.log(
            `${MODULE_ID} | TVA direct cache returned ${nameResults.length} results for actor name "${creatureInfo.actorName}"`
          );

          for (const result of nameResults) {
            if (!seenPaths.has(result.path)) {
              seenPaths.add(result.path);
              results.push({
                ...result,
                score: result.score ?? 0.1,
                fromName: true,
              });
            }
          }
        }

        // Then search for all subtypes at once (more efficient)
        const subtypeResults = await this._tvaCacheService.searchTVACacheMultiple(subtypeTerms);
        console.log(
          `${MODULE_ID} | TVA direct cache returned ${subtypeResults.length} results for subtypes (${subtypeTerms.join(', ')})`
        );

        for (const result of subtypeResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            results.push({
              ...result,
              score: result.score ?? 0.3,
              fromSubtype: true,
            });
          }
        }
      }
      // Fallback to SLOW mode - TVA API calls (only if cache not loaded)
      else if (this._tvaCacheService?.hasTVA) {
        console.log(
          `${MODULE_ID} | Searching TVA for each subtype separately (SLOW mode - cache not loaded)`
        );

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
                fromName: true,
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
                matchedTerm: term,
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
          const nameMatches = localIndex.filter((img) => {
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
                fromName: true,
              });
            }
          }
        }

        // Then search for subtypes
        for (const term of subtypeTerms) {
          const termLower = term.toLowerCase();
          const localMatches = localIndex.filter((img) => {
            // Skip excluded paths
            if (isExcludedPath(img.path)) return false;
            const nameLower = (img.name || '').toLowerCase();
            const pathLower = (img.path || '').toLowerCase();
            const categoryLower = (img.category || '').toLowerCase();
            return (
              nameLower.includes(termLower) ||
              pathLower.includes(termLower) ||
              categoryLower.includes(termLower)
            );
          });

          for (const match of localMatches) {
            if (!seenPaths.has(match.path)) {
              seenPaths.add(match.path);
              results.push({
                ...match,
                source: 'local',
                score: match.score ?? 0.4,
                fromSubtype: true,
                matchedTerm: term,
              });
            }
          }
        }
      }

      console.log(
        `${MODULE_ID} | Total results after OR search: ${results.length} (matching ${subtypeTerms.join(' OR ')})`
      );

      this._cacheSet(cacheKey, results);
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

    if (
      this._tvaCacheService?.hasTVA &&
      (useTVAForAll || priority === 'forgeBazaar' || priority === 'both')
    ) {
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
            fromCategory: true,
          });
        }
      }
    }

    // Filter and sort results
    const validResults = results.filter((r) => {
      if (!r.path || typeof r.path !== 'string') return false;
      return (
        r.path.includes('/') ||
        r.path.includes('.') ||
        r.path.startsWith('http') ||
        r.path.startsWith('forge://')
      );
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
      if (aIsCategory && bIsCategory) {
        /* same priority */
      } else if (!aIsCategory && bIsCategory) return -1;
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

    this._cacheSet(cacheKey, validResults);
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
          currentBatch: batch.map(([_key, group]) => group.creatureInfo.actorName),
        });
      }

      const batchPromises = batch.map(async ([key, group]) => {
        const searchResults = await this.searchTokenArt(group.creatureInfo, localIndex, true);
        return { key, searchResults, group };
      });

      const settledResults = await Promise.allSettled(batchPromises);

      for (const result of settledResults) {
        if (result.status === 'fulfilled') {
          const { key, searchResults, group } = result.value;
          results.set(key, {
            matches: searchResults,
            tokens: group.tokens,
            creatureInfo: group.creatureInfo,
          });
        } else {
          console.warn(
            `${MODULE_ID} | Batch search failed for one group:`,
            result.reason?.message || result.reason
          );
        }
      }
    }

    return results;
  }
}

// Export singleton instance
export const searchOrchestrator = new SearchOrchestrator();
