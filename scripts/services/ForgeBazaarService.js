/**
 * Token Replacer FA - Forge Bazaar Service (STUB)
 *
 * ⚠️ IMPORTANT: This is a stub implementation based on investigation findings.
 *
 * FEASIBILITY ASSESSMENT (Phase 1 - Completed 2026-02-14):
 * ❌ NO-GO DECISION: Direct Forge Bazaar API integration is NOT FEASIBLE
 *
 * INVESTIGATION FINDINGS:
 * 1. No public Forge Bazaar API exists for browsing/searching tokens
 * 2. ForgeVTT module API requires user authentication (API keys)
 * 3. Forge REST API is semi-public with no asset discovery endpoints
 * 4. Current TVA cache integration is the optimal solution (fast, no auth)
 *
 * RECOMMENDATION: Use existing TVA integration instead
 * See: ./.auto-claude/specs/009-direct-forge-bazaar-api-integration/FEASIBILITY.md
 *
 * This stub exists to:
 * - Document investigation findings
 * - Provide structure for future implementation if API becomes available
 * - Satisfy build system requirements for Phase 2 skeleton
 *
 * @module services/ForgeBazaarService
 */

import { MODULE_ID } from '../core/Constants.js';

const CACHE_KEY = 'token-replacer-fa-bazaar-cache';
const CACHE_VERSION = 1;
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for search results
const CATEGORY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours for category results

/**
 * ForgeBazaarService - Stub for potential future Forge Bazaar API integration
 *
 * NOTE: This service is not functional due to lack of public API.
 * All methods return empty results or throw not-implemented errors.
 */
export class ForgeBazaarService {
  constructor() {
    this.isAvailable = false;
    this.hasForgeVTT = false;
    this.forgeAPI = null;

    // In-memory cache for fast access (loaded from localStorage)
    this.categoryCache = {}; // { category: { timestamp, results: [] } }
    this.searchCache = new Map(); // Map<searchTerm, { timestamp, results: [] }>
    this.cacheLoaded = false;
  }

  /**
   * Initialize the Forge Bazaar service
   * Checks for ForgeVTT module availability and loads cache
   */
  init() {
    // Check if ForgeVTT module is installed
    const forgeModule = game.modules.get('forge-vtt');
    this.hasForgeVTT = forgeModule?.active || false;

    // Check for game.forge API (only available on Forge-hosted games or with API key)
    this.forgeAPI = game.forge || null;

    // Service is only "available" if we have API access
    // Note: Even with ForgeVTT, we cannot browse Bazaar without authentication
    this.isAvailable = false; // Always false - no public API available

    // Load cache from localStorage
    this.loadCache();

    console.log(`${MODULE_ID} | ForgeBazaarService initialized (STUB)`);
    console.log(`${MODULE_ID} | ForgeVTT module: ${this.hasForgeVTT ? 'installed' : 'not found'}`);
    console.log(`${MODULE_ID} | game.forge API: ${this.forgeAPI ? 'available' : 'not available'}`);
    console.log(`${MODULE_ID} | ⚠️ Direct Bazaar browsing API not available - use TVA integration instead`);
  }

  /**
   * Load cache from localStorage
   * @returns {boolean} True if cache loaded successfully
   */
  loadCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) {
        this.cacheLoaded = false;
        return false;
      }

      const data = JSON.parse(cached);

      // Version check
      if (data.version !== CACHE_VERSION) {
        console.log(`${MODULE_ID} | Bazaar cache version mismatch, clearing`);
        localStorage.removeItem(CACHE_KEY);
        this.cacheLoaded = false;
        return false;
      }

      // Load category cache
      this.categoryCache = data.categoryCache || {};

      // Clear expired category entries
      const now = Date.now();
      for (const [category, entry] of Object.entries(this.categoryCache)) {
        if (!entry.timestamp || (now - entry.timestamp) > CATEGORY_CACHE_TTL) {
          delete this.categoryCache[category];
        }
      }

      this.cacheLoaded = true;
      const validCategories = Object.keys(this.categoryCache).length;
      console.log(`${MODULE_ID} | Loaded Bazaar cache from localStorage: ${validCategories} categories`);
      return true;

    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to load Bazaar cache:`, error);
      localStorage.removeItem(CACHE_KEY);
      this.cacheLoaded = false;
      return false;
    }
  }

  /**
   * Save cache to localStorage
   * Only persists category cache (search cache is transient)
   * @returns {boolean} True if saved successfully
   */
  saveCache() {
    try {
      const cacheData = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        categoryCache: this.categoryCache
      };

      const json = JSON.stringify(cacheData);

      // Check size limit (~4.5MB for localStorage, same as IndexService)
      if (json.length > 4.5 * 1024 * 1024) {
        console.warn(`${MODULE_ID} | Bazaar cache too large for localStorage (${(json.length / 1024 / 1024).toFixed(1)}MB)`);
        return false;
      }

      localStorage.setItem(CACHE_KEY, json);
      console.log(`${MODULE_ID} | Saved Bazaar cache to localStorage (${(json.length / 1024).toFixed(0)}KB)`);
      return true;

    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to save Bazaar cache:`, error);
      return false;
    }
  }

  /**
   * Check if a category result is cached and still valid
   * @param {string} category - Category name
   * @returns {boolean} True if valid cached result exists
   */
  isCategoryCached(category) {
    const entry = this.categoryCache[category];
    if (!entry || !entry.timestamp) return false;

    const age = Date.now() - entry.timestamp;
    return age < CATEGORY_CACHE_TTL;
  }

  /**
   * Check if a search result is cached and still valid
   * @param {string} searchTerm - Search term
   * @returns {boolean} True if valid cached result exists
   */
  isSearchCached(searchTerm) {
    const entry = this.searchCache.get(searchTerm);
    if (!entry || !entry.timestamp) return false;

    const age = Date.now() - entry.timestamp;
    return age < SEARCH_CACHE_TTL;
  }

  /**
   * Get cached category results if available and valid
   * @param {string} category - Category name
   * @returns {Array|null} Cached results or null if not cached/expired
   */
  getCachedCategory(category) {
    if (!this.isCategoryCached(category)) return null;
    return this.categoryCache[category].results || [];
  }

  /**
   * Get cached search results if available and valid
   * @param {string} searchTerm - Search term
   * @returns {Array|null} Cached results or null if not cached/expired
   */
  getCachedSearch(searchTerm) {
    if (!this.isSearchCached(searchTerm)) return null;
    const entry = this.searchCache.get(searchTerm);
    return entry?.results || [];
  }

  /**
   * Cache category browse results
   * @param {string} category - Category name
   * @param {Array} results - Results to cache
   */
  cacheCategory(category, results) {
    this.categoryCache[category] = {
      timestamp: Date.now(),
      results: results || []
    };

    // Persist to localStorage (async to avoid blocking)
    setTimeout(() => this.saveCache(), 100);
  }

  /**
   * Cache search results (in-memory only, not persisted)
   * @param {string} searchTerm - Search term
   * @param {Array} results - Results to cache
   */
  cacheSearch(searchTerm, results) {
    this.searchCache.set(searchTerm, {
      timestamp: Date.now(),
      results: results || []
    });
  }

  /**
   * Check if the Forge Bazaar service is available and functional
   * @returns {boolean} Always false - no public API available
   */
  isServiceAvailable() {
    return this.isAvailable;
  }

  /**
   * Browse Forge Bazaar tokens by category
   *
   * STUB: Not implemented - no public API available
   * Demonstrates caching pattern for when API becomes available
   *
   * @param {string} category - Category to browse (e.g., "undead", "humanoid")
   * @returns {Promise<Array>} Cached results if available, otherwise empty array
   */
  async browseCategory(category) {
    // Check cache first (fast path)
    const cached = this.getCachedCategory(category);
    if (cached !== null) {
      console.log(`${MODULE_ID} | ForgeBazaarService.browseCategory('${category}'): Using cache (${cached.length} results)`);
      return cached;
    }

    if (!this.isAvailable) {
      console.warn(`${MODULE_ID} | ForgeBazaarService.browseCategory: Service not available`);
      return [];
    }

    // FUTURE IMPLEMENTATION PLACEHOLDER
    // If Forge Bazaar API becomes available, implement:
    // 1. Map creature category to Bazaar package/tags
    // 2. Call Forge API endpoint to list tokens
    // 3. Parse and normalize results
    // 4. Cache results using this.cacheCategory(category, results)

    console.warn(`${MODULE_ID} | ForgeBazaarService.browseCategory('${category}'): Not implemented - no public API`);

    // Cache the empty result to avoid repeated warnings
    this.cacheCategory(category, []);
    return [];
  }

  /**
   * Search Forge Bazaar tokens by term
   *
   * STUB: Not implemented - no public API available
   * Demonstrates caching pattern for when API becomes available
   *
   * @param {string} searchTerm - Term to search for
   * @returns {Promise<Array>} Cached results if available, otherwise empty array
   */
  async search(searchTerm) {
    // Check cache first (fast path)
    const cached = this.getCachedSearch(searchTerm);
    if (cached !== null) {
      console.log(`${MODULE_ID} | ForgeBazaarService.search('${searchTerm}'): Using cache (${cached.length} results)`);
      return cached;
    }

    if (!this.isAvailable) {
      console.warn(`${MODULE_ID} | ForgeBazaarService.search: Service not available`);
      return [];
    }

    // FUTURE IMPLEMENTATION PLACEHOLDER
    // If Forge Bazaar API becomes available, implement:
    // 1. Call Forge search endpoint with term
    // 2. Filter results to FA content only
    // 3. Parse and normalize results
    // 4. Cache results using this.cacheSearch(searchTerm, results)

    console.warn(`${MODULE_ID} | ForgeBazaarService.search('${searchTerm}'): Not implemented - no public API`);

    // Cache the empty result to avoid repeated warnings (5 min TTL)
    this.cacheSearch(searchTerm, []);
    return [];
  }

  /**
   * Get all available tokens from Forge Bazaar
   *
   * STUB: Not implemented - no public API available
   *
   * @returns {Promise<Array>} Empty array (no implementation)
   */
  async getAllTokens() {
    if (!this.isAvailable) {
      console.warn(`${MODULE_ID} | ForgeBazaarService.getAllTokens: Service not available`);
      return [];
    }

    // FUTURE IMPLEMENTATION PLACEHOLDER
    // If Forge Bazaar API becomes available, implement:
    // 1. List all FA packages in Bazaar
    // 2. Recursively fetch all token paths
    // 3. Build comprehensive index
    // 4. Cache locally for fast access

    console.warn(`${MODULE_ID} | ForgeBazaarService.getAllTokens: Not implemented - no public API`);
    return [];
  }

  /**
   * Clear all caches (both memory and localStorage)
   */
  clearCache() {
    this.categoryCache = {};
    this.searchCache.clear();
    this.cacheLoaded = false;
    localStorage.removeItem(CACHE_KEY);
    console.log(`${MODULE_ID} | ForgeBazaarService cache cleared`);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats including TTL info
   */
  getCacheStats() {
    const now = Date.now();
    let validCategories = 0;
    let expiredCategories = 0;

    for (const [category, entry] of Object.entries(this.categoryCache)) {
      if (entry.timestamp && (now - entry.timestamp) < CATEGORY_CACHE_TTL) {
        validCategories++;
      } else {
        expiredCategories++;
      }
    }

    let validSearches = 0;
    let expiredSearches = 0;

    for (const [term, entry] of this.searchCache.entries()) {
      if (entry.timestamp && (now - entry.timestamp) < SEARCH_CACHE_TTL) {
        validSearches++;
      } else {
        expiredSearches++;
      }
    }

    return {
      cacheLoaded: this.cacheLoaded,
      isAvailable: this.isAvailable,
      categoryCache: {
        valid: validCategories,
        expired: expiredCategories,
        ttl: `${CATEGORY_CACHE_TTL / 1000 / 60 / 60}h`
      },
      searchCache: {
        valid: validSearches,
        expired: expiredSearches,
        ttl: `${SEARCH_CACHE_TTL / 1000 / 60}min`
      }
    };
  }
}

/**
 * IMPLEMENTATION NOTES FOR FUTURE DEVELOPMENT
 *
 * If The Forge releases a public Bazaar API in the future, implement:
 *
 * 1. Authentication Handling:
 *    - Check for game.forge API (Forge-hosted games)
 *    - Support optional API key for non-Forge games (via module settings)
 *    - Gracefully handle authentication failures
 *
 * 2. API Endpoints to Implement:
 *    - GET /bazaar/packages - List available packages
 *    - GET /bazaar/packages/{id}/assets - List package assets
 *    - GET /bazaar/search?q={term} - Search across packages
 *    - GET /bazaar/categories/{category} - Browse by category
 *
 * 3. Response Normalization:
 *    - Convert Forge asset format to token-replacer-fa format:
 *      { path, name, category, tags, source: 'forge-bazaar' }
 *    - Handle CDN URLs: https://assets.forge-vtt.com/bazaar/assets/{package}/{path}
 *
 * 4. Caching Strategy:
 *    - Cache category results in memory (Map)
 *    - Cache search results with TTL (e.g., 5 minutes)
 *    - Persist full index to localStorage (similar to IndexService)
 *    - Implement cache invalidation on user request
 *
 * 5. Error Handling:
 *    - Network errors (offline mode)
 *    - Authentication errors (invalid API key)
 *    - Rate limiting (implement exponential backoff)
 *    - Empty results (no content found)
 *
 * 6. Integration Points:
 *    - SearchService.js - Add as fallback when TVA unavailable
 *    - SearchOrchestrator.js - Add to search priority chain
 *    - main.js - Initialize during module init
 *    - Settings.js - Add API key configuration option
 *
 * 7. Testing:
 *    - Unit tests for API client methods
 *    - Integration tests with mock Forge API
 *    - E2E tests with TVA disabled
 *    - Performance tests for large result sets
 */
