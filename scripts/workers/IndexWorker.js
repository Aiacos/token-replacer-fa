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
 * Cancellation flag for current operation
 * Set to true when cancel command is received
 */
let cancelled = false;

/**
 * Persisted search index — set once via 'setSearchIndex', reused across fuzzySearch calls.
 * Avoids re-serializing the full index via structured clone on every search.
 */
let persistedSearchIndex = null;

/**
 * Main message handler for the worker
 * Receives commands from the main thread and processes them
 */
self.addEventListener('message', (event) => {
  const { command, data } = event.data;

  try {
    switch (command) {
      case 'indexPaths':
        handleIndexPaths(data).catch((error) => {
          self.postMessage({ type: 'error', message: error.message });
        });
        break;

      case 'setSearchIndex':
        persistedSearchIndex = data.index;
        self.postMessage({
          type: 'indexSet',
          count: Array.isArray(data.index) ? data.index.length : 0,
        });
        break;

      case 'fuzzySearch':
        handleFuzzySearch(data).catch((error) => {
          self.postMessage({
            type: 'error',
            message: error.message,
          });
        });
        break;

      case 'cancel':
        // Set flag — running functions detect it and post 'cancelled' message
        cancelled = true;
        break;

      case 'ping':
        // Health check - respond immediately
        self.postMessage({ type: 'pong' });
        break;

      default:
        console.warn(`IndexWorker: unknown command "${command}"`);
        self.postMessage({
          type: 'error',
          message: `Unknown command: ${command}`,
        });
    }
  } catch (error) {
    console.error('IndexWorker error:', error);
    self.postMessage({
      type: 'error',
      message: error.message,
    });
  }
});

/**
 * Hand the event loop back so queued messages — a cancel, above all — can be
 * dispatched.
 *
 * A worker is single-threaded: while a synchronous loop runs, `postMessage` from
 * the page sits in the queue and the `cancelled` flag can never flip, so every
 * cancel check inside the loop reads a value that cannot have changed. Yielding
 * on a macrotask (not a microtask, which drains before the message queue) is
 * what makes those checks mean anything.
 * @returns {Promise<void>}
 */
function yieldToMessages() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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
async function handleIndexPaths(data) {
  const { paths, creatureTypeMappings, excludedFolders, excludedFilenameTerms } = data;

  // Reset cancellation flag at start of operation
  cancelled = false;

  // Reset compiled exclusion caches so re-index with different settings works correctly
  compiledExcludedPatterns = null;
  compiledExcludedFolders = null;

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

  // Compiled once per run: the mappings arrive fresh from the main thread each
  // time, so this cannot be hoisted to module scope.
  const compiledCategorizer = compileCategorizer(creatureTypeMappings);

  // Initialize empty index structure
  const categories = {};
  for (const category of Object.keys(creatureTypeMappings)) {
    categories[category] = {};
  }
  // Paths are interned in pathList and referenced by id everywhere else. Sending
  // the strings back repeated across allPaths, categories and termIndex cost
  // 39 MB of structured clone on a 50k library — deserialized on the main
  // thread, which is exactly what this worker exists to keep free.
  const pathList = [];
  const allPaths = [];
  const pathIds = new Map();

  // Send initial progress
  self.postMessage({
    type: 'progress',
    processed: 0,
    total: paths.length,
    imagesFound: 0,
  });

  let imagesFound = 0;
  const PROGRESS_BATCH = 1000;
  // Yield rarely: the queue only has to drain often enough for a cancel to feel
  // immediate, and each yield costs a macrotask round-trip.
  const YIELD_EVERY = 5000;

  // Process each path
  for (let i = 0; i < paths.length; i++) {
    if (i > 0 && i % YIELD_EVERY === 0) await yieldToMessages();
    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

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
    if (
      !path ||
      pathIds.has(path) ||
      isExcludedPath(path, excludedFolders, excludedFilenameTerms)
    ) {
      continue;
    }

    // Extract name from path if not provided
    const imageName =
      name ||
      path
        .split('/')
        .pop()
        ?.replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ') ||
      'Unknown';

    // Try to categorize the image
    const { category, subcategories } = categorizeImage(path, imageName, compiledCategorizer);

    // ALWAYS index the path (even if uncategorized) for general search
    const id = pathList.length;
    pathList.push(path);
    pathIds.set(path, id);
    allPaths.push({
      name: imageName,
      category: category || null,
      subcategories: subcategories || [],
    });

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
        categories[category][subcategory].push(id);
      }

      // Also add to a "_all" subcategory for the category
      if (!categories[category]._all) {
        categories[category]._all = [];
      }
      categories[category]._all.push(id);
    }

    // Report progress every 1000 items
    if ((i + 1) % PROGRESS_BATCH === 0) {
      reportProgress(i + 1, paths.length, imagesFound);
    }
  }

  // Send final progress update
  reportProgress(paths.length, paths.length, imagesFound);

  // Build termIndex from allPaths (O(1) search term lookups on main thread)
  // Uses same tokenization regex as IndexService.tokenizeSearchText() — keep in sync
  const termIndex = {};
  for (let id = 0; id < pathList.length; id++) {
    if (id > 0 && id % YIELD_EVERY === 0) await yieldToMessages();
    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }
    const searchText = `${pathList[id]} ${allPaths[id].name}`.toLowerCase();
    const terms = searchText.split(/[/\\\-_\s.]+/).filter((t) => t.length > 0);
    for (const term of new Set(terms)) {
      if (!termIndex[term]) termIndex[term] = [];
      termIndex[term].push(id);
    }
  }

  // Send completion message with results
  self.postMessage({
    type: 'complete',
    result: { categories, pathList, allPaths, termIndex },
    imagesFound,
    total: paths.length,
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
    imagesFound,
  });
}

/**
 * Load Fuse.js library from CDN
 * SYNC: Keep in sync with Utils.js loadFuse()
 * @returns {Promise<Function|null>} Fuse constructor or null
 */
async function loadFuse() {
  if (FuseClass) return FuseClass;

  try {
    const module = await import(FUSE_CDN);
    const Candidate = module.default;
    if (!_validateFuseShape(Candidate)) {
      console.error(
        'IndexWorker: Fuse.js loaded but failed shape validation — possible CDN compromise'
      );
      self.postMessage({
        type: 'error',
        message: 'Fuse.js failed integrity validation after loading from CDN',
      });
      return null;
    }
    FuseClass = Candidate;
    return FuseClass;
  } catch (error) {
    console.error('IndexWorker: Failed to load Fuse.js:', error);
    self.postMessage({
      type: 'error',
      message: `Failed to load Fuse.js: ${error.message}`,
    });
    return null;
  }
}

/**
 * Validate that a loaded Fuse candidate has the expected constructor shape.
 * SYNC: Keep in sync with Utils.js _validateFuseShape()
 * @param {*} Candidate
 * @returns {boolean}
 */
function _validateFuseShape(Candidate) {
  try {
    if (typeof Candidate !== 'function') return false;
    const instance = new Candidate([{ name: 'test' }], { keys: ['name'] });
    if (typeof instance.search !== 'function') return false;
    const results = instance.search('test');
    return Array.isArray(results);
  } catch {
    return false;
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
  const { searchTerms, index: inlineIndex, options } = data;

  // Reset cancellation flag at start of operation
  cancelled = false;

  // Use persisted index if available, otherwise fall back to inline index
  const index = persistedSearchIndex || inlineIndex;

  // Validate input
  if (!Array.isArray(searchTerms)) {
    throw new Error('searchTerms must be an array');
  }
  if (!Array.isArray(index)) {
    throw new Error('index must be an array — send setSearchIndex or include index in data');
  }
  if (!options || typeof options !== 'object') {
    throw new Error('options must be an object');
  }

  // Load Fuse.js — if loadFuse() fails, it already posts an 'error' message
  const Fuse = await loadFuse();
  if (!Fuse) return;

  // Check for cancellation after async operation
  if (cancelled) {
    self.postMessage({ type: 'cancelled' });
    return;
  }

  // Create Fuse instance
  // @ts-expect-error Fuse loaded dynamically via importScripts in Worker scope
  const fuse = new Fuse(index, options);
  const results = [];
  const seenPaths = new Set();

  // Send initial progress
  self.postMessage({
    type: 'progress',
    current: 0,
    total: searchTerms.length,
    term: '',
  });

  // Search for each term
  for (let i = 0; i < searchTerms.length; i++) {
    // Each term is a full Fuse pass over the index, so yield on every one.
    if (i > 0) await yieldToMessages();
    if (cancelled) {
      self.postMessage({ type: 'cancelled' });
      return;
    }

    const term = searchTerms[i];

    // Send progress update
    self.postMessage({
      type: 'progress',
      current: i + 1,
      total: searchTerms.length,
      term: term,
    });

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
        score: result.score,
      });
    }
  }

  // Send completion message with results
  self.postMessage({
    type: 'complete',
    result: results,
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
/**
 * Compile CREATURE_TYPE_MAPPINGS into a structure `categorizeWith()` can search
 * quickly and deterministically.
 *
 * Two things are precomputed. Terms are lowercased once instead of once per
 * image — the naive loop re-lowercased all 444 terms for every path, which on a
 * 50k library is 22 million throwaway strings. And terms are bucketed by their
 * first two characters: a term of two or more characters can only occur in the
 * search text if its opening bigram does, so scanning the text's own bigrams
 * tests a handful of candidate terms instead of all 444. The result is
 * identical, verified path-by-path against the naive loop.
 *
 * `categoryIndex` and `termIndex` preserve declaration order, which is what
 * breaks ties — without them the winning category would depend on which bigram
 * happened to be scanned first.
 *
 * SYNC: Keep in sync with IndexService.js compileCategorizer()
 * @param {Object<string, string[]>} mappings - Category to search terms
 * @returns {{categories: string[], buckets: Map<string, Array>, shortTerms: Array}}
 */
function compileCategorizer(mappings) {
  const categories = Object.keys(mappings);
  const buckets = new Map();
  const shortTerms = [];

  categories.forEach((category, categoryIndex) => {
    mappings[category].forEach((original, termIndex) => {
      const lower = String(original).toLowerCase();
      if (!lower) return;
      const entry = { category, categoryIndex, original, termIndex, lower };
      // A single character has no bigram to bucket on, so it is always tested.
      if (lower.length < 2) {
        shortTerms.push(entry);
        return;
      }
      const key = lower.slice(0, 2);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = [];
        buckets.set(key, bucket);
      }
      bucket.push(entry);
    });
  });

  return { categories, buckets, shortTerms };
}

/**
 * Pick the category whose terms appear most often in the given text.
 *
 * Ties go to the category declared first in CREATURE_TYPE_MAPPINGS, and matched
 * terms come back in declaration order, so the worker and the main-thread
 * fallback cannot disagree about where an image belongs.
 *
 * SYNC: Keep in sync with IndexService.js categorizeWith()
 * @param {{categories: string[], buckets: Map<string, Array>, shortTerms: Array}} compiled
 * @param {string} searchText - Lowercased path and name
 * @returns {{category: string|null, subcategories: string[]}}
 */
function categorizeWith(compiled, searchText) {
  const { categories, buckets, shortTerms } = compiled;
  const hits = new Map();

  const consider = (entry) => {
    if (!searchText.includes(entry.lower)) return;
    let matched = hits.get(entry.category);
    if (!matched) {
      matched = [];
      hits.set(entry.category, matched);
    }
    matched.push(entry);
  };

  const seenBigrams = new Set();
  for (let i = 0; i < searchText.length - 1; i++) {
    const key = searchText.slice(i, i + 2);
    if (seenBigrams.has(key)) continue;
    seenBigrams.add(key);
    const bucket = buckets.get(key);
    if (bucket) {
      for (const entry of bucket) consider(entry);
    }
  }
  for (const entry of shortTerms) consider(entry);

  let bestCategory = null;
  let best = null;
  let maxMatches = 0;
  for (const category of categories) {
    const matched = hits.get(category);
    if (matched && matched.length > maxMatches) {
      maxMatches = matched.length;
      bestCategory = category;
      best = matched;
    }
  }

  if (!best) return { category: null, subcategories: [] };

  best.sort((a, b) => a.termIndex - b.termIndex);
  return { category: bestCategory, subcategories: best.map((entry) => entry.original) };
}

/**
 * Categorize an image using the compiled categorizer for this run.
 * @param {string} path - Image path
 * @param {string} name - Image display name
 * @param {Object} compiled - Result of compileCategorizer()
 * @returns {{category: string|null, subcategories: string[]}}
 */
function categorizeImage(path, name, compiled) {
  return categorizeWith(compiled, `${path} ${name}`.toLowerCase());
}

/**
 * CDN URL segments to skip when checking folder exclusions
 * These are common in Forge bazaar URLs: https://assets.forge-vtt.com/bazaar/assets/...
 * SYNC: Keep in sync with Utils.js CDN_SEGMENTS
 */
const CDN_SEGMENTS = new Set([
  'https:',
  'http:',
  '',
  'bazaar',
  'assets',
  'modules',
  'systems',
  'assets.forge-vtt.com',
  'forge-vtt.com',
  'foundryvtt.com',
  'www',
  'cdn',
  'static',
  'public',
  'uploads',
  'files',
]);

/**
 * Precompiled RegExp patterns for excluded filename terms
 * Built once on first call, reused across all isExcludedPath() invocations
 * Matches Utils.js behavior: \b${term}\b (full word boundary on both sides)
 */
let compiledExcludedPatterns = null;

/**
 * Precompiled Set for excluded folders (O(1) lookup instead of O(N) array scan)
 */
let compiledExcludedFolders = null;

/**
 * Check if a path should be excluded from indexing
 * Checks both folder names and filename for environmental/prop terms
 *
 * SYNC: Keep in sync with Utils.js isExcludedPath()
 * @param {string} path - Path to check
 * @param {Array} excludedFolders - Folder names to exclude
 * @param {Array} excludedFilenameTerms - Filename terms to exclude
 * @returns {boolean} True if path should be excluded
 */
function isExcludedPath(path, excludedFolders, excludedFilenameTerms) {
  if (!path) return true;

  // Precompile patterns on first call (once per worker lifetime)
  if (!compiledExcludedPatterns) {
    compiledExcludedPatterns = excludedFilenameTerms.map(
      (term) => new RegExp(`\\b${term}\\b`, 'i')
    );
  }
  if (!compiledExcludedFolders) {
    compiledExcludedFolders = new Set(excludedFolders);
  }

  const pathLower = path.toLowerCase();
  const segments = pathLower.split('/');

  // Filter out CDN segments and check remaining folder names
  const folderSegments = segments.filter((s) => !CDN_SEGMENTS.has(s) && s.length > 0);

  // Check folder names against exclusion Set (O(1) per segment)
  if (folderSegments.some((segment) => compiledExcludedFolders.has(segment))) {
    return true;
  }

  // Also check filename for environmental/prop terms
  const filename = segments[segments.length - 1] || '';
  // Remove extension and convert separators to spaces for word matching
  const filenameClean = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .toLowerCase();

  // Check if filename contains excluded terms using precompiled patterns
  // Match as word boundary on both sides: "cliff_entrance" matches "cliff", but "clifford" doesn't
  return compiledExcludedPatterns.some((pattern) => pattern.test(filenameClean));
}
