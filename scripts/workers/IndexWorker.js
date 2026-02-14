/**
 * Token Replacer FA - Index Worker
 * Web Worker for background index building without blocking the main thread
 *
 * This worker processes token image paths and categorizes them by creature type.
 * Unlike the main thread implementation, this worker runs at full speed without
 * setTimeout yields, keeping the UI completely responsive.
 *
 * @module workers/IndexWorker
 */

/**
 * Fuse.js CDN URL - loaded dynamically when needed
 */
const FUSE_CDN = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

/**
 * Cached Fuse.js constructor
 */
let FuseClass = null;

/**
 * Main message handler for the worker
 * Receives commands from the main thread and processes them
 */
self.addEventListener('message', (event) => {
  const { command, data } = event.data;

  try {
    switch (command) {
      case 'indexPaths':
        handleIndexPaths(data);
        break;

      case 'fuzzySearch':
        handleFuzzySearch(data);
        break;

      case 'ping':
        // Health check - respond immediately
        self.postMessage({ type: 'pong' });
        break;

      default:
        self.postMessage({
          type: 'error',
          message: `Unknown command: ${command}`
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error.message,
      stack: error.stack
    });
  }
});

/**
 * Handle the indexPaths command
 * Processes an array of image paths and builds a categorized index
 *
 * @param {Object} data - Input data from main thread
 * @param {Array} data.paths - Array of paths to index (strings or {path, name} objects)
 * @param {Object} data.creatureTypeMappings - Creature category mappings
 * @param {Array} data.excludedFolders - Folder names to exclude
 * @param {Array} data.excludedFilenameTerms - Filename terms to exclude
 */
function handleIndexPaths(data) {
  const {
    paths,
    creatureTypeMappings,
    excludedFolders,
    excludedFilenameTerms
  } = data;

  // Validate input
  if (!Array.isArray(paths)) {
    throw new Error('paths must be an array');
  }
  if (!creatureTypeMappings || typeof creatureTypeMappings !== 'object') {
    throw new Error('creatureTypeMappings must be an object');
  }
  if (!Array.isArray(excludedFolders)) {
    throw new Error('excludedFolders must be an array');
  }
  if (!Array.isArray(excludedFilenameTerms)) {
    throw new Error('excludedFilenameTerms must be an array');
  }

  // Initialize empty index structure
  const categories = {};
  for (const category of Object.keys(creatureTypeMappings)) {
    categories[category] = {};
  }
  const allPaths = {};

  // Send initial progress
  self.postMessage({
    type: 'progress',
    processed: 0,
    total: paths.length,
    imagesFound: 0
  });

  let imagesFound = 0;
  const PROGRESS_BATCH = 1000;

  // Process each path
  for (let i = 0; i < paths.length; i++) {
    const entry = paths[i];

    // Extract path and name (handle both string and {path, name} object formats)
    let path, name;
    if (typeof entry === 'string') {
      path = entry;
      name = null;
    } else if (entry && typeof entry === 'object') {
      path = entry.path || entry[0];
      name = entry.name || entry[1];
    } else {
      continue; // Skip invalid entries
    }

    // Skip if no path, already indexed, or excluded
    if (!path || allPaths[path] || isExcludedPath(path, excludedFolders, excludedFilenameTerms)) {
      continue;
    }

    // Extract name from path if not provided
    const imageName = name || path.split('/').pop()?.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Unknown';

    // Try to categorize the image
    const { category, subcategories } = categorizeImage(path, imageName, creatureTypeMappings);

    // ALWAYS add to allPaths (even if uncategorized) for general search
    allPaths[path] = {
      name: imageName,
      category: category || null,
      subcategories: subcategories || []
    };

    imagesFound++;

    // If categorized, also add to category structure for fast category lookups
    if (category) {
      // Ensure category exists
      if (!categories[category]) {
        categories[category] = {};
      }

      // Add to each matched subcategory
      for (const subcategory of subcategories) {
        if (!categories[category][subcategory]) {
          categories[category][subcategory] = [];
        }
        categories[category][subcategory].push({ path, name: imageName });
      }

      // Also add to a "_all" subcategory for the category
      if (!categories[category]._all) {
        categories[category]._all = [];
      }
      categories[category]._all.push({ path, name: imageName });
    }

    // Report progress every 1000 items
    if ((i + 1) % PROGRESS_BATCH === 0) {
      reportProgress(i + 1, paths.length, imagesFound);
    }
  }

  // Send final progress update
  reportProgress(paths.length, paths.length, imagesFound);

  // Send completion message with results
  const result = {
    categories,
    allPaths
  };

  self.postMessage({
    type: 'complete',
    result
  });
}

/**
 * Send progress update to main thread
 *
 * @param {number} processed - Number of paths processed
 * @param {number} total - Total number of paths
 * @param {number} imagesFound - Number of images added to index
 */
function reportProgress(processed, total, imagesFound) {
  self.postMessage({
    type: 'progress',
    processed,
    total,
    imagesFound
  });
}

/**
 * Load Fuse.js library from CDN
 * @returns {Promise<Function|null>} Fuse constructor or null
 */
async function loadFuse() {
  if (FuseClass) return FuseClass;

  try {
    const module = await import(FUSE_CDN);
    FuseClass = module.default;
    return FuseClass;
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: `Failed to load Fuse.js: ${error.message}`,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Handle the fuzzySearch command
 * Performs fuzzy search on an index using Fuse.js
 *
 * @param {Object} data - Input data from main thread
 * @param {Array} data.searchTerms - Array of search terms
 * @param {Array} data.index - Array of items to search
 * @param {Object} data.options - Fuse.js options (keys, threshold, etc.)
 */
async function handleFuzzySearch(data) {
  const { searchTerms, index, options } = data;

  // Validate input
  if (!Array.isArray(searchTerms)) {
    throw new Error('searchTerms must be an array');
  }
  if (!Array.isArray(index)) {
    throw new Error('index must be an array');
  }
  if (!options || typeof options !== 'object') {
    throw new Error('options must be an object');
  }

  // Load Fuse.js
  const Fuse = await loadFuse();
  if (!Fuse) {
    self.postMessage({
      type: 'complete',
      result: []
    });
    return;
  }

  // Create Fuse instance
  const fuse = new Fuse(index, options);
  const results = [];
  const seenPaths = new Set();

  // Search for each term
  for (const term of searchTerms) {
    const searchResults = fuse.search(term);
    for (const result of searchResults) {
      const item = result.item;
      // Skip if already seen
      if (item.path && seenPaths.has(item.path)) continue;

      if (item.path) {
        seenPaths.add(item.path);
      }
      results.push({
        ...item,
        score: result.score
      });
    }
  }

  // Send completion message with results
  self.postMessage({
    type: 'complete',
    result: results
  });
}

/**
 * Categorize an image based on its path and name
 * Determines which creature category matches best based on term frequency
 *
 * @param {string} path - Image path
 * @param {string} name - Image name
 * @param {Object} creatureTypeMappings - Creature category mappings
 * @returns {Object} { category, subcategories }
 */
function categorizeImage(path, name, creatureTypeMappings) {
  const searchText = `${path} ${name}`.toLowerCase();
  let bestCategory = null;
  let subcategories = [];
  let maxMatches = 0;

  for (const [category, terms] of Object.entries(creatureTypeMappings)) {
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
 * CDN URL segments to skip when checking folder exclusions
 * These are common in Forge bazaar URLs: https://assets.forge-vtt.com/bazaar/assets/...
 */
const CDN_SEGMENTS = new Set([
  'https:', 'http:', '', 'bazaar', 'assets', 'modules', 'systems',
  'assets.forge-vtt.com', 'forge-vtt.com', 'foundryvtt.com',
  'www', 'cdn', 'static', 'public', 'uploads', 'files'
]);

/**
 * Check if a path should be excluded from indexing
 * Checks both folder names and filename for environmental/prop terms
 *
 * @param {string} path - Path to check
 * @param {Array} excludedFolders - Folder names to exclude
 * @param {Array} excludedFilenameTerms - Filename terms to exclude
 * @returns {boolean} True if path should be excluded
 */
function isExcludedPath(path, excludedFolders, excludedFilenameTerms) {
  if (!path) return true;
  const pathLower = path.toLowerCase();
  const segments = pathLower.split('/');

  // Filter out CDN segments and check remaining folder names
  const folderSegments = segments.filter(s => !CDN_SEGMENTS.has(s) && s.length > 0);

  // Check folder names against exclusion list
  const folderExcluded = excludedFolders.some(folder =>
    folderSegments.some(segment => segment === folder)
  );
  if (folderExcluded) return true;

  // Also check filename for environmental/prop terms
  const filename = segments[segments.length - 1] || '';
  // Remove extension and convert separators to spaces for word matching
  const filenameClean = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').toLowerCase();

  // Check if filename contains excluded terms (as whole words or prefixes)
  return excludedFilenameTerms.some(term => {
    // Match as word boundary: "cliff_entrance" matches "cliff", but "clifford" doesn't
    const regex = new RegExp(`\\b${term}`, 'i');
    return regex.test(filenameClean);
  });
}

