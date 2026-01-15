/**
 * Token Replacer FA - Index Service
 * Hierarchical JSON index organized by creature category
 * Features: Automatic updates based on configurable frequency
 * @module services/IndexService
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, EXCLUDED_FOLDERS } from '../core/Constants.js';
import { extractPathFromTVAResult, extractNameFromTVAResult } from '../core/Utils.js';

const CACHE_KEY = 'token-replacer-fa-index-v3';
const INDEX_VERSION = 7;

// Update frequency in milliseconds
const UPDATE_FREQUENCIES = {
  daily: 24 * 60 * 60 * 1000,           // 1 day
  weekly: 7 * 24 * 60 * 60 * 1000,      // 7 days
  monthly: 30 * 24 * 60 * 60 * 1000,    // 30 days
  quarterly: 90 * 24 * 60 * 60 * 1000   // 90 days
};

/**
 * IndexService - Hierarchical JSON index for fast creature-based lookups
 * Structure:
 * {
 *   version: 6,
 *   timestamp: Date.now(),
 *   lastUpdate: Date.now(),
 *   categories: {
 *     humanoid: { human: [{path, name}], elf: [...] },
 *     beast: { wolf: [...], bear: [...] },
 *     ...
 *   },
 *   allPaths: { "path": { name, category, subcategories: [] } }
 * }
 */
class IndexService {
  constructor() {
    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
  }

  /**
   * Get the configured update frequency in milliseconds
   * @returns {number} Frequency in ms
   */
  getUpdateFrequency() {
    try {
      const setting = game.settings.get(MODULE_ID, 'indexUpdateFrequency');
      return UPDATE_FREQUENCIES[setting] || UPDATE_FREQUENCIES.weekly;
    } catch (e) {
      return UPDATE_FREQUENCIES.weekly;
    }
  }

  /**
   * Check if the index needs updating based on frequency setting
   * @returns {boolean} True if update is needed
   */
  needsUpdate() {
    if (!this.index?.lastUpdate) return true;
    const frequency = this.getUpdateFrequency();
    const elapsed = Date.now() - this.index.lastUpdate;
    return elapsed > frequency;
  }

  /**
   * Check if a path should be excluded
   * @param {string} path - Image path
   * @returns {boolean} True if excluded
   */
  isExcludedPath(path) {
    if (!path) return true;
    const pathLower = path.toLowerCase();
    const segments = pathLower.split('/');
    return EXCLUDED_FOLDERS.some(folder =>
      segments.some(segment => segment === folder)
    );
  }

  /**
   * Determine which category and subcategories an image belongs to
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {Object} { category, subcategories }
   */
  categorizeImage(path, name) {
    const searchText = `${path} ${name}`.toLowerCase();
    let bestCategory = null;
    let subcategories = [];
    let maxMatches = 0;

    for (const [category, terms] of Object.entries(CREATURE_TYPE_MAPPINGS)) {
      let matches = 0;
      const matchedTerms = [];

      for (const term of terms) {
        if (searchText.includes(term.toLowerCase())) {
          matches++;
          matchedTerms.push(term);
        }
      }

      if (matches > maxMatches) {
        maxMatches = matches;
        bestCategory = category;
        subcategories = matchedTerms;
      }
    }

    return { category: bestCategory, subcategories };
  }

  /**
   * Load index from localStorage
   * @returns {boolean} True if loaded successfully
   */
  loadFromCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return false;

      const data = JSON.parse(cached);

      // Version check
      if (data.version !== INDEX_VERSION) {
        console.log(`${MODULE_ID} | Index version mismatch, rebuilding`);
        localStorage.removeItem(CACHE_KEY);
        return false;
      }

      this.index = data;
      console.log(`${MODULE_ID} | Loaded index from cache: ${Object.keys(data.allPaths || {}).length} images`);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to load cache:`, error);
      localStorage.removeItem(CACHE_KEY);
      return false;
    }
  }

  /**
   * Save index to localStorage
   * @returns {boolean} True if saved successfully
   */
  saveToCache() {
    try {
      const json = JSON.stringify(this.index);

      // Check size limit (~5MB for localStorage)
      if (json.length > 4.5 * 1024 * 1024) {
        console.warn(`${MODULE_ID} | Index too large for cache (${(json.length / 1024 / 1024).toFixed(1)}MB)`);
        return false;
      }

      localStorage.setItem(CACHE_KEY, json);
      console.log(`${MODULE_ID} | Saved index to cache (${(json.length / 1024).toFixed(0)}KB)`);
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to save cache:`, error);
      return false;
    }
  }

  /**
   * Create empty index structure
   * @returns {Object} Empty index
   */
  createEmptyIndex() {
    const categories = {};
    for (const category of Object.keys(CREATURE_TYPE_MAPPINGS)) {
      categories[category] = {};
    }

    return {
      version: INDEX_VERSION,
      timestamp: Date.now(),
      lastUpdate: Date.now(),
      categories,
      allPaths: {}
    };
  }

  /**
   * Add an image to the index
   * Stores ALL images in allPaths for general search, categorizes when possible
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {boolean} True if image was added, false if skipped
   */
  addImageToIndex(path, name) {
    // Skip if no path, already indexed, or excluded folder
    if (!path || this.index.allPaths[path] || this.isExcludedPath(path)) return false;

    // Extract name from path if not provided
    const imageName = name || path.split('/').pop()?.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Unknown';

    // Try to categorize the image
    const { category, subcategories } = this.categorizeImage(path, imageName);

    // ALWAYS add to allPaths (even if uncategorized) for general search
    this.index.allPaths[path] = {
      name: imageName,
      category: category || null,
      subcategories: subcategories || []
    };

    // If categorized, also add to category structure for fast category lookups
    if (category) {
      // Ensure category exists
      if (!this.index.categories[category]) {
        this.index.categories[category] = {};
      }

      // Add to each matching subcategory
      for (const subcat of subcategories) {
        if (!this.index.categories[category][subcat]) {
          this.index.categories[category][subcat] = [];
        }
        this.index.categories[category][subcat].push({ path, name: imageName });
      }

      // Also add to a "_all" subcategory for the category
      if (!this.index.categories[category]._all) {
        this.index.categories[category]._all = [];
      }
      this.index.categories[category]._all.push({ path, name: imageName });
    }

    return true;
  }

  /**
   * Build index from TVA API
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<number>} Number of images indexed
   */
  async buildFromTVA(onProgress = null) {
    const tvaAPI = game.modules.get('token-variants')?.api;
    if (!tvaAPI?.doImageSearch) {
      console.warn(`${MODULE_ID} | TVA API not available`);
      return 0;
    }

    console.log(`${MODULE_ID} | Building index from TVA API...`);

    // Collect all unique search terms
    const allTerms = new Set();
    for (const [category, terms] of Object.entries(CREATURE_TYPE_MAPPINGS)) {
      allTerms.add(category);
      terms.forEach(t => allTerms.add(t));
    }

    const termsArray = Array.from(allTerms);
    const totalTerms = termsArray.length;
    let processed = 0;
    let imagesFound = 0;

    console.log(`${MODULE_ID} | Searching ${totalTerms} terms...`);

    // Process in batches
    const BATCH_SIZE = 20;
    for (let i = 0; i < termsArray.length; i += BATCH_SIZE) {
      const batch = termsArray.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (term) => {
        try {
          // Try multiple search methods for compatibility
          let results = await tvaAPI.doImageSearch(term, { searchType: 'Portrait' });

          if (!results || (Array.isArray(results) && results.length === 0)) {
            results = await tvaAPI.doImageSearch(term);
          }

          return { term, results };
        } catch (e) {
          return { term, results: null };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status !== 'fulfilled' || !result.value?.results) continue;

        const { results } = result.value;
        const items = this.extractItemsFromResults(results);

        for (const item of items) {
          const path = extractPathFromTVAResult(item);
          if (path) {
            const name = extractNameFromTVAResult(item, path);
            // Only count if actually added (returns true)
            if (this.addImageToIndex(path, name)) {
              imagesFound++;
            }
          }
        }
      }

      processed += batch.length;

      // Progress callback
      if (onProgress && (processed % 50 === 0 || processed === totalTerms)) {
        onProgress(processed, totalTerms, Object.keys(this.index.allPaths).length);
      }

      // Yield to main thread for UI responsiveness
      await new Promise(r => setTimeout(r, 50));
    }

    return imagesFound;
  }

  /**
   * Extract items from various TVA result formats
   * @param {*} results - TVA results
   * @returns {Array} Array of items
   */
  extractItemsFromResults(results) {
    const items = [];

    if (Array.isArray(results)) {
      items.push(...results);
    } else if (results instanceof Map) {
      for (const [key, value] of results.entries()) {
        if (Array.isArray(value)) {
          items.push(...value);
        } else if (value) {
          items.push(value);
        }
        // Key might be a path
        if (typeof key === 'string' && (key.includes('/') || key.startsWith('http'))) {
          items.push({ path: key });
        }
      }
    } else if (results && typeof results === 'object') {
      const arr = results.paths || results.images || results.results || results.data;
      if (Array.isArray(arr)) {
        items.push(...arr);
      } else {
        items.push(results);
      }
    }

    return items;
  }

  /**
   * Build or update the index
   * @param {boolean} forceRebuild - Force full rebuild
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<boolean>} True if successful
   */
  async build(forceRebuild = false, onProgress = null) {
    if (this.buildPromise) return this.buildPromise;

    this.buildPromise = (async () => {
      const startTime = performance.now();
      console.log(`${MODULE_ID} | Starting index build...`);

      // Try to load from cache first
      if (!forceRebuild && this.loadFromCache()) {
        // Check if update is needed
        if (!this.needsUpdate()) {
          this.isBuilt = true;
          console.log(`${MODULE_ID} | Index loaded from cache, no update needed`);
          return true;
        }
        console.log(`${MODULE_ID} | Index needs update based on frequency setting`);
      }

      // Create new index
      this.index = this.createEmptyIndex();

      // Build from TVA
      await this.buildFromTVA(onProgress);

      // Use actual count from allPaths
      const totalImages = Object.keys(this.index.allPaths).length;

      if (totalImages > 0) {
        this.index.lastUpdate = Date.now();
        this.saveToCache();
        this.isBuilt = true;

        const stats = this.getStats();
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        console.log(`${MODULE_ID} | Index built: ${totalImages} total images (${stats.categorizedImages} categorized) in ${elapsed}s`);
        return true;
      }

      console.warn(`${MODULE_ID} | Index build returned 0 images`);
      this.isBuilt = false;
      return false;
    })();

    const result = await this.buildPromise;
    this.buildPromise = null;
    return result;
  }

  /**
   * Search by creature category
   * @param {string} category - Creature type (humanoid, beast, etc.)
   * @returns {Array} All images in category
   */
  searchByCategory(category) {
    if (!this.isBuilt || !this.index?.categories) return [];

    const categoryLower = category.toLowerCase();
    const categoryData = this.index.categories[categoryLower];

    if (!categoryData?._all) return [];

    // Return all images in this category
    return categoryData._all.map(item => ({
      path: item.path,
      name: item.name,
      source: 'index',
      category: categoryLower
    }));
  }

  /**
   * Search by subcategory (e.g., "elf" within humanoid)
   * @param {string} category - Main category
   * @param {string} subcategory - Subcategory term
   * @returns {Array} Matching images
   */
  searchBySubcategory(category, subcategory) {
    if (!this.isBuilt || !this.index?.categories) return [];

    const categoryLower = category.toLowerCase();
    const subcatLower = subcategory.toLowerCase();
    const categoryData = this.index.categories[categoryLower];

    if (!categoryData) return [];

    // Direct subcategory match
    if (categoryData[subcatLower]) {
      return categoryData[subcatLower].map(item => ({
        path: item.path,
        name: item.name,
        source: 'index',
        category: categoryLower,
        subcategory: subcatLower
      }));
    }

    // Partial match in subcategory names
    const results = [];
    const seenPaths = new Set();

    for (const [subcat, items] of Object.entries(categoryData)) {
      if (subcat === '_all') continue;
      if (subcat.includes(subcatLower) || subcatLower.includes(subcat)) {
        for (const item of items) {
          if (!seenPaths.has(item.path)) {
            seenPaths.add(item.path);
            results.push({
              path: item.path,
              name: item.name,
              source: 'index',
              category: categoryLower,
              subcategory: subcat
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Search by term across all categories
   * @param {string} term - Search term
   * @returns {Array} Matching images
   */
  search(term) {
    if (!this.isBuilt || !this.index?.allPaths) return [];

    const termLower = term.toLowerCase();
    const results = [];

    for (const [path, data] of Object.entries(this.index.allPaths)) {
      const searchText = `${path} ${data.name} ${data.subcategories?.join(' ') || ''}`.toLowerCase();
      if (searchText.includes(termLower)) {
        results.push({
          path,
          name: data.name,
          source: 'index',
          category: data.category
        });
      }
    }

    return results;
  }

  /**
   * Search multiple terms (OR logic)
   * @param {string[]} terms - Search terms
   * @returns {Array} Combined results
   */
  searchMultiple(terms) {
    if (!terms?.length) return [];

    const seenPaths = new Set();
    const results = [];

    for (const term of terms) {
      for (const result of this.search(term)) {
        if (!seenPaths.has(result.path)) {
          seenPaths.add(result.path);
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Get index statistics
   * @returns {Object} Stats
   */
  getStats() {
    const categoryStats = {};
    let categorizedCount = 0;

    if (this.index?.categories) {
      for (const [cat, data] of Object.entries(this.index.categories)) {
        const count = data._all?.length || 0;
        categoryStats[cat] = count;
        categorizedCount += count;
      }
    }

    const totalImages = Object.keys(this.index?.allPaths || {}).length;

    return {
      isBuilt: this.isBuilt,
      version: this.index?.version || 0,
      totalImages: totalImages,
      categorizedImages: categorizedCount,
      uncategorizedImages: totalImages - categorizedCount,
      lastUpdate: this.index?.lastUpdate ? new Date(this.index.lastUpdate).toLocaleString() : 'Never',
      categories: categoryStats
    };
  }

  /**
   * Clear the index
   */
  clear() {
    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
    localStorage.removeItem(CACHE_KEY);
    console.log(`${MODULE_ID} | Index cleared`);
  }

  /**
   * Force rebuild the index
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<boolean>}
   */
  async forceRebuild(onProgress = null) {
    this.clear();
    return this.build(true, onProgress);
  }
}

// Export singleton
export const indexService = new IndexService();
