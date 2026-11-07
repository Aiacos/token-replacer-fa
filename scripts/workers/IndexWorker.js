/**
 * Token Replacer FA - Index Worker
 * Web Worker for background index building without blocking the main thread
 *
 * This worker processes token image paths and categorizes them by creature type.
 * Unlike the main-thread fallback, it yields only every 5000 paths — just often
 * enough for a queued cancel to be dispatched — keeping the UI responsive.
 *
 * It is a classic (non-module) worker script, so it cannot import from the
 * module. Every piece of state lives in one IndexWorkerRuntime instance; the
 * only top-level functions are the helpers duplicated with the main thread,
 * which tests/core/worker-sync.test.js pins against their other copy.
 *
 * Message protocol (consumed by IndexService and SearchOrchestrator):
 * in  `{ command: 'indexPaths'|'fuzzySearch'|'setSearchIndex'|'cancel'|'ping', data }`
 * out `{ type: 'progress'|'complete'|'cancelled'|'error'|'indexSet'|'pong', ... }`
 *
 * @module workers/IndexWorker
 */

/**
 * Fuse.js CDN URL - loaded dynamically when needed
 */
const FUSE_CDN = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

/**
 * Cancellation flag shared by the worker's long-running commands.
 *
 * The protocol carries no request id, so a cancel cannot name the run it means:
 * it stops whatever is in flight, and every command that starts resets the flag.
 * IndexService relies on exactly that reset ("the worker resets its own cancel
 * flag when a command arrives"), which is why one token is reused rather than a
 * fresh token issued per run.
 *
 * @pattern Cancellation Token — a handler polls `isCancelled` between batches
 *   instead of reading mutable module state, and the runtime owning the token is
 *   the only thing that can flip it.
 */
class CancellationToken {
  constructor() {
    this._cancelled = false;
  }

  /** @returns {boolean} True once cancel() was called since the last reset() */
  get isCancelled() {
    return this._cancelled;
  }

  /** Ask the running command to stop at its next check. */
  cancel() {
    this._cancelled = true;
  }

  /** Clear a previous cancel at the start of a new command. */
  reset() {
    this._cancelled = false;
  }
}

/**
 * Owns every piece of worker state and dispatches incoming commands.
 *
 * @pattern Command — each protocol command is a handler registered once in a
 *   Map, so dispatch is one lookup with no switch to grow, and a command name
 *   such as "toString" cannot resolve through Object.prototype.
 */
class IndexWorkerRuntime {
  /**
   * @param {{postMessage: Function, addEventListener: Function}} scope - The
   *   worker global (`self`), or a stand-in under test
   * @param {() => Promise<Function>} [fuseLoader] - Resolves the Fuse
   *   constructor or rejects with a reportable error; injected under test,
   *   because the sandbox has no network
   */
  constructor(scope, fuseLoader = loadFuse) {
    this._scope = scope;
    this._fuseLoader = fuseLoader;
    this._cancellation = new CancellationToken();
    /** Validated Fuse constructor; stays null after a failed load so the next search retries. */
    this._Fuse = null;
    /**
     * Search index set once via 'setSearchIndex' and reused by every fuzzySearch,
     * so the full index is not structured-cloned on each search.
     */
    this._searchIndex = null;

    // Built once: dispatch must not allocate per message.
    /** @type {Map<string, (data: any) => (Promise<void>|void)>} */
    this._commands = new Map([
      ['indexPaths', (data) => this._indexPaths(data, this._cancellation)],
      ['fuzzySearch', (data) => this._fuzzySearch(data, this._cancellation)],
      ['setSearchIndex', (data) => this._setSearchIndex(data)],
      // Running handlers detect the flag and post 'cancelled' themselves.
      ['cancel', () => this._cancellation.cancel()],
      ['ping', () => this._post({ type: 'pong' })],
    ]);
  }

  /** Start receiving commands from the main thread. */
  listen() {
    this._scope.addEventListener('message', (event) => this.handle(event.data));
  }

  /**
   * Run one command. Every failure becomes an 'error' message — a worker that
   * throws into the void leaves the main thread waiting for its timeout.
   * @param {{command: string, data?: any}} message - Message from the main thread
   */
  handle(message) {
    const { command, data } = message;
    const handler = this._commands.get(command);

    if (!handler) {
      console.warn(`IndexWorker: unknown command "${command}"`);
      this._post({ type: 'error', message: `Unknown command: ${command}` });
      return;
    }

    try {
      const pending = handler(data);
      if (pending) {
        pending.catch((error) => this._post({ type: 'error', message: error.message }));
      }
    } catch (error) {
      console.error('IndexWorker error:', error);
      this._post({ type: 'error', message: error.message });
    }
  }

  /**
   * @param {object} message - Protocol message for the main thread
   */
  _post(message) {
    this._scope.postMessage(message);
  }

  /**
   * Hand the event loop back so queued messages — a cancel, above all — can be
   * dispatched.
   *
   * A worker is single-threaded: while a synchronous loop runs, `postMessage` from
   * the page sits in the queue and the cancellation flag can never flip, so every
   * cancel check inside the loop reads a value that cannot have changed. Yielding
   * on a macrotask (not a microtask, which drains before the message queue) is
   * what makes those checks mean anything.
   * @returns {Promise<void>}
   */
  _yieldToMessages() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Send progress update to main thread
   *
   * @param {number} processed - Number of paths processed
   * @param {number} total - Total number of paths
   * @param {number} imagesFound - Number of images added to index
   */
  _reportProgress(processed, total, imagesFound) {
    this._post({
      type: 'progress',
      processed,
      total,
      imagesFound,
    });
  }

  /**
   * @param {{index: Array}} data - Search index to keep for later fuzzySearch calls
   */
  _setSearchIndex(data) {
    this._searchIndex = data.index;
    this._post({
      type: 'indexSet',
      count: Array.isArray(data.index) ? data.index.length : 0,
    });
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
   * @param {CancellationToken} token - Polled between batches
   */
  async _indexPaths(data, token) {
    const { paths, creatureTypeMappings, excludedFolders, excludedFilenameTerms } = data;

    // Reset cancellation flag at start of operation
    token.reset();

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

    // Compiled once per run, never kept: the settings arrive fresh from the main
    // thread each time, and a cache that outlived its run once made a re-index
    // with different settings reuse the old exclusions.
    const compiledCategorizer = compileCategorizer(creatureTypeMappings);
    const excludedFolderSet = new Set(excludedFolders);
    // Matches PathFilter.js: \b${term}\b (full word boundary on both sides)
    const excludedPatterns = excludedFilenameTerms.map((term) => new RegExp(`\\b${term}\\b`, 'i'));

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
    this._post({
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
      if (i > 0 && i % YIELD_EVERY === 0) await this._yieldToMessages();
      if (token.isCancelled) {
        this._post({ type: 'cancelled' });
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
      if (!path || pathIds.has(path) || isExcludedPath(path, excludedFolderSet, excludedPatterns)) {
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
      const { category, subcategories } = categorizeWith(
        compiledCategorizer,
        `${path} ${imageName}`.toLowerCase()
      );

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
        this._reportProgress(i + 1, paths.length, imagesFound);
      }
    }

    // Send final progress update
    this._reportProgress(paths.length, paths.length, imagesFound);

    // Build termIndex from allPaths (O(1) search term lookups on main thread)
    // Uses same tokenization regex as IndexService.tokenizeSearchText() — keep in sync
    const termIndex = {};
    for (let id = 0; id < pathList.length; id++) {
      if (id > 0 && id % YIELD_EVERY === 0) await this._yieldToMessages();
      if (token.isCancelled) {
        this._post({ type: 'cancelled' });
        return;
      }
      const searchText = `${pathList[id]} ${allPaths[id].name}`.toLowerCase();
      const terms = searchText.split(/[/\\\-_\s.]+/).filter((t) => t.length > 0);
      for (const term of new Set(terms)) {
        // A plain-object lookup would return Object for the term "constructor".
        if (!Object.hasOwn(termIndex, term)) termIndex[term] = [];
        termIndex[term].push(id);
      }
    }

    // Send completion message with results
    this._post({
      type: 'complete',
      result: { categories, pathList, allPaths, termIndex },
      imagesFound,
      total: paths.length,
    });
  }

  /**
   * Resolve the Fuse constructor, loading it on first use. A failed load is not
   * remembered, so the next search retries the CDN.
   * @returns {Promise<Function>}
   */
  async _loadFuseOnce() {
    if (!this._Fuse) this._Fuse = await this._fuseLoader();
    return this._Fuse;
  }

  /**
   * Handle the fuzzySearch command
   * Performs fuzzy search on an index using Fuse.js
   *
   * @param {Object} data - Input data from main thread
   * @param {Array} data.searchTerms - Array of search terms
   * @param {Array} data.index - Array of items to search
   * @param {Object} data.options - Fuse.js options (keys, threshold, etc.)
   * @param {CancellationToken} token - Polled between terms
   */
  async _fuzzySearch(data, token) {
    const { searchTerms, index: inlineIndex, options } = data;

    // Reset cancellation flag at start of operation
    token.reset();

    // Use persisted index if available, otherwise fall back to inline index
    const index = this._searchIndex || inlineIndex;

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

    // A load failure rejects, and handle() reports it as an 'error' message
    const Fuse = await this._loadFuseOnce();

    // Check for cancellation after async operation
    if (token.isCancelled) {
      this._post({ type: 'cancelled' });
      return;
    }

    // Create Fuse instance
    // @ts-expect-error Fuse is a constructor resolved at runtime by dynamic import()
    const fuse = new Fuse(index, options);
    const results = [];
    const seenPaths = new Set();

    // Send initial progress
    this._post({
      type: 'progress',
      current: 0,
      total: searchTerms.length,
      term: '',
    });

    // Search for each term
    for (let i = 0; i < searchTerms.length; i++) {
      // Each term is a full Fuse pass over the index, so yield on every one.
      if (i > 0) await this._yieldToMessages();
      if (token.isCancelled) {
        this._post({ type: 'cancelled' });
        return;
      }

      const term = searchTerms[i];

      // Send progress update
      this._post({
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
    this._post({
      type: 'complete',
      result: results,
    });
  }
}

/**
 * Load Fuse.js library from CDN
 * Unlike the main-thread copy it caches nothing — IndexWorkerRuntime owns the
 * loaded constructor — and it rejects instead of returning null, so the
 * runtime's single error path reports the failure to the main thread.
 * SYNC: Keep in sync with FuseLoader.js load()
 * @returns {Promise<Function>} Validated Fuse constructor
 * @throws {Error} When the import fails or the module fails shape validation
 */
async function loadFuse() {
  let module;
  try {
    module = await import(FUSE_CDN);
  } catch (error) {
    console.error('IndexWorker: Failed to load Fuse.js:', error);
    throw new Error(`Failed to load Fuse.js: ${error.message}`, { cause: error });
  }

  const Candidate = module.default;
  if (!_validateFuseShape(Candidate)) {
    console.error(
      'IndexWorker: Fuse.js loaded but failed shape validation — possible CDN compromise'
    );
    throw new Error('Fuse.js failed integrity validation after loading from CDN');
  }
  return Candidate;
}

/**
 * Validate that a loaded Fuse candidate has the expected constructor shape.
 * SYNC: Keep in sync with FuseLoader.js _validateFuseShape()
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
 * CDN URL segments to skip when checking folder exclusions
 * These are common in Forge bazaar URLs: https://assets.forge-vtt.com/bazaar/assets/...
 * SYNC: Keep in sync with PathFilter.js CDN_SEGMENTS
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
 * Check if a path should be excluded from indexing
 * Checks both folder names and filename for environmental/prop terms
 *
 * The rules arrive compiled because they change per indexPaths run: a pure
 * function cannot hold a stale copy of a previous run's settings.
 *
 * SYNC: Keep in sync with PathFilter.js isExcluded()
 * @param {string} path - Path to check
 * @param {Set<string>} excludedFolders - Folder names to exclude, matched against lowercased segments
 * @param {RegExp[]} excludedPatterns - Compiled whole-word filename terms
 * @returns {boolean} True if path should be excluded
 */
function isExcludedPath(path, excludedFolders, excludedPatterns) {
  if (!path) return true;

  const pathLower = path.toLowerCase();
  const segments = pathLower.split('/');

  // Filter out CDN segments and check remaining folder names
  const folderSegments = segments.filter((s) => !CDN_SEGMENTS.has(s) && s.length > 0);

  // Check folder names against exclusion Set (O(1) per segment)
  if (folderSegments.some((segment) => excludedFolders.has(segment))) {
    return true;
  }

  // Also check filename for environmental/prop terms
  const filename = segments[segments.length - 1] || '';
  // Remove extension and convert separators to spaces for word matching
  const filenameClean = filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]/g, ' ')
    .toLowerCase();

  // Match as word boundary on both sides: "cliff_entrance" matches "cliff", but "clifford" doesn't
  return excludedPatterns.some((pattern) => pattern.test(filenameClean));
}

new IndexWorkerRuntime(self).listen();
