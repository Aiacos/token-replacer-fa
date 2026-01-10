/**
 * Token Replacer FA - Index Service
 * Pre-built keyword index for instant O(1) searches
 * @module services/IndexService
 */

import { MODULE_ID } from '../core/Constants.js';
import { yieldToMain, extractPathFromTVAResult, extractNameFromTVAResult } from '../core/Utils.js';

/**
 * IndexService class for building and querying a pre-built token index
 * Uses hash tables for O(1) keyword lookups instead of repeated API calls
 */
export class IndexService {
  constructor() {
    // Main storage
    this.images = [];                    // Flat array of all images
    this.keywordIndex = new Map();       // keyword -> Set<imageIndex>
    this.pathIndex = new Map();          // path -> imageIndex (for dedup)

    // Category index for creature type filtering
    this.categoryIndex = new Map();      // category -> Set<imageIndex>

    // State
    this.isBuilt = false;
    this.isBuilding = false;
    this.buildPromise = null;

    // Stats
    this.stats = {
      totalImages: 0,
      totalKeywords: 0,
      buildTimeMs: 0,
      source: { tva: 0, local: 0 }
    };
  }

  /**
   * Build the complete index from all sources
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<void>}
   */
  async build(progressCallback = null) {
    if (this.isBuilt) {
      console.log(`${MODULE_ID} | Index already built with ${this.stats.totalImages} images`);
      return;
    }

    if (this.isBuilding) {
      console.log(`${MODULE_ID} | Index build already in progress, waiting...`);
      return this.buildPromise;
    }

    this.isBuilding = true;
    const startTime = performance.now();

    this.buildPromise = this._doBuild(progressCallback);
    await this.buildPromise;

    this.stats.buildTimeMs = Math.round(performance.now() - startTime);
    this.isBuilding = false;
    this.isBuilt = true;

    console.log(`${MODULE_ID} | Index built in ${this.stats.buildTimeMs}ms:`, this.stats);
  }

  /**
   * Internal build implementation
   * @private
   */
  async _doBuild(progressCallback = null) {
    console.log(`${MODULE_ID} | Building token index...`);

    // Phase 1: Collect all images from TVA
    if (progressCallback) {
      progressCallback({ phase: 'tva', progress: 0, message: 'Loading TVA cache...' });
    }

    const tvaImages = await this._getAllTVAImages(progressCallback);
    console.log(`${MODULE_ID} | Collected ${tvaImages.length} images from TVA`);

    // Phase 2: Collect local images
    if (progressCallback) {
      progressCallback({ phase: 'local', progress: 0, message: 'Scanning local directories...' });
    }

    const localImages = await this._scanLocalImages(progressCallback);
    console.log(`${MODULE_ID} | Collected ${localImages.length} local images`);

    // Phase 3: Build indices
    if (progressCallback) {
      progressCallback({ phase: 'indexing', progress: 0, message: 'Building search index...' });
    }

    const allImages = [...tvaImages, ...localImages];
    await this._buildIndices(allImages, progressCallback);

    this.stats.totalImages = this.images.length;
    this.stats.totalKeywords = this.keywordIndex.size;
    this.stats.source.tva = tvaImages.length;
    this.stats.source.local = localImages.length;

    if (progressCallback) {
      progressCallback({ phase: 'complete', progress: 100, message: 'Index ready!' });
    }
  }

  /**
   * Get all images from TVA cache
   * @private
   */
  async _getAllTVAImages(progressCallback = null) {
    const tvaAPI = game.modules.get('token-variants')?.api;
    if (!tvaAPI) return [];

    const results = [];
    const seenPaths = new Set();

    try {
      // Use broad search terms to get as many images as possible
      const broadTerms = [
        // Creature types
        'humanoid', 'beast', 'undead', 'fiend', 'dragon', 'elemental',
        'fey', 'celestial', 'construct', 'aberration', 'monstrosity',
        'giant', 'plant', 'ooze',
        // Common terms
        'token', 'creature', 'monster', 'npc', 'character', 'enemy',
        // Races
        'human', 'elf', 'dwarf', 'orc', 'goblin', 'kobold',
        // Classes
        'warrior', 'mage', 'rogue', 'cleric', 'ranger', 'paladin',
        // Common monsters
        'skeleton', 'zombie', 'wolf', 'bear', 'spider', 'demon'
      ];

      const totalTerms = broadTerms.length;
      let processedTerms = 0;

      for (const term of broadTerms) {
        try {
          const searchResults = await tvaAPI.doImageSearch(term, {
            searchType: 'Portrait',
            simpleResults: false
          });

          if (searchResults) {
            const items = Array.isArray(searchResults)
              ? searchResults
              : (searchResults instanceof Map ? Array.from(searchResults.values()) : [searchResults]);

            for (const item of items) {
              const imagePath = extractPathFromTVAResult(item);
              if (!imagePath || seenPaths.has(imagePath)) continue;

              seenPaths.add(imagePath);
              const name = extractNameFromTVAResult(item, imagePath);

              results.push({
                path: imagePath,
                name: name,
                source: 'tva'
              });
            }
          }
        } catch (e) {
          // Continue with next term
        }

        processedTerms++;
        if (progressCallback && processedTerms % 5 === 0) {
          progressCallback({
            phase: 'tva',
            progress: Math.round((processedTerms / totalTerms) * 100),
            message: `Searching TVA: ${term}... (${results.length} found)`
          });
        }

        // Yield every few terms to keep UI responsive
        if (processedTerms % 3 === 0) {
          await yieldToMain(5);
        }
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Error getting TVA images:`, error);
    }

    return results;
  }

  /**
   * Scan local directories for images
   * @private
   */
  async _scanLocalImages(progressCallback = null) {
    const results = [];
    const seenPaths = new Set();
    const imageExtensions = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg'];

    // Get paths to scan
    const additionalPathsSetting = game.settings.get(MODULE_ID, 'additionalPaths') || '';
    const paths = additionalPathsSetting
      ? additionalPathsSetting.split(',').map(p => p.trim()).filter(p => p)
      : [];

    // Add common paths
    const commonPaths = [
      'modules/fa-nexus',
      'modules/forgotten-adventures',
      'tokens',
      'assets/tokens'
    ];

    for (const path of commonPaths) {
      try {
        const result = await FilePicker.browse('data', path);
        if (result && (result.dirs?.length > 0 || result.files?.length > 0)) {
          if (!paths.includes(path)) paths.push(path);
        }
      } catch (e) {
        // Path doesn't exist
      }
    }

    // Recursive scan function
    const scanDir = async (dirPath, depth = 0, maxDepth = 5) => {
      if (depth > maxDepth) return;

      try {
        const result = await FilePicker.browse('data', dirPath);
        if (!result) return;

        // Extract category from path
        const pathParts = dirPath.split('/');
        const category = pathParts[pathParts.length - 1];

        // Process files
        if (result.files) {
          for (const file of result.files) {
            const ext = '.' + file.split('.').pop().toLowerCase();
            if (imageExtensions.includes(ext) && !seenPaths.has(file)) {
              seenPaths.add(file);
              const fileName = file.split('/').pop();
              const name = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();

              results.push({
                path: file,
                name: name,
                fileName: fileName,
                category: category,
                source: 'local'
              });
            }
          }
        }

        // Recurse into subdirectories
        if (result.dirs) {
          for (const subDir of result.dirs) {
            await scanDir(subDir, depth + 1, maxDepth);
          }
        }

        // Yield periodically
        if (results.length % 100 === 0) {
          await yieldToMain(5);
          if (progressCallback) {
            progressCallback({
              phase: 'local',
              progress: 50, // Approximate
              message: `Scanning: ${dirPath}... (${results.length} found)`
            });
          }
        }
      } catch (e) {
        // Skip inaccessible directories
      }
    };

    // Scan all paths
    for (const basePath of paths) {
      await scanDir(basePath);
    }

    return results;
  }

  /**
   * Build keyword and category indices from images
   * @private
   */
  async _buildIndices(allImages, progressCallback = null) {
    const totalImages = allImages.length;
    let processedImages = 0;

    for (const img of allImages) {
      // Skip duplicates
      if (this.pathIndex.has(img.path)) continue;

      const imageIndex = this.images.length;
      this.images.push(img);
      this.pathIndex.set(img.path, imageIndex);

      // Extract and index keywords
      const keywords = this._extractKeywords(img);
      for (const keyword of keywords) {
        if (!this.keywordIndex.has(keyword)) {
          this.keywordIndex.set(keyword, new Set());
        }
        this.keywordIndex.get(keyword).add(imageIndex);
      }

      // Index by category if available
      if (img.category) {
        const categoryLower = img.category.toLowerCase();
        if (!this.categoryIndex.has(categoryLower)) {
          this.categoryIndex.set(categoryLower, new Set());
        }
        this.categoryIndex.get(categoryLower).add(imageIndex);
      }

      processedImages++;
      if (progressCallback && processedImages % 500 === 0) {
        progressCallback({
          phase: 'indexing',
          progress: Math.round((processedImages / totalImages) * 100),
          message: `Indexing: ${processedImages}/${totalImages} images...`
        });
        await yieldToMain(5);
      }
    }
  }

  /**
   * Extract searchable keywords from an image
   * @private
   */
  _extractKeywords(img) {
    const keywords = new Set();
    const minKeywordLength = 2;

    // Extract from path segments
    if (img.path) {
      const pathParts = img.path.split(/[\/\\]/);
      for (const part of pathParts) {
        const words = part.toLowerCase().split(/[-_\s.()[\]{}]+/);
        for (const word of words) {
          if (word.length >= minKeywordLength && !/^\d+$/.test(word)) {
            keywords.add(word);
          }
        }
      }
    }

    // Extract from name
    if (img.name) {
      const words = img.name.toLowerCase().split(/[-_\s.()[\]{}]+/);
      for (const word of words) {
        if (word.length >= minKeywordLength && !/^\d+$/.test(word)) {
          keywords.add(word);
        }
      }
    }

    // Extract from category
    if (img.category) {
      const words = img.category.toLowerCase().split(/[-_\s.()[\]{}]+/);
      for (const word of words) {
        if (word.length >= minKeywordLength && !/^\d+$/.test(word)) {
          keywords.add(word);
        }
      }
    }

    return keywords;
  }

  /**
   * Search for a single term - O(1) lookup
   * @param {string} term - Search term
   * @returns {Array} Matching images
   */
  searchTerm(term) {
    if (!this.isBuilt) return [];

    const termLower = term.toLowerCase().trim();
    if (termLower.length < 2) return [];

    const indices = this.keywordIndex.get(termLower);
    if (!indices) return [];

    return Array.from(indices).map(i => ({
      ...this.images[i],
      score: 0.1 // Exact match gets best score
    }));
  }

  /**
   * Search with OR logic - returns images matching ANY term
   * @param {string[]} terms - Search terms
   * @returns {Array} Matching images
   */
  searchOR(terms) {
    if (!this.isBuilt || terms.length === 0) return [];

    const resultIndices = new Set();
    const termMatches = new Map(); // imageIndex -> matched terms

    for (const term of terms) {
      const termLower = term.toLowerCase().trim();
      if (termLower.length < 2) continue;

      const indices = this.keywordIndex.get(termLower);
      if (indices) {
        for (const i of indices) {
          resultIndices.add(i);
          if (!termMatches.has(i)) termMatches.set(i, []);
          termMatches.get(i).push(term);
        }
      }
    }

    return Array.from(resultIndices).map(i => ({
      ...this.images[i],
      matchedTerms: termMatches.get(i),
      score: 0.2
    }));
  }

  /**
   * Search with AND logic - returns images matching ALL terms
   * @param {string[]} terms - Search terms
   * @returns {Array} Matching images
   */
  searchAND(terms) {
    if (!this.isBuilt || terms.length === 0) return [];

    const validTerms = terms
      .map(t => t.toLowerCase().trim())
      .filter(t => t.length >= 2);

    if (validTerms.length === 0) return [];

    // Start with first term's results
    let resultIndices = this.keywordIndex.get(validTerms[0]);
    if (!resultIndices) return [];
    resultIndices = new Set(resultIndices);

    // Intersect with other terms
    for (let i = 1; i < validTerms.length; i++) {
      const termIndices = this.keywordIndex.get(validTerms[i]);
      if (!termIndices) return [];

      resultIndices = new Set([...resultIndices].filter(x => termIndices.has(x)));
      if (resultIndices.size === 0) return [];
    }

    return Array.from(resultIndices).map(i => ({
      ...this.images[i],
      matchedTerms: validTerms,
      score: 0.05 // Best score for matching all terms
    }));
  }

  /**
   * Search with partial/fuzzy matching
   * Finds keywords that contain or are contained by the search term
   * @param {string} term - Search term
   * @returns {Array} Matching images
   */
  searchPartial(term) {
    if (!this.isBuilt) return [];

    const termLower = term.toLowerCase().trim();
    if (termLower.length < 2) return [];

    const resultIndices = new Set();
    const matchScores = new Map();

    for (const [keyword, indices] of this.keywordIndex) {
      let score = null;

      // Exact match
      if (keyword === termLower) {
        score = 0.1;
      }
      // Keyword starts with term
      else if (keyword.startsWith(termLower)) {
        score = 0.2;
      }
      // Term starts with keyword
      else if (termLower.startsWith(keyword)) {
        score = 0.25;
      }
      // Keyword contains term
      else if (keyword.includes(termLower)) {
        score = 0.3;
      }
      // Term contains keyword (less relevant)
      else if (termLower.includes(keyword) && keyword.length >= 3) {
        score = 0.4;
      }

      if (score !== null) {
        for (const i of indices) {
          resultIndices.add(i);
          if (!matchScores.has(i) || matchScores.get(i) > score) {
            matchScores.set(i, score);
          }
        }
      }
    }

    return Array.from(resultIndices)
      .map(i => ({
        ...this.images[i],
        score: matchScores.get(i)
      }))
      .sort((a, b) => a.score - b.score);
  }

  /**
   * Search by creature category
   * @param {string} category - Category name
   * @returns {Array} Matching images
   */
  searchCategory(category) {
    if (!this.isBuilt) return [];

    const categoryLower = category.toLowerCase().trim();
    const indices = this.categoryIndex.get(categoryLower);

    if (!indices) {
      // Try partial match on category
      return this.searchPartial(category);
    }

    return Array.from(indices).map(i => ({
      ...this.images[i],
      score: 0.3
    }));
  }

  /**
   * Combined search: try exact, then partial
   * @param {string} term - Search term
   * @returns {Array} Matching images
   */
  search(term) {
    if (!this.isBuilt) return [];

    // Try exact match first
    let results = this.searchTerm(term);

    // If no results, try partial match
    if (results.length === 0) {
      results = this.searchPartial(term);
    }

    return results;
  }

  /**
   * Multi-term search with OR logic and partial matching
   * @param {string[]} terms - Search terms
   * @returns {Array} Matching images
   */
  searchMultiple(terms) {
    if (!this.isBuilt || terms.length === 0) return [];

    const resultMap = new Map(); // path -> result object

    for (const term of terms) {
      const termResults = this.search(term);
      for (const result of termResults) {
        if (!resultMap.has(result.path)) {
          resultMap.set(result.path, {
            ...result,
            matchedTerms: [term]
          });
        } else {
          resultMap.get(result.path).matchedTerms.push(term);
        }
      }
    }

    return Array.from(resultMap.values())
      .sort((a, b) => a.score - b.score);
  }

  /**
   * Get index statistics
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      ...this.stats,
      isBuilt: this.isBuilt,
      uniqueImages: this.images.length,
      uniqueKeywords: this.keywordIndex.size,
      categories: this.categoryIndex.size
    };
  }

  /**
   * Clear the index
   */
  clear() {
    this.images = [];
    this.keywordIndex.clear();
    this.pathIndex.clear();
    this.categoryIndex.clear();
    this.isBuilt = false;
    this.stats = { totalImages: 0, totalKeywords: 0, buildTimeMs: 0, source: { tva: 0, local: 0 } };
  }

  /**
   * Rebuild the index
   * @param {Function} progressCallback - Optional progress callback
   */
  async rebuild(progressCallback = null) {
    this.clear();
    await this.build(progressCallback);
  }
}

// Export singleton instance
export const indexService = new IndexService();
