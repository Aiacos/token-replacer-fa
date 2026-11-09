/**
 * Token Replacer FA - TVA Cache Service
 * Manages TVA (Token Variant Art) cache loading and direct cache access
 * @module services/TVACacheService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS } from '../core/Constants.js';
import { pathFilter as defaultPathFilter } from '../core/PathFilter.js';
import { ModuleError } from '../core/ModuleError.js';
import { Settings } from '../core/Settings.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { Scheduler } from '../core/Scheduler.js';
import { storageService } from './StorageService.js';
import { TvaCacheParser } from './tva/TvaCacheParser.js';
import { TvaCacheRepository } from './tva/TvaCacheRepository.js';
import { CategoryCache } from './tva/CategoryCache.js';

/** Images processed between yields while building the searchable cache. */
const CHUNK_SIZE = 5000;

/**
 * Direct access to TVA's static cache file: much faster than TVA's
 * `doImageSearch`, which runs Fuse over every image per query.
 *
 * Owns the loaded state (`tvaCacheImages`, `tvaCacheSearchable`,
 * `tvaCacheByCategory`) and the load lifecycle: concurrent loads share one
 * promise, and a reload waits for a load in flight before replacing its data.
 * Parsing, persistence and the category pre-cache are delegated.
 *
 * @pattern Facade — one entry point over TvaCacheParser (file format),
 * TvaCacheRepository (persistence) and CategoryCache (category lookup).
 */
export class TVACacheService {
  /**
   * @param {Object} [deps={}] - Dependency overrides for testing
   * @param {function(): Object|null} [deps.getTvaAPI] - Returns TVA API object (default: reads from game.modules)
   * @param {function(string, string): *} [deps.getSetting] - Settings accessor (default: game.settings.get)
   * @param {Object} [deps.storageService] - Storage service instance (default: imported singleton)
   * @param {{isExcluded: function(string): boolean, clearCache: function(): void}} [deps.pathFilter] - Excluded-path filter (default: shared singleton)
   * @param {TvaCacheParser} [deps.parser] - TVA cache file parser
   * @param {CategoryCache} [deps.categoryCache] - Category pre-cache
   * @param {TvaCacheRepository} [deps.repository] - Persistence of the parsed cache (default: over storageService)
   */
  constructor(deps = {}) {
    const {
      getTvaAPI = () => game.modules.get('token-variants')?.api,
      getSetting = Settings.defaultGetter(),
      storageService: injectedStorage = storageService,
      pathFilter = defaultPathFilter,
      parser = new TvaCacheParser(),
      categoryCache = new CategoryCache(),
    } = deps;

    this._getTvaAPI = getTvaAPI;
    this._getSetting = getSetting;
    this._storageService = injectedStorage;
    this._pathFilter = pathFilter;
    this._parser = parser;
    this._categoryCache = categoryCache;
    this._logger = new DebugLogger('TVACacheService');
    this._repository =
      deps.repository ?? new TvaCacheRepository({ storage: injectedStorage, logger: this._logger });

    this.tvaAPI = null;
    this.hasTVA = false;
    this.tvaCacheLoaded = false;
    this.tvaCacheImages = [];
    this.tvaCacheSearchable = [];
    this.tvaCacheByCategory = {};
    this._loadPromise = null; // Promise deduplication for concurrent loads
  }

  /**
   * Initialize the TVA cache service (basic setup only)
   * Call loadTVACache() separately after TVA has finished caching
   * @returns {void}
   */
  init() {
    this.tvaAPI = this._getTvaAPI();
    this.hasTVA = !!this.tvaAPI;
    console.log(`${MODULE_ID} | TVACacheService initialized. TVA available: ${this.hasTVA}`);
  }

  /**
   * Build searchable cache from raw images: filter excluded paths, add lowercase fields
   * in-place (no object duplication), and pre-build the category lookup.
   * Yields to main thread every CHUNK_SIZE items to avoid blocking UI on large datasets.
   * @private
   * @returns {Promise<void>}
   */
  async _buildSearchableCache() {
    const images = this.tvaCacheImages;
    const result = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      img._nameLower = (img.name || '').toLowerCase();
      img._pathLower = (img.path || '').toLowerCase();
      if (!this._pathFilter.isExcluded(img.path)) {
        result.push(img);
      }
      if (i > 0 && i % CHUNK_SIZE === 0) {
        await Scheduler.yieldToMain(0);
      }
    }
    this.tvaCacheSearchable = result;
    this._categoryCache.build(result);
  }

  /**
   * Wait for TVA to finish caching, then load the cache directly
   * This should be called AFTER any TVA cache refresh operations
   * @param {number} maxWaitMs - Maximum time to wait for TVA caching (default 30s)
   * @returns {Promise<boolean>} True if cache loaded successfully
   * @throws {Object} Structured error if TVA not available or cache load fails
   */
  async loadTVACache(maxWaitMs = 30000) {
    // Fast path: already loaded
    if (this.tvaCacheLoaded) return true;

    // Promise deduplication: join in-progress load
    if (this._loadPromise) {
      this._logger.log('Cache load already in progress, joining existing promise');
      return this._loadPromise;
    }

    if (!this.hasTVA || !this.tvaAPI) {
      this._logger.log('TVA not available, cannot load cache');
      throw ModuleError.of('tva_missing', 'Token Variant Art module is not installed or enabled', [
        'install_tva',
        'check_console',
      ]);
    }

    // Assign _loadPromise BEFORE the first await (the caching poll) so concurrent callers
    // join this same promise instead of each running their own polling loop.
    this._loadPromise = (async () => {
      // Wait for TVA to finish caching if it's in progress
      const isCaching = this.tvaAPI.isCaching;
      if (typeof isCaching === 'function') {
        const startWait = Date.now();
        while (isCaching() && Date.now() - startWait < maxWaitMs) {
          this._logger.log(
            `Waiting for TVA to finish caching... (${Date.now() - startWait}ms elapsed)`
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (isCaching()) {
          this._logger.log(`TVA still caching after ${maxWaitMs}ms, proceeding anyway`);
          // Throw error instead of proceeding - cache likely not ready
          throw ModuleError.of(
            'tva_still_caching',
            `Token Variant Art still caching after ${maxWaitMs}ms timeout`,
            ['wait_for_cache', 'reload_module']
          );
        } else {
          this._logger.log('TVA caching complete, loading cache directly');
        }
      }

      return this._loadTVACacheFromFile();
    })().finally(() => {
      this._loadPromise = null;
    });
    return this._loadPromise;
  }

  /**
   * Internal: Load TVA's static cache file directly for fast access
   * This bypasses doImageSearch and Fuse.js for maximum performance
   * @returns {Promise<boolean>} True if loaded successfully
   * @throws {Object} Structured error if cache cannot be loaded
   */
  async _loadTVACacheFromFile() {
    if (this.tvaCacheLoaded) {
      this._logger.log('TVA cache already loaded, skipping');
      return true;
    }

    try {
      const tvaConfig = this.tvaAPI?.TVA_CONFIG;
      if (!tvaConfig) {
        this._logger.log('TVA_CONFIG not accessible');
        throw ModuleError.of(
          'cache_load_failed',
          'TVA_CONFIG not accessible - TVA API may not be fully initialized',
          ['reload_module', 'check_console']
        );
      }

      // Check if static cache is enabled
      if (!tvaConfig.staticCache) {
        this._logger.log('TVA static cache is disabled in settings');
        throw ModuleError.of(
          'tva_cache_disabled',
          'TVA static cache is disabled in Token Variant Art settings',
          ['enable_static_cache', 'rebuild_cache']
        );
      }

      const staticCacheFile = tvaConfig.staticCacheFile;
      if (!staticCacheFile) {
        this._logger.log('No static cache file configured in TVA');
        throw ModuleError.of(
          'cache_load_failed',
          'No static cache file path configured in Token Variant Art',
          ['rebuild_cache', 'enable_static_cache']
        );
      }

      // Try restoring from IndexedDB first (skips fetch + parse entirely)
      const cached = await this._repository.restore(staticCacheFile);
      if (cached) {
        this.tvaCacheByCategory = cached.byCategory;
        this.tvaCacheImages = cached.images;
        await this._buildSearchableCache();
        this.tvaCacheLoaded = true;
        const categories = Object.keys(this.tvaCacheByCategory).length;
        this._logger.log(
          `TVA cache restored from IndexedDB: ${this.tvaCacheImages.length} images (${this.tvaCacheSearchable.length} searchable) in ${categories} categories`
        );
        console.log(
          `${MODULE_ID} | TVA cache restored from IndexedDB: ${this.tvaCacheImages.length} images (${this.tvaCacheSearchable.length} searchable) in ${categories} categories`
        );
        return true;
      }

      // IndexedDB miss — full fetch + parse
      this._logger.log(`Loading TVA cache from file: ${staticCacheFile}`);

      // Validate cache file path: must be relative or same-origin
      if (staticCacheFile.startsWith('//') || /^[a-z]+:/i.test(staticCacheFile)) {
        try {
          const cacheUrl = new URL(staticCacheFile, globalThis.location?.origin);
          if (globalThis.location && cacheUrl.origin !== globalThis.location.origin) {
            throw ModuleError.of(
              'invalid_cache_path',
              `TVA cache file URL points to external origin: ${cacheUrl.origin}`,
              ['check_tva_config', 'rebuild_cache']
            );
          }
        } catch (urlError) {
          if (urlError.errorType === 'invalid_cache_path') throw urlError;
          // Malformed URL — reject
          throw ModuleError.of(
            'invalid_cache_path',
            `Invalid TVA cache file path: ${staticCacheFile}`,
            ['check_tva_config', 'rebuild_cache']
          );
        }
      }

      const response = await fetch(staticCacheFile, { credentials: 'omit' });
      if (!response.ok) {
        this._logger.log(`Failed to load TVA cache file: HTTP ${response.status}`);
        throw ModuleError.of(
          'network_error',
          `Failed to fetch TVA cache file: HTTP ${response.status} ${response.statusText}`,
          ['check_network', 'rebuild_cache', 'check_file_access']
        );
      }

      // Capture headers for IndexedDB invalidation metadata
      const lastModified = response.headers.get('Last-Modified') || '';
      const contentLength = parseInt(response.headers.get('Content-Length') || '0');

      let json;
      try {
        json = await response.json();
      } catch (parseError) {
        this._logger.log('Failed to parse TVA cache JSON:', parseError);
        throw ModuleError.of(
          'cache_load_failed',
          `Invalid JSON in TVA cache file: ${parseError.message}`,
          ['rebuild_cache', 'check_console']
        );
      }

      // Validate cache structure
      if (!json || typeof json !== 'object') {
        this._logger.log('TVA cache file contains invalid data structure');
        throw ModuleError.of(
          'cache_load_failed',
          'TVA cache file contains invalid data structure (not an object)',
          ['rebuild_cache']
        );
      }

      const parsed = await this._parser.parse(json);
      this.tvaCacheByCategory = parsed.byCategory;
      this.tvaCacheImages = parsed.images;
      if (parsed.skipped > 0) {
        console.warn(
          `${MODULE_ID} | Skipped ${parsed.skipped} malformed entries in the TVA cache file`
        );
      }

      // Check if cache is empty
      if (this.tvaCacheImages.length === 0) {
        this._logger.log('TVA cache loaded but contains no images');
        throw ModuleError.of(
          'tva_cache_empty',
          'TVA cache file loaded successfully but contains no images',
          ['rebuild_cache', 'check_paths']
        );
      }

      await this._buildSearchableCache();
      this.tvaCacheLoaded = true;
      const categories = Object.keys(this.tvaCacheByCategory).length;
      this._logger.log(
        `TVA cache parsed from file: ${this.tvaCacheImages.length} images (${this.tvaCacheSearchable.length} searchable) in ${categories} categories`
      );
      console.log(
        `${MODULE_ID} | TVA cache parsed from file: ${this.tvaCacheImages.length} images (${this.tvaCacheSearchable.length} searchable) in ${categories} categories`
      );

      // Save for next startup (fire-and-forget: the repository never rejects)
      this._repository.save(this.tvaCacheImages, this.tvaCacheByCategory, {
        cacheFilePath: staticCacheFile,
        lastModified,
        contentLength,
      });

      return true;
    } catch (error) {
      // If it's already a structured error, re-throw it
      if (error.errorType && error.message && error.recoverySuggestions) {
        throw error;
      }

      // Otherwise, wrap unexpected errors
      this._logger.log('Unexpected error loading TVA cache:', error);
      throw ModuleError.of(
        'unknown',
        `Unexpected error loading TVA cache: ${error.message || String(error)}`,
        ['check_console', 'reload_module', 'contact_support']
      );
    }
  }

  /**
   * Force reload of TVA cache (use after TVA cache refresh)
   * @returns {Promise<boolean>} True if reloaded successfully
   * @throws {Object} Structured error if reload fails
   */
  async reloadTVACache() {
    this._logger.log('Reloading TVA cache...');
    // loadTVACache() joins a load already in flight, which would hand back the
    // very data this reload exists to replace. Let it finish first.
    if (this._loadPromise) {
      await this._loadPromise.catch((error) => {
        console.debug(`${MODULE_ID} | Earlier TVA cache load failed before reload:`, error);
      });
    }
    this.tvaCacheLoaded = false;
    this.tvaCacheImages = [];
    this.tvaCacheSearchable = [];
    this.tvaCacheByCategory = {};
    this._categoryCache.clear();
    this._pathFilter.clearCache();
    // Drop the saved copy so the load below fetches and parses the file afresh
    await this._repository.remove();

    try {
      const result = await this.loadTVACache();
      this._logger.log('TVA cache reloaded successfully');
      return result;
    } catch (error) {
      this._logger.log('Failed to reload TVA cache:', error);
      throw error;
    }
  }

  /**
   * Search TVA cache directly using simple string matching (FAST)
   * @param {string} searchTerm - Term to search
   * @returns {Promise<Array>} Matching images
   */
  async searchTVACacheDirect(searchTerm) {
    if (!this.tvaCacheLoaded) {
      this._logger.log('Cannot search: TVA cache not loaded');
      return [];
    }

    if (!searchTerm) {
      this._logger.log('Cannot search: empty search term');
      return [];
    }

    this._logger.log(`Searching TVA cache for: "${searchTerm}"`);
    const startTime = Date.now();

    const termLower = searchTerm.toLowerCase();
    const results = [];

    for (const img of this.tvaCacheSearchable) {
      const nameLower = img._nameLower ?? (img.name || '').toLowerCase();
      const pathLower = img._pathLower ?? (img.path || '').toLowerCase();

      if (nameLower.includes(termLower) || pathLower.includes(termLower)) {
        results.push({
          path: img.path,
          name: img.name,
          category: img.category,
          tags: img.tags,
          source: 'tva-direct',
          score: nameLower === termLower ? 0 : nameLower.startsWith(termLower) ? 0.1 : 0.3,
        });
      }
    }

    // Sort by score (exact matches first)
    results.sort((a, b) => a.score - b.score);

    const elapsed = Date.now() - startTime;
    this._logger.log(`Search completed in ${elapsed}ms: ${results.length} matches found`);

    return results;
  }

  /**
   * Search TVA cache by category (FAST)
   * Only matches on image name and meaningful path segments, not TVA folder category
   * @param {string} categoryType - Creature type category
   * @returns {Promise<Array>} Matching images
   */
  async searchTVACacheByCategory(categoryType) {
    if (!this.tvaCacheLoaded) {
      this._logger.log('Cannot search by category: TVA cache not loaded');
      return [];
    }

    if (!categoryType) {
      this._logger.log('Cannot search by category: empty category type');
      return [];
    }

    const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType.toLowerCase()] || [];
    if (categoryTerms.length === 0) {
      this._logger.log(`No category mapping found for: "${categoryType}"`);
      return [];
    }

    this._logger.log(
      `Searching TVA cache by category: "${categoryType}" (${categoryTerms.length} terms)`
    );
    const startTime = Date.now();

    const categoryKey = categoryType.toLowerCase();

    // Pre-built lookup is O(1); a scan only happens before any build (tests, partial state)
    const built = this._categoryCache.isBuilt;
    const matches = built
      ? this._categoryCache.get(categoryKey)
      : this._categoryCache.scan(this.tvaCacheSearchable, categoryKey);
    const results = matches.map((img) => ({
      path: img.path,
      name: img.name,
      category: img.category,
      tags: img.tags,
      source: 'tva-direct',
      score: 0.3,
    }));

    const elapsed = Date.now() - startTime;
    this._logger.log(
      `Category search completed in ${elapsed}ms: ${results.length} matches (${built ? 'cached' : 'scanned'})`
    );
    return results;
  }

  /**
   * Search TVA cache for multiple terms (OR logic) - FAST
   * @param {string[]} searchTerms - Terms to search (any match)
   * @returns {Promise<Array>} Matching images
   */
  async searchTVACacheMultiple(searchTerms) {
    if (!this.tvaCacheLoaded) {
      this._logger.log('Cannot search multiple terms: TVA cache not loaded');
      return [];
    }

    if (!searchTerms || searchTerms.length === 0) {
      this._logger.log('Cannot search multiple terms: empty search terms array');
      return [];
    }

    this._logger.log(
      `Searching TVA cache for ${searchTerms.length} terms: [${searchTerms.join(', ')}]`
    );
    const startTime = Date.now();

    const termsLower = searchTerms.map((t) => t.toLowerCase());
    const results = [];
    const seenPaths = new Set();

    for (const img of this.tvaCacheSearchable) {
      if (seenPaths.has(img.path)) continue;

      const nameLower = img._nameLower ?? (img.name || '').toLowerCase();
      const pathLower = img._pathLower ?? (img.path || '').toLowerCase();

      // Check if matches ANY term (OR logic)
      const matchedTerm = termsLower.find(
        (term) => nameLower.includes(term) || pathLower.includes(term)
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
          matchedTerm,
        });
      }
    }

    // Sort by score
    results.sort((a, b) => a.score - b.score);

    const elapsed = Date.now() - startTime;
    this._logger.log(
      `Multiple term search completed in ${elapsed}ms: ${results.length} matches found`
    );

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
   * @returns {{loaded: boolean, totalImages: number, categories: number}}
   */
  getTVACacheStats() {
    const stats = {
      loaded: this.tvaCacheLoaded,
      totalImages: this.tvaCacheImages.length,
      categories: Object.keys(this.tvaCacheByCategory).length,
    };

    this._logger.log('Cache stats:', stats);
    return stats;
  }
}

// Export singleton instance
export const tvaCacheService = new TVACacheService();
