/**
 * Token Replacer FA - Search Service
 * Handles all search operations: TVA, local index, and category-based
 * @module services/SearchService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, PRIMARY_CATEGORY_TERMS } from '../core/Constants.js';
import {
  loadFuse,
  parseSubtypeTerms,
  hasGenericSubtype,
  getCreatureCacheKey,
  yieldToMain,
  extractPathFromTVAResult,
  extractNameFromTVAResult
} from '../core/Utils.js';

/**
 * SearchService class for handling search operations
 */
export class SearchService {
  constructor() {
    this.searchCache = new Map();
    this.tvaAPI = null;
    this.hasTVA = false;
  }

  /**
   * Initialize the search service
   */
  init() {
    this.tvaAPI = game.modules.get('token-variants')?.api;
    this.hasTVA = !!this.tvaAPI;
    console.log(`${MODULE_ID} | SearchService initialized. TVA available: ${this.hasTVA}`);
  }

  /**
   * Clear the search cache
   */
  clearCache() {
    this.searchCache.clear();
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
   * @param {string} searchTerm - Term to search
   * @returns {Promise<Array>} Search results
   */
  async searchTVA(searchTerm) {
    if (!this.hasTVA || !this.tvaAPI) return [];

    try {
      const results = [];
      const seenPaths = new Set(); // Use Set for O(1) duplicate check
      const searchResults = await this.tvaAPI.doImageSearch(searchTerm, {
        searchType: 'Portrait',
        simpleResults: false
      });

      // Handle various TVA return formats (array, object, Map)
      if (!searchResults) return [];

      const items = Array.isArray(searchResults)
        ? searchResults
        : (searchResults instanceof Map ? Array.from(searchResults.values()) : [searchResults]);

      if (items.length === 0) return [];

      for (const item of items) {
        const imagePath = extractPathFromTVAResult(item);
        if (!imagePath || seenPaths.has(imagePath)) continue;

        seenPaths.add(imagePath);
        const name = extractNameFromTVAResult(item, imagePath);
        results.push({
          path: imagePath,
          name: name,
          source: 'tva',
          score: item?.score ?? 0.5
        });
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
        if (!seenPaths.has(item.path)) {
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
    }

    return results;
  }

  /**
   * Search by creature type category
   * @param {string} categoryType - Creature type category
   * @param {Array} localIndex - Local image index
   * @param {string} directSearchTerm - Optional direct search term
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  async searchByCategory(categoryType, localIndex, directSearchTerm = null, progressCallback = null) {
    console.log(`${MODULE_ID} | searchByCategory START - type: ${categoryType}, directSearch: ${directSearchTerm}`);
    const results = [];
    const seenPaths = new Set(); // Use Set for O(1) duplicate check

    // Direct search term mode
    if (directSearchTerm) {
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: directSearchTerm, resultsFound: 0 });
      }

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
          img.name?.toLowerCase().includes(termLower) ||
          img.fileName?.toLowerCase().includes(termLower) ||
          img.category?.toLowerCase().includes(termLower)
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

      if (results.length > 0) {
        return results.slice(0, 50);
      }
    }

    // Category-based comprehensive search
    console.log(`${MODULE_ID} | Starting comprehensive search for category: ${categoryType}`);

    if (this.hasTVA) {
      const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType?.toLowerCase()];

      if (categoryTerms) {
        console.log(`${MODULE_ID} | Searching ${categoryTerms.length} terms for ${categoryType}`);
        const totalTerms = categoryTerms.length;
        let searchCount = 0;

        for (const term of categoryTerms) {
          searchCount++;

          if (progressCallback) {
            progressCallback({
              current: searchCount,
              total: totalTerms,
              term: term,
              resultsFound: results.length
            });
          }

          if (searchCount % 10 === 0 || searchCount === totalTerms) {
            console.log(`${MODULE_ID} | Search progress: ${searchCount}/${totalTerms} terms, ${results.length} results`);
          }

          const tvaResults = await this.searchTVA(term);
          for (const result of tvaResults) {
            if (!seenPaths.has(result.path)) {
              seenPaths.add(result.path);
              results.push(result);
            }
          }

          if (searchCount % 3 === 0) {
            await yieldToMain(5);
          }
        }
      } else {
        // Fallback to primary terms
        const primaryTerms = PRIMARY_CATEGORY_TERMS[categoryType?.toLowerCase()];
        if (primaryTerms) {
          console.log(`${MODULE_ID} | No full mapping, using ${primaryTerms.length} primary terms`);
          const totalTerms = primaryTerms.length;
          let searchCount = 0;

          for (const term of primaryTerms) {
            searchCount++;
            if (progressCallback) {
              progressCallback({
                current: searchCount,
                total: totalTerms,
                term: term,
                resultsFound: results.length
              });
            }

            const tvaResults = await this.searchTVA(term);
            for (const result of tvaResults) {
              if (!seenPaths.has(result.path)) {
                seenPaths.add(result.path);
                results.push(result);
              }
            }
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
    const useTVAForAll = this.hasTVA && useTVACache;

    // Check for specific subtypes requiring AND logic
    const isGenericSubtype = hasGenericSubtype(creatureInfo.subtype);
    const subtypeTerms = parseSubtypeTerms(creatureInfo.subtype);
    const hasSpecificSubtypes = subtypeTerms.length > 0 && !isGenericSubtype && creatureInfo.type;

    // Case: Specific subtypes with AND logic
    if (hasSpecificSubtypes) {
      console.log(`${MODULE_ID} | AND Logic Mode: "${creatureInfo.type}" with subtypes (${subtypeTerms.join(', ')})`);
      console.log(`${MODULE_ID} | Logic: (${creatureInfo.type}) AND (${subtypeTerms.join(' AND ')})`);

      const categoryResults = await this.searchByCategory(creatureInfo.type, localIndex);
      console.log(`${MODULE_ID} | Category "${creatureInfo.type}" returned ${categoryResults.length} results`);

      // Filter by ALL subtype terms (AND logic)
      const filteredResults = categoryResults.filter(result => {
        const nameLower = (result.name || '').toLowerCase();
        const pathLower = (result.path || '').toLowerCase();
        const combinedText = nameLower + ' ' + pathLower;
        return subtypeTerms.every(term => combinedText.includes(term));
      });

      console.log(`${MODULE_ID} | After AND filter: ${filteredResults.length} results match (${subtypeTerms.join(' AND ')})`);

      for (const result of filteredResults) {
        results.push({
          ...result,
          score: result.score ?? 0.3,
          fromSubtype: true
        });
      }

      this.searchCache.set(cacheKey, results);
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

    if (this.hasTVA && (useTVAForAll || priority === 'forgeBazaar' || priority === 'both')) {
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
    if (isGenericSubtype && creatureInfo.type) {
      console.log(`${MODULE_ID} | Generic subtype mode for ${creatureInfo.type}`);
      const categoryResults = await this.searchByCategory(creatureInfo.type, localIndex);

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

      if (localIndex?.length > 0) {
        const categoryMatches = localIndex.filter(img =>
          img.category && this.folderMatchesCreatureType(img.category, creatureInfo.type)
        );
        for (const match of categoryMatches) {
          if (!seenPaths.has(match.path)) {
            seenPaths.add(match.path);
            results.push({
              ...match,
              source: 'local',
              score: match.score ?? 0.6,
              fromCategory: true
            });
          }
        }
      }
    }

    // Filter and sort results
    const validResults = results.filter(r => {
      if (!r.path || typeof r.path !== 'string') return false;
      return r.path.includes('/') || r.path.includes('.') || r.path.startsWith('http');
    });

    validResults.sort((a, b) => {
      const aIsSubtype = a.fromSubtype === true;
      const bIsSubtype = b.fromSubtype === true;
      const aIsCategory = a.fromCategory === true;
      const bIsCategory = b.fromCategory === true;
      const aIsName = !aIsSubtype && !aIsCategory;
      const bIsName = !bIsSubtype && !bIsCategory;

      if (aIsName && !bIsName) return -1;
      if (!aIsName && bIsName) return 1;
      if (aIsSubtype && bIsCategory) return -1;
      if (aIsCategory && bIsSubtype) return 1;

      if (priority === 'faNexus') {
        if (a.source === 'local' && b.source !== 'local') return -1;
        if (a.source !== 'local' && b.source === 'local') return 1;
      } else if (priority === 'forgeBazaar') {
        if (a.source === 'tva' && b.source !== 'tva') return -1;
        if (a.source !== 'tva' && b.source === 'tva') return 1;
      }

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
    const MAX_CONCURRENT = 4;

    for (let i = 0; i < groupArray.length; i += MAX_CONCURRENT) {
      const batch = groupArray.slice(i, i + MAX_CONCURRENT);

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
export const searchService = new SearchService();
