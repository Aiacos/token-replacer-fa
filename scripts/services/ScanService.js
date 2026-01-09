/**
 * Token Replacer FA - Scan Service
 * Handles directory scanning and local index building
 * @module services/ScanService
 */

import { MODULE_ID } from '../core/Constants.js';
import { yieldToMain } from '../core/Utils.js';

/**
 * ScanService class for directory scanning operations
 */
export class ScanService {
  constructor() {
    this.imageExtensions = ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg'];
  }

  /**
   * Discover token paths from module settings
   * @returns {Promise<string[]>} Array of paths to search
   */
  async discoverTokenPaths() {
    const paths = [];

    // Get additional paths from settings
    const additionalPathsSetting = game.settings.get(MODULE_ID, 'additionalPaths') || '';
    if (additionalPathsSetting) {
      const additionalPaths = additionalPathsSetting.split(',').map(p => p.trim()).filter(p => p);
      paths.push(...additionalPaths);
    }

    // Add common token paths
    const commonPaths = [
      'modules/fa-nexus',
      'modules/forgotten-adventures',
      'modules/token-variants',
      'tokens',
      'assets/tokens'
    ];

    for (const path of commonPaths) {
      try {
        const result = await FilePicker.browse('data', path);
        if (result && (result.dirs?.length > 0 || result.files?.length > 0)) {
          if (!paths.includes(path)) {
            paths.push(path);
          }
        }
      } catch (e) {
        // Path doesn't exist, skip
      }
    }

    console.log(`${MODULE_ID} | Discovered ${paths.length} token paths:`, paths);
    return paths;
  }

  /**
   * Scan a directory recursively for images
   * @param {string} path - Directory path
   * @param {number} depth - Current depth
   * @param {number} maxDepth - Maximum depth
   * @param {Function} progressCallback - Progress callback
   * @param {string} category - Category name from parent folder
   * @returns {Promise<Array>} Array of image objects
   */
  async scanDirectoryForImages(path, depth = 0, maxDepth = 5, progressCallback = null, category = null) {
    if (depth > maxDepth) return [];

    const images = [];

    try {
      const result = await FilePicker.browse('data', path);
      if (!result) return [];

      // Update progress
      if (progressCallback) {
        progressCallback({
          currentDir: path,
          depth: depth,
          filesFound: result.files?.length || 0,
          dirsFound: result.dirs?.length || 0
        });
      }

      // Extract category from path if not set
      const pathParts = path.split('/');
      const folderName = pathParts[pathParts.length - 1];
      const currentCategory = category || folderName;

      // Process files
      if (result.files) {
        for (const file of result.files) {
          const ext = '.' + file.split('.').pop().toLowerCase();
          if (this.imageExtensions.includes(ext)) {
            const fileName = file.split('/').pop();
            const name = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
            images.push({
              path: file,
              name: name,
              fileName: fileName,
              category: currentCategory,
              source: 'local'
            });
          }
        }
      }

      // Yield to main thread periodically
      if (depth > 0 && images.length % 50 === 0) {
        await yieldToMain(10);
      }

      // Recursively scan subdirectories
      if (result.dirs) {
        for (const dir of result.dirs) {
          // Use folder name as category for subdirectories
          const subCategory = dir.split('/').pop();
          const subImages = await this.scanDirectoryForImages(
            dir,
            depth + 1,
            maxDepth,
            progressCallback,
            subCategory
          );
          images.push(...subImages);
        }
      }

    } catch (error) {
      console.warn(`${MODULE_ID} | Error scanning directory ${path}:`, error);
    }

    return images;
  }

  /**
   * Build local token index from configured paths
   * @param {Object} progressDialog - Optional progress dialog
   * @returns {Promise<Array>} Image index array
   */
  async buildLocalTokenIndex(progressDialog = null) {
    console.log(`${MODULE_ID} | Building local token index...`);

    const paths = await this.discoverTokenPaths();
    if (paths.length === 0) {
      console.log(`${MODULE_ID} | No token paths to scan`);
      return [];
    }

    const allImages = [];
    let dirsScanned = 0;
    let filesFound = 0;

    const progressCallback = (info) => {
      if (info.currentDir) {
        dirsScanned++;
        filesFound += info.filesFound || 0;
      }
    };

    for (const basePath of paths) {
      console.log(`${MODULE_ID} | Scanning: ${basePath}`);
      const images = await this.scanDirectoryForImages(basePath, 0, 5, progressCallback);
      allImages.push(...images);
    }

    // Remove duplicates
    const uniqueImages = [];
    const seenPaths = new Set();
    for (const img of allImages) {
      if (!seenPaths.has(img.path)) {
        seenPaths.add(img.path);
        uniqueImages.push(img);
      }
    }

    console.log(`${MODULE_ID} | Local index built: ${uniqueImages.length} images from ${dirsScanned} directories`);
    return uniqueImages;
  }

  /**
   * Get all images from TVA cache
   * @returns {Promise<Array>} Array of image objects
   */
  async getAllTVAImages() {
    const tvaAPI = game.modules.get('token-variants')?.api;
    if (!tvaAPI) return [];

    const results = [];
    const seenPaths = new Set(); // Use Set for O(1) duplicate check

    try {
      // Try to get images using doImageSearch with broad search
      const broadSearches = ['token', 'creature', 'monster', 'npc', 'character'];

      for (const term of broadSearches) {
        try {
          const searchResults = await tvaAPI.doImageSearch(term, {
            searchType: 'Portrait',
            simpleResults: false
          });

          if (searchResults && Array.isArray(searchResults)) {
            for (const item of searchResults) {
              let imagePath = null;
              let name = 'Unknown';

              // Extract path
              if (typeof item === 'string') {
                imagePath = item;
              } else if (typeof item === 'object' && item !== null) {
                imagePath = item.path || item.route || item.img || item.src || item.image || item.uri;
                name = item.name || item.label || item.title || 'Unknown';
              }

              if (imagePath && !seenPaths.has(imagePath)) {
                seenPaths.add(imagePath);
                if (name === 'Unknown' && imagePath) {
                  name = imagePath.split('/').pop()?.replace(/\.[^/.]+$/, '')
                    .replace(/[-_]/g, ' ').trim() || 'Unknown';
                }
                results.push({
                  path: imagePath,
                  name: name,
                  source: 'tva'
                });
              }
            }
          }
        } catch (e) {
          // Continue with next search
        }

        await yieldToMain(50);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Error getting TVA images:`, error);
    }

    console.log(`${MODULE_ID} | Retrieved ${results.length} images from TVA cache`);
    return results;
  }

  /**
   * Filter images by folder path matching a category type
   * @param {Array} images - Images to filter
   * @param {string} categoryType - Category type to match
   * @returns {Array} Filtered images
   */
  filterByFolderPath(images, categoryType) {
    if (!images || !categoryType) return [];

    const categoryLower = categoryType.toLowerCase();
    return images.filter(img => {
      const path = img.path?.toLowerCase() || '';
      const name = img.name?.toLowerCase() || '';

      // Check if path contains category
      const pathParts = path.split('/');
      for (const part of pathParts) {
        if (part.includes(categoryLower)) return true;
      }

      // Check if name matches
      if (name.includes(categoryLower)) return true;

      return false;
    });
  }
}

// Export singleton instance
export const scanService = new ScanService();
