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

  // Send initial progress
  self.postMessage({
    type: 'progress',
    processed: 0,
    total: paths.length,
    imagesFound: 0
  });

  // TODO: Actual indexing logic will be implemented in subsequent subtasks
  // For now, just send completion message with empty results
  const result = {
    categories: {},
    allPaths: {}
  };

  // Send completion message
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

/**
 * Process paths and build the index
 * TODO: Will be implemented in subtask-1-4
 *
 * @param {Array} paths - Array of paths to index
 * @param {Object} config - Configuration object
 * @returns {Object} { categories, allPaths }
 */
function indexPaths(paths, config) {
  // Placeholder - will be implemented in next subtask
  return { categories: {}, allPaths: {} };
}
