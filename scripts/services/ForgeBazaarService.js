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

    // Cache for potential future implementation
    this.cache = {
      categories: {},
      searchResults: new Map(),
      lastUpdate: null
    };
  }

  /**
   * Initialize the Forge Bazaar service
   * Checks for ForgeVTT module availability
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

    console.log(`${MODULE_ID} | ForgeBazaarService initialized (STUB)`);
    console.log(`${MODULE_ID} | ForgeVTT module: ${this.hasForgeVTT ? 'installed' : 'not found'}`);
    console.log(`${MODULE_ID} | game.forge API: ${this.forgeAPI ? 'available' : 'not available'}`);
    console.log(`${MODULE_ID} | ⚠️ Direct Bazaar browsing API not available - use TVA integration instead`);
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
   *
   * @param {string} category - Category to browse (e.g., "undead", "humanoid")
   * @returns {Promise<Array>} Empty array (no implementation)
   */
  async browseCategory(category) {
    if (!this.isAvailable) {
      console.warn(`${MODULE_ID} | ForgeBazaarService.browseCategory: Service not available`);
      return [];
    }

    // FUTURE IMPLEMENTATION PLACEHOLDER
    // If Forge Bazaar API becomes available, implement:
    // 1. Map creature category to Bazaar package/tags
    // 2. Call Forge API endpoint to list tokens
    // 3. Parse and normalize results
    // 4. Cache results locally

    console.warn(`${MODULE_ID} | ForgeBazaarService.browseCategory('${category}'): Not implemented - no public API`);
    return [];
  }

  /**
   * Search Forge Bazaar tokens by term
   *
   * STUB: Not implemented - no public API available
   *
   * @param {string} searchTerm - Term to search for
   * @returns {Promise<Array>} Empty array (no implementation)
   */
  async search(searchTerm) {
    if (!this.isAvailable) {
      console.warn(`${MODULE_ID} | ForgeBazaarService.search: Service not available`);
      return [];
    }

    // FUTURE IMPLEMENTATION PLACEHOLDER
    // If Forge Bazaar API becomes available, implement:
    // 1. Call Forge search endpoint with term
    // 2. Filter results to FA content only
    // 3. Parse and normalize results
    // 4. Cache results locally

    console.warn(`${MODULE_ID} | ForgeBazaarService.search('${searchTerm}'): Not implemented - no public API`);
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
   * Clear local cache
   */
  clearCache() {
    this.cache.categories = {};
    this.cache.searchResults.clear();
    this.cache.lastUpdate = null;
    console.log(`${MODULE_ID} | ForgeBazaarService cache cleared`);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      categoriesCount: Object.keys(this.cache.categories).length,
      searchResultsCount: this.cache.searchResults.size,
      lastUpdate: this.cache.lastUpdate,
      isAvailable: this.isAvailable
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
