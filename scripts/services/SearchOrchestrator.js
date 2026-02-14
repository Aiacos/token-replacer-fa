/**
 * Token Replacer FA - Search Orchestrator
 * Handles complex search logic and result aggregation
 * @module services/SearchOrchestrator
 */

import { MODULE_ID, PARALLEL_BATCH_SIZE } from '../core/Constants.js';
import {
  parseSubtypeTerms,
  hasGenericSubtype,
  getCreatureCacheKey,
  isExcludedPath
} from '../core/Utils.js';
import { indexService } from './IndexService.js';

/**
 * SearchOrchestrator class for complex search orchestration
 * Handles searchTokenArt with all its subtype logic, result aggregation, and search coordination
 */
export class SearchOrchestrator {
  constructor() {
    this.searchCache = new Map();
    // Dependencies will be injected or accessed via imports
    this.searchService = null;
    this.tvaCacheService = null;
  }

  /**
   * Set dependencies for the orchestrator
   * @param {Object} searchService - SearchService instance
   * @param {Object} tvaCacheService - TVACacheService instance
   */
  setDependencies(searchService, tvaCacheService) {
    this.searchService = searchService;
    this.tvaCacheService = tvaCacheService;
  }

  /**
   * Clear the search cache
   */
  clearCache() {
    this.searchCache.clear();
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
    const useTVAForAll = this.searchService?.hasTVA && useTVACache;

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
      else if (this.tvaCacheService?.isTVACacheLoaded) {
        console.log(`${MODULE_ID} | Using TVA direct cache for subtype search (FAST mode)`);

        // First search for actor name (highest priority)
        if (creatureInfo.actorName) {
          const nameResults = this.tvaCacheService.searchTVACacheDirect(creatureInfo.actorName);
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
        const subtypeResults = this.tvaCacheService.searchTVACacheMultiple(subtypeTerms);
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
      else if (this.searchService?.hasTVA) {
        console.log(`${MODULE_ID} | Searching TVA for each subtype separately (SLOW mode - cache not loaded)`);

        // First search for actor name (highest priority)
        if (creatureInfo.actorName) {
          console.log(`${MODULE_ID} | Searching TVA for actor name: "${creatureInfo.actorName}"`);
          const nameResults = await this.searchService.searchTVA(creatureInfo.actorName);
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

          const tvaResults = await this.searchService.searchTVA(term);
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
      const localResults = await this.searchService.searchLocalIndex(searchTerms, localIndex, creatureInfo.type);
      for (const r of localResults) {
        seenPaths.add(r.path);
      }
      results.push(...localResults);
    }

    if (this.searchService?.hasTVA && (useTVAForAll || priority === 'forgeBazaar' || priority === 'both')) {
      for (const term of searchTerms) {
        const tvaResults = await this.searchService.searchTVA(term);
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
      const categoryResults = await this.searchService.searchByCategory(creatureInfo.type, localIndex);

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
export const searchOrchestrator = new SearchOrchestrator();
