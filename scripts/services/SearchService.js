/**
 * Token Replacer FA - Search Service
 * Handles all search operations using TVA's doImageSearch API
 * @module services/SearchService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, PRIMARY_CATEGORY_TERMS, EXCLUDED_FOLDERS } from '../core/Constants.js';
import {
  loadFuse,
  parseSubtypeTerms,
  hasGenericSubtype,
  getCreatureCacheKey,
  yieldToMain,
  extractPathFromTVAResult,
  extractNameFromTVAResult
} from '../core/Utils.js';
import { indexService } from './IndexService.js';

/**
 * SearchService class for handling search operations
 * Uses TVA's doImageSearch API directly for reliable results
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
   * Check if a path is from an excluded folder (assets, props, etc.)
   * @param {string} path - Image path to check
   * @returns {boolean} True if path should be excluded
   */
  isExcludedPath(path) {
    if (!path) return true;
    const pathLower = path.toLowerCase();
    return EXCLUDED_FOLDERS.some(folder => pathLower.includes(folder));
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
   * Uses TVA's doImageSearch API directly
   * @param {string} searchTerm - Term to search
   * @returns {Promise<Array>} Search results
   */
  async searchTVA(searchTerm) {
    if (!this.hasTVA || !this.tvaAPI) return [];

    try {
      const results = [];
      const seenPaths = new Set();
      const searchResults = await this.tvaAPI.doImageSearch(searchTerm, {
        searchType: 'Portrait',
        simpleResults: false
      });

      if (!searchResults) return [];

      // Helper function to process a single item
      const processItem = (item) => {
        const imagePath = extractPathFromTVAResult(item);
        // Skip if no path, already seen, or from excluded folder
        if (!imagePath || seenPaths.has(imagePath) || this.isExcludedPath(imagePath)) return;

        seenPaths.add(imagePath);
        const name = extractNameFromTVAResult(item, imagePath);
        results.push({
          path: imagePath,
          name: name,
          source: 'tva',
          score: item?.score ?? 0.5
        });
      };

      // Handle different TVA result formats
      if (Array.isArray(searchResults)) {
        // Direct array of results
        for (const item of searchResults) {
          processItem(item);
        }
      } else if (searchResults instanceof Map || (searchResults && typeof searchResults.entries === 'function')) {
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
            if (!seenPaths.has(key)) {
              seenPaths.add(key);
              results.push({
                path: key,
                name: extractNameFromTVAResult(data, key),
                source: 'tva',
                score: 0.5
              });
            }
          }
        }
      } else if (searchResults && typeof searchResults === 'object') {
        // Object with nested paths/images/results property
        const pathsArray = searchResults.paths || searchResults.images || searchResults.results || searchResults.data;
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
        // Skip if already seen or from excluded folder
        if (seenPaths.has(item.path) || this.isExcludedPath(item.path)) continue;

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

    return results;
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
  async searchByCategory(categoryType, localIndex, directSearchTerm = null, progressCallback = null) {
    console.log(`${MODULE_ID} | searchByCategory START - type: ${categoryType}, directSearch: ${directSearchTerm}`);
    const results = [];
    const seenPaths = new Set();

    // Direct search term mode
    if (directSearchTerm) {
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: directSearchTerm, resultsFound: 0 });
      }

      // Search TVA
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
          !this.isExcludedPath(img.path) && (
            img.name?.toLowerCase().includes(termLower) ||
            img.fileName?.toLowerCase().includes(termLower) ||
            img.category?.toLowerCase().includes(termLower) ||
            img.path?.toLowerCase().includes(termLower)
          )
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

      console.log(`${MODULE_ID} | Direct search for "${directSearchTerm}" found ${results.length} results`);
      return results;
    }

    // Category-based comprehensive search
    console.log(`${MODULE_ID} | Starting comprehensive search for category: ${categoryType}`);

    // Try FAST mode using pre-built index first
    if (indexService.isBuilt) {
      console.log(`${MODULE_ID} | Using pre-built index (FAST mode)`);
      if (progressCallback) {
        progressCallback({ current: 0, total: 1, term: 'index lookup', resultsFound: 0 });
      }

      const indexResults = indexService.searchByCategory(categoryType);
      for (const result of indexResults) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push({
            ...result,
            source: result.source || 'index'
          });
        }
      }

      if (progressCallback) {
        progressCallback({ current: 1, total: 1, term: 'index lookup', resultsFound: results.length });
      }

      console.log(`${MODULE_ID} | Index search found ${results.length} results (FAST mode)`);
    }
    // Fallback to SLOW mode - multiple TVA API calls
    else if (this.hasTVA) {
      const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType?.toLowerCase()];

      if (categoryTerms) {
        console.log(`${MODULE_ID} | Searching ${categoryTerms.length} terms for ${categoryType} (SLOW mode - index not built)`);
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
        !this.isExcludedPath(img.path) &&
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
        const indexResults = indexService.searchMultiple(subtypeTerms);
        console.log(`${MODULE_ID} | Index returned ${indexResults.length} results for subtypes`);

        for (const result of indexResults) {
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
      // Fallback to SLOW mode - TVA API calls
      else {
        console.log(`${MODULE_ID} | Searching TVA for each subtype separately (SLOW mode)`);

        for (const term of subtypeTerms) {
          console.log(`${MODULE_ID} | Searching TVA for subtype: "${term}"`);

          if (this.hasTVA) {
            const tvaResults = await this.searchTVA(term);
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
      }

      // Also search local index for each subtype (contains matching)
      if (localIndex?.length > 0) {
        for (const term of subtypeTerms) {
          const termLower = term.toLowerCase();
          const localMatches = localIndex.filter(img => {
            // Skip excluded paths
            if (this.isExcludedPath(img.path)) return false;
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
          !this.isExcludedPath(img.path) &&
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
      return r.path.includes('/') || r.path.includes('.') || r.path.startsWith('http') || r.path.startsWith('forge://');
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
