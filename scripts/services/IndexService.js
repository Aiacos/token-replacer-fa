/**
 * Token Replacer FA - Index Service
 * Hierarchical JSON index organized by creature category
 * Features: Automatic updates based on configurable frequency
 * @module services/IndexService
 */

import {
  MODULE_ID,
  CREATURE_TYPE_MAPPINGS,
  EXCLUDED_FOLDERS,
  EXCLUDED_FILENAME_TERMS,
} from '../core/Constants.js';
import { pathFilter } from '../core/PathFilter.js';
import { ModuleError } from '../core/ModuleError.js';
import { localizer } from '../core/Localizer.js';
import { Settings } from '../core/Settings.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { storageService } from './StorageService.js';
import { CancellationToken } from './index/CancellationToken.js';
import { TermIndex } from './index/TermIndex.js';
import { IndexRepository } from './index/IndexRepository.js';
import { IndexBuildProgress } from './index/IndexBuildProgress.js';
import { TvaPathSourceChain } from './index/TvaPathSourceChain.js';
import { DirectIndexBuilder } from './index/DirectIndexBuilder.js';
import { WorkerIndexBuilder } from './index/WorkerIndexBuilder.js';
import { TvaSearchIndexBuilder } from './index/TvaSearchIndexBuilder.js';

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
 * SYNC: Keep in sync with IndexWorker.js compileCategorizer()
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
 * SYNC: Keep in sync with IndexWorker.js categorizeWith()
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
 * Hierarchical index of every token image, organized by creature category,
 * with O(1) term lookups.
 *
 * Stored shape (version 15):
 * {
 *   version, timestamp, lastUpdate,
 *   categories: { beast: { wolf: [id, ...], _all: [id, ...] }, ... },
 *   pathList: ["path1", "path2", ...],                   // paths interned once
 *   allPaths: [ { name, category, subcategories } ],     // parallel to pathList
 *   termIndex: { "term": [id, ...] }                     // ids, never paths
 * }
 *
 * This class keeps the public API and the index itself; the moving parts live
 * in `services/index/`: where TVA's paths come from (TvaPathSourceChain), how
 * the index is built (WorkerIndexBuilder, DirectIndexBuilder,
 * TvaSearchIndexBuilder), how it is persisted (IndexRepository), and the
 * term map rules (TermIndex). Every collaborator is built once, here — none per
 * search (Constitution, Article IV).
 *
 * @pattern Facade — callers (main.js, SearchOrchestrator) see one service with
 *   build/search/cancel; the strategies, the source chain and the repository
 *   behind it can change without touching them.
 */
export class IndexService {
  /**
   * Storage key of the persisted index. Callers that only need to know whether
   * a cached index exists (to tell a first-time build from a refresh) read it
   * here rather than hard-coding the string.
   */
  static CACHE_KEY = IndexRepository.CACHE_KEY;

  /** Refresh intervals for the `indexUpdateFrequency` setting, in ms. */
  static UPDATE_FREQUENCIES = Object.freeze({
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
    monthly: 30 * 24 * 60 * 60 * 1000,
    quarterly: 90 * 24 * 60 * 60 * 1000,
  });

  /**
   * @param {Object} [deps={}]
   * @param {Object} [deps.storageService] - Persistence (IndexedDB with localStorage fallback)
   * @param {function(): Worker} [deps.workerFactory] - Builds the index worker
   * @param {function(string, string): *} [deps.getSetting] - Settings accessor
   * @param {function(): Object|undefined} [deps.getTvaAPI] - TVA API accessor
   */
  constructor(deps = {}) {
    const {
      storageService: injectedStorage = storageService,
      workerFactory = () => new Worker(`modules/${MODULE_ID}/scripts/workers/IndexWorker.js`),
      getSetting = Settings.defaultGetter(),
      getTvaAPI = () => game.modules.get('token-variants')?.api,
    } = deps;

    this._storageService = injectedStorage;
    this._workerFactory = workerFactory;
    this._getSetting = getSetting;
    this._getTvaAPI = getTvaAPI;
    this._logger = new DebugLogger('IndexService');

    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
    this.categorizer = compileCategorizer(CREATURE_TYPE_MAPPINGS);
    // Distinguishes a user cancellation from a failure, so build() does not
    // "recover" from a Stop by running the slow path anyway.
    this._cancellation = new CancellationToken();
    /** @type {TermIndex|null} Wrapper of index.termIndex, replaced when that object is */
    this._termIndex = null;
    /** @type {Map<string, number>|null} Derived path → id lookup, never persisted */
    this._pathIds = null;

    const addImage = (path, name) => this.addImageToIndex(path, name);
    this._repository = new IndexRepository({
      storageService: injectedStorage,
      onStorageFull: () => this._warnStorageFull(),
      logger: this._logger,
    });
    this._pathSources = TvaPathSourceChain.createDefault({ getSetting, logger: this._logger });
    this._directBuilder = new DirectIndexBuilder({ addImage, logger: this._logger });
    this._workerBuilder = new WorkerIndexBuilder({
      workerFactory,
      applyResult: (result) => this._adoptWorkerResult(result),
      config: {
        creatureTypeMappings: CREATURE_TYPE_MAPPINGS,
        excludedFolders: EXCLUDED_FOLDERS,
        excludedFilenameTerms: EXCLUDED_FILENAME_TERMS,
      },
      logger: this._logger,
    });
    this._searchBuilder = new TvaSearchIndexBuilder({
      addImage,
      countImages: () => this.index?.pathList?.length ?? 0,
      mappings: CREATURE_TYPE_MAPPINGS,
      logger: this._logger,
    });
  }

  /** @returns {Worker|null} The index worker, if one is running */
  get worker() {
    return this._workerBuilder.worker;
  }

  /**
   * Create the index worker now instead of on the first build.
   * Builds create it themselves; this exists for tests that drive a mock
   * worker before calling indexPathsWithWorker().
   * @returns {Worker|null} The live worker, or null when it cannot be created
   */
  _ensureWorker() {
    return this._workerBuilder.ensureWorker();
  }

  /**
   * Terminate the Web Worker. A later build creates a fresh one.
   * @returns {void}
   */
  terminate() {
    const hadWorker = Boolean(this.worker);
    this._workerBuilder.teardown();
    if (hadWorker) console.log(`${MODULE_ID} | Web Worker terminated`);
  }

  /**
   * Cancel the current index build.
   *
   * Called from the background-indexing notification, which is where the build
   * is actually visible to the user. The replacement dialog deliberately does
   * *not* call this: it never awaits build(), so cancelling there would free
   * some CPU while leaving the session with no category index.
   * @returns {void}
   */
  cancelOperation() {
    // Raised unconditionally: the main-thread fallback has no worker to
    // message, and it is the path most in need of an escape hatch.
    this._cancellation.cancel();
    this._workerBuilder.cancel();
    console.log(`${MODULE_ID} | Cancellation requested`);
  }

  /**
   * Get the configured update frequency in milliseconds
   * @returns {number} Frequency in ms
   */
  getUpdateFrequency() {
    const { UPDATE_FREQUENCIES } = IndexService;
    try {
      const setting = this._getSetting(MODULE_ID, 'indexUpdateFrequency');
      return UPDATE_FREQUENCIES[setting] || UPDATE_FREQUENCIES.weekly;
    } catch (error) {
      console.debug(`${MODULE_ID} | indexUpdateFrequency unavailable, using weekly:`, error);
      return UPDATE_FREQUENCIES.weekly;
    }
  }

  /**
   * Check if the index needs updating based on frequency setting
   * @returns {boolean} True if update is needed
   */
  needsUpdate() {
    if (!this.index?.lastUpdate) return true;
    return Date.now() - this.index.lastUpdate > this.getUpdateFrequency();
  }

  /**
   * Determine which category and subcategories an image belongs to
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {{category: string|null, subcategories: string[]}}
   */
  categorizeImage(path, name) {
    if (!path || typeof path !== 'string') {
      this._logger.log('Invalid path in categorizeImage:', path);
      return { category: null, subcategories: [] };
    }
    return categorizeWith(this.categorizer, `${path} ${name || ''}`.toLowerCase());
  }

  /**
   * Tokenize search text into unique lowercase terms (split on / \ - _ space .)
   * @param {string} text - Text to tokenize (e.g., file path)
   * @returns {string[]} Unique terms
   */
  tokenizeSearchText(text) {
    return TermIndex.tokenize(text);
  }

  /**
   * Load index from storage
   * @returns {Promise<boolean>} True if loaded successfully
   */
  async loadFromCache() {
    const data = await this._repository.load();
    if (!data) return false;

    this.index = data;
    this._rebuildPathIds();
    const imageCount = data.pathList.length;
    this._logger.log(`Loaded index from cache: ${imageCount} images`);
    console.log(`${MODULE_ID} | Loaded index from cache: ${imageCount} images`);

    // Indexes cached before v2.11.3 carry no termIndex: rebuild it once, then
    // save, so the cost is paid by one session only.
    if (imageCount > 0 && new TermIndex(data.termIndex ?? {}).isEmpty) {
      console.log(`${MODULE_ID} | Rebuilding termIndex from cached allPaths...`);
      const rebuilt = TermIndex.rebuild(data.pathList, data.allPaths);
      data.termIndex = rebuilt.toPlainObject();
      console.log(
        `${MODULE_ID} | termIndex rebuilt: ${rebuilt.size} unique terms from ${imageCount} images`
      );
      await this.saveToCache();
    }

    return true;
  }

  /**
   * Save index to storage
   * @returns {Promise<boolean>} True only if storage accepted it
   */
  async saveToCache() {
    return this._repository.save(this.index);
  }

  /**
   * Tell the user the index will not survive the session.
   * @returns {void}
   */
  _warnStorageFull() {
    if (typeof ui === 'undefined' || !ui.notifications) return;
    ui.notifications.warn(
      localizer.orEnglish(
        'notifications.storageFull',
        'Token Replacer FA: browser storage is full, so the index will be rebuilt every session.'
      )
    );
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
      version: IndexRepository.VERSION,
      timestamp: Date.now(),
      lastUpdate: Date.now(),
      categories,
      // Paths are interned here once and referenced by index everywhere else.
      // Repeating the strings cost 39 MB of structured clone on a 50k library —
      // paid on the main thread, which is what the Web Worker exists to spare.
      pathList: [],
      allPaths: [],
      termIndex: {},
    };
  }

  /**
   * Rebuild the path -> id lookup used to skip already-indexed paths.
   * Derived state: never serialized, because it is exactly as large as
   * pathList and trivially recomputed.
   * @private
   */
  _rebuildPathIds() {
    this._pathIds = new Map();
    const pathList = this.index?.pathList ?? [];
    for (let id = 0; id < pathList.length; id++) this._pathIds.set(pathList[id], id);
  }

  /**
   * The TermIndex over the current `index.termIndex`. Re-wrapped only when that
   * object is replaced (a worker result, a cache load), never per search.
   * @returns {TermIndex}
   * @private
   */
  _terms() {
    const plain = this.index.termIndex;
    if (!this._termIndex?.wraps(plain)) this._termIndex = new TermIndex(plain);
    return this._termIndex;
  }

  /**
   * Adopt the structures the worker built.
   * @param {Object} result - `{ categories, pathList, allPaths, termIndex }`
   * @returns {boolean} False when the index was cleared while the worker ran
   * @private
   */
  _adoptWorkerResult(result) {
    if (!this.index) return false;
    this.index.categories = result.categories;
    this.index.pathList = result.pathList || [];
    this.index.allPaths = result.allPaths;
    this.index.termIndex = result.termIndex || {};
    this._rebuildPathIds();
    return true;
  }

  /**
   * Turn a path id into a search result.
   * @private
   * @param {number} id - Index into pathList
   * @param {Object} [extra={}] - Extra fields merged into the result
   * @returns {Object|null} Result object, or null when the id is dangling
   */
  _resultForId(id, extra = {}) {
    const path = this.index?.pathList?.[id];
    const data = this.index?.allPaths?.[id];
    if (path === undefined || !data) return null;
    return { path, name: data.name, source: 'index', category: data.category, ...extra };
  }

  /**
   * Add an image to the index
   * Stores ALL images in allPaths for general search, categorizes when possible
   * @param {string} path - Image path
   * @param {string} name - Image name
   * @returns {boolean} True if image was added, false if skipped
   */
  addImageToIndex(path, name) {
    if (!path || typeof path !== 'string') {
      this._logger.log('Invalid path in addImageToIndex:', path);
      return false;
    }

    if (!this.index || !this.index.pathList || !this.index.allPaths || !this.index.termIndex) {
      this._logger.log('Index not initialized, cannot add image');
      return false;
    }

    if (!this._pathIds || this._pathIds.size !== this.index.pathList.length) {
      this._rebuildPathIds();
    }

    if (this._pathIds.has(path) || pathFilter.isExcluded(path)) return false;

    try {
      const imageName =
        name ||
        path
          .split('/')
          .pop()
          ?.replace(/\.[^/.]+$/, '')
          .replace(/[-_]/g, ' ') ||
        'Unknown';

      const { category, subcategories } = this.categorizeImage(path, imageName);

      // ALWAYS index the path (even if uncategorized) for general search
      const id = this.index.pathList.length;
      this.index.pathList.push(path);
      this._pathIds.set(path, id);
      this.index.allPaths.push({
        name: imageName,
        category: category || null,
        subcategories: subcategories || [],
      });

      this._terms().addText(`${path} ${imageName}`, id);

      if (category) {
        const { categories } = this.index;
        if (!Object.hasOwn(categories, category)) categories[category] = {};
        const bucket = categories[category];
        for (const subcat of [...subcategories, '_all']) {
          if (!Object.hasOwn(bucket, subcat)) bucket[subcat] = [];
          bucket[subcat].push(id);
        }
      }

      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error adding image to index (${path}):`, error);
      return false;
    }
  }

  /**
   * Build index from TVA.
   *
   * Asks TvaPathSourceChain for TVA's image paths (pre-loaded cache first, then
   * TVA's undocumented cache locations) and indexes them in the worker, falling
   * back to the main thread. When no source has paths, falls back to one TVA
   * search per creature term.
   *
   * @param {Function} onProgress - Progress callback
   * @param {Array} tvaCacheImages - Optional pre-loaded TVA cache images from TVACacheService
   * @returns {Promise<number>} Number of images indexed
   * @throws {ModuleError} Structured error if TVA is not available or the build fails
   */
  async buildFromTVA(onProgress = null, tvaCacheImages = null) {
    const tvaAPI = this._getTvaAPI();
    if (!tvaAPI) {
      this._logger.log('TVA API not available');
      console.warn(`${MODULE_ID} | TVA API not available`);
      throw ModuleError.of(
        'tva_missing',
        'Token Variant Art module is not installed, enabled, or its API is not available',
        ['install_tva', 'check_console']
      );
    }

    this._logger.log('Building index from TVA cache...');
    console.log(`${MODULE_ID} | Building index from TVA cache...`);

    try {
      const paths = await this._pathSources.resolve({ tvaAPI, tvaCacheImages });
      if (paths.length > 0) {
        this._logger.log(`Found ${paths.length} paths in TVA cache, indexing...`);
        console.log(`${MODULE_ID} | Found ${paths.length} paths in TVA cache, indexing...`);
        return await this._indexPaths(paths, onProgress);
      }

      // Logged so a bug report shows where a new TVA release keeps its cache.
      console.log(`${MODULE_ID} | Could not find TVA cache directly. Available API methods:`);
      const keys = Object.keys(tvaAPI);
      console.log(
        `${MODULE_ID} | Methods:`,
        keys.filter((k) => typeof tvaAPI[k] === 'function')
      );
      console.log(
        `${MODULE_ID} | Properties:`,
        keys.filter((k) => typeof tvaAPI[k] !== 'function')
      );

      console.log(`${MODULE_ID} | Falling back to broad search...`);
      return await this.buildFromTVASearch(onProgress);
    } catch (error) {
      // A cancellation carries no errorType, so wrapping it here would relabel
      // a deliberate stop as an index-build failure and strip the marker every
      // caller uses to tell the two apart.
      if (error?.cancelled) throw error;
      this._logger.log('Error during TVA index build:', error);
      if (error?.errorType) throw error;
      throw ModuleError.of(
        'index_build_failed',
        `Failed to build index from TVA: ${error?.message || 'Unknown error'}`,
        ['rebuild_cache', 'reload_module', 'check_console']
      );
    }
  }

  /**
   * Index paths in the worker when one can be created, else on the main thread.
   * A worker failure falls back to the main thread; a cancellation never does,
   * because the slow path is exactly what the user just asked to stop.
   * @param {Array} paths - Paths or `{path, name}` objects
   * @param {Function|null} onProgress - Progress callback
   * @returns {Promise<number>} Images indexed
   * @private
   */
  async _indexPaths(paths, onProgress) {
    if (!this._workerBuilder.ensureWorker()) {
      console.log(`${MODULE_ID} | Using fallback method (main thread with yields)`);
      return this.indexPathsDirectly(paths, onProgress);
    }

    console.log(`${MODULE_ID} | Using Web Worker for background index building`);
    try {
      return await this.indexPathsWithWorker(paths, onProgress);
    } catch (error) {
      if (error?.cancelled) throw error;
      console.warn(`${MODULE_ID} | Worker failed, falling back to direct indexing:`, error);
      // A fresh worker is created on the next build, so one transient failure
      // does not cost the session its background indexing.
      this._workerBuilder.teardown();
      this._notifyWorkerFallback();
      return this.indexPathsDirectly(paths, onProgress);
    }
  }

  /**
   * Tell the user the build continues on the slower main-thread path.
   * @returns {void}
   * @private
   */
  _notifyWorkerFallback() {
    try {
      ui.notifications.warn(
        localizer.orEnglish(
          'notifications.workerFallback',
          'Token Replacer FA: Background worker failed, using slower method.'
        ),
        { permanent: false }
      );
    } catch (error) {
      // ui.notifications may not exist yet during early init.
      console.debug(`${MODULE_ID} | Worker fallback notification not shown:`, error);
    }
  }

  /**
   * Index paths in the Web Worker, without blocking the main thread.
   * @param {Array} paths - Paths or `{path, name}` objects
   * @param {Function} onProgress - Progress callback (throttled to ~10% steps)
   * @returns {Promise<number>} Number of images indexed
   * @throws {ModuleError} worker_failed, invalid_paths, or a cancellation
   */
  async indexPathsWithWorker(paths, onProgress = null) {
    return this._workerBuilder.build(
      paths,
      IndexBuildProgress.throttle(onProgress),
      this._cancellation
    );
  }

  /**
   * Index paths on the main thread, yielding between batches.
   * @param {Array} paths - Paths or `{path, name}` objects
   * @param {Function} onProgress - Progress callback (throttled to ~10% steps)
   * @returns {Promise<number>} Number of images indexed
   * @throws {ModuleError} invalid_paths, index_build_failed, or a cancellation
   */
  async indexPathsDirectly(paths, onProgress = null) {
    return this._directBuilder.build(
      paths,
      IndexBuildProgress.throttle(onProgress),
      this._cancellation
    );
  }

  /**
   * Fallback: build the index from one TVA doImageSearch per creature term.
   * @param {Function} onProgress - Progress callback (throttled to ~10% steps)
   * @returns {Promise<number>} Number of images indexed
   */
  async buildFromTVASearch(onProgress = null) {
    return this._searchBuilder.build(this._getTvaAPI(), IndexBuildProgress.throttle(onProgress));
  }

  /**
   * Build or update the index
   * @param {boolean} forceRebuild - Force full rebuild
   * @param {Function} onProgress - Progress callback
   * @param {Array} tvaCacheImages - Optional pre-loaded TVA cache images from TVACacheService
   * @returns {Promise<boolean>} True if successful
   * @throws {ModuleError} Structured error if build fails
   */
  async build(forceRebuild = false, onProgress = null, tvaCacheImages = null) {
    if (this.buildPromise) {
      this._logger.log('Build already in progress, returning existing promise');
      return this.buildPromise;
    }

    // A cancel from a previous run must not abort this one before it starts.
    this._cancellation.reset();

    this.buildPromise = (async () => {
      const startTime = performance.now();
      let cachedIndex = null;
      this._logger.log(`Starting index build (forceRebuild: ${forceRebuild})`);
      console.log(`${MODULE_ID} | Starting index build...`);

      try {
        if (!forceRebuild && (await this.loadFromCache())) {
          if (!this.needsUpdate()) {
            this.isBuilt = true;
            console.log(`${MODULE_ID} | Index loaded from cache, no update needed`);
            return true;
          }
          cachedIndex = this.index;
          console.log(`${MODULE_ID} | Index needs update based on frequency setting`);
        }

        this.index = this.createEmptyIndex();
        await this.buildFromTVA(onProgress, tvaCacheImages);

        const totalImages = this.index.pathList.length;
        if (totalImages > 0) {
          this.index.lastUpdate = Date.now();
          await this.saveToCache();
          this.isBuilt = true;

          const stats = this.getStats();
          const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
          console.log(
            `${MODULE_ID} | Index built: ${totalImages} total images (${stats.categorizedImages} categorized) in ${elapsed}s`
          );
          return true;
        }

        console.warn(`${MODULE_ID} | Index build returned 0 images`);
        this.isBuilt = false;
        throw ModuleError.of(
          'index_build_failed',
          'Index build completed but no images were indexed',
          ['rebuild_cache', 'check_paths', 'check_console']
        );
      } catch (error) {
        // A stale index beats none: searches keep working, and the refresh is
        // retried on the next session.
        if (cachedIndex) {
          this.index = cachedIndex;
          this._rebuildPathIds();
          this.isBuilt = true;
          if (error?.cancelled) throw error;
          console.warn(`${MODULE_ID} | Index refresh failed, keeping the cached index:`, error);
          return true;
        }

        // Same as buildFromTVA: a cancellation must reach the caller intact.
        if (error?.cancelled) {
          this.isBuilt = false;
          throw error;
        }

        this._logger.log('Index build failed:', error);
        this.isBuilt = false;
        if (error?.errorType) throw error;
        throw ModuleError.of(
          'index_build_failed',
          `Index build failed: ${error?.message || 'Unknown error'}`,
          ['reload_module', 'check_console', 'contact_support']
        );
      }
    })();

    try {
      return await this.buildPromise;
    } finally {
      this.buildPromise = null;
    }
  }

  /**
   * Search by creature category
   * @param {string} category - Creature type (humanoid, beast, etc.)
   * @returns {Array} All images in category
   */
  searchByCategory(category) {
    // Validate index is built
    if (!this.isBuilt || !this.index?.categories) {
      this._logger.log('Index not built, cannot search by category');
      return [];
    }

    // Validate category parameter
    if (!category || typeof category !== 'string') {
      this._logger.log('Invalid category parameter:', category);
      return [];
    }

    try {
      const categoryLower = category.toLowerCase();
      const categoryData = this.index.categories[categoryLower];

      if (!categoryData?._all) {
        this._logger.log(`No data found for category: ${categoryLower}`);
        return [];
      }

      // Return all images in this category
      const results = categoryData._all
        .map((id) => this._resultForId(id, { category: categoryLower }))
        .filter(Boolean);

      this._logger.log(`Found ${results.length} results for category: ${categoryLower}`);
      return results;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error searching by category (${category}):`, error);
      this._logger.log(`Error searching by category (${category}):`, error);
      return [];
    }
  }

  /**
   * Search by subcategory (e.g., "elf" within humanoid)
   * @param {string} category - Main category
   * @param {string} subcategory - Subcategory term
   * @returns {Array} Matching images
   */
  searchBySubcategory(category, subcategory) {
    // Validate index is built
    if (!this.isBuilt || !this.index?.categories) {
      this._logger.log('Index not built, cannot search by subcategory');
      return [];
    }

    // Validate parameters
    if (
      !category ||
      typeof category !== 'string' ||
      !subcategory ||
      typeof subcategory !== 'string'
    ) {
      this._logger.log('Invalid category or subcategory parameters:', { category, subcategory });
      return [];
    }

    try {
      const categoryLower = category.toLowerCase();
      const subcatLower = subcategory.toLowerCase();
      const categoryData = this.index.categories[categoryLower];

      if (!categoryData) {
        this._logger.log(`Category not found: ${categoryLower}`);
        return [];
      }

      // Direct subcategory match
      if (categoryData[subcatLower]) {
        const results = categoryData[subcatLower]
          .map((id) => this._resultForId(id, { category: categoryLower, subcategory: subcatLower }))
          .filter(Boolean);
        this._logger.log(
          `Found ${results.length} results for subcategory: ${categoryLower}/${subcatLower}`
        );
        return results;
      }

      // Partial match in subcategory names
      const results = [];
      const seenIds = new Set();

      for (const [subcat, ids] of Object.entries(categoryData)) {
        if (subcat === '_all') continue;
        if (subcat.includes(subcatLower) || subcatLower.includes(subcat)) {
          for (const id of ids) {
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            const result = this._resultForId(id, {
              category: categoryLower,
              subcategory: subcat,
            });
            if (result) results.push(result);
          }
        }
      }

      this._logger.log(
        `Found ${results.length} partial matches for subcategory: ${categoryLower}/${subcatLower}`
      );
      return results;
    } catch (error) {
      console.warn(
        `${MODULE_ID} | Error searching by subcategory (${category}/${subcategory}):`,
        error
      );
      this._logger.log(`Error searching by subcategory (${category}/${subcategory}):`, error);
      return [];
    }
  }

  /**
   * Resolve every id indexed under any of the tokens, once each, in token order.
   * @param {Iterable<string>} tokens - Lowercase terms
   * @returns {Object[]} Search results
   * @private
   */
  _resultsForTokens(tokens) {
    const terms = this._terms();
    const seenIds = new Set();
    const results = [];
    for (const token of tokens) {
      const ids = terms.lookup(token);
      if (!ids) continue;
      for (const id of ids) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const result = this._resultForId(id);
        if (result) results.push(result);
      }
    }
    return results;
  }

  /**
   * Search by term across all categories using O(1) termIndex lookup
   * @param {string} term - Search term
   * @returns {Array} Matching images
   */
  search(term) {
    // Validate index is built
    if (!this.isBuilt || !this.index?.allPaths || !this.index?.termIndex) {
      this._logger.log('Index not built or incomplete, cannot search');
      return [];
    }

    // Validate term parameter
    if (!term || typeof term !== 'string') {
      this._logger.log('Invalid search term:', term);
      return [];
    }

    try {
      const tokens = TermIndex.tokenize(term);
      this._logger.log(`Searching for term: "${term}" (tokens: ${tokens.join(', ')})`);
      const results = this._resultsForTokens(tokens);
      this._logger.log(`Found ${results.length} results for term: "${term}"`);
      return results;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error searching for term (${term}):`, error);
      this._logger.log(`Error searching for term (${term}):`, error);
      return [];
    }
  }

  /**
   * Search multiple terms (OR logic) - optimized to use termIndex directly
   * @param {string[]} terms - Search terms
   * @returns {Array} Combined results
   */
  searchMultiple(terms) {
    // Validate terms parameter
    if (!terms || !Array.isArray(terms) || terms.length === 0) {
      this._logger.log('Invalid or empty terms array:', terms);
      return [];
    }

    // Validate index is built
    if (!this.isBuilt || !this.index?.allPaths || !this.index?.termIndex) {
      this._logger.log('Index not built or incomplete, cannot search multiple terms');
      return [];
    }

    try {
      // Tokenize all terms once, so a token shared by two terms is looked up once
      const allTokens = new Set();
      for (const term of terms) {
        if (term && typeof term === 'string') {
          for (const token of TermIndex.tokenize(term)) allTokens.add(token);
        }
      }

      this._logger.log(
        `Searching for multiple terms: [${terms.join(', ')}] (${allTokens.size} unique tokens)`
      );
      const results = this._resultsForTokens(allTokens);
      this._logger.log(`Found ${results.length} results for multiple terms`);
      return results;
    } catch (error) {
      console.warn(`${MODULE_ID} | Error searching multiple terms:`, error);
      this._logger.log('Error searching multiple terms:', error);
      return [];
    }
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

    const totalImages = this.index?.pathList?.length ?? 0;

    return {
      isBuilt: this.isBuilt,
      version: this.index?.version || 0,
      totalImages: totalImages,
      categorizedImages: categorizedCount,
      uncategorizedImages: totalImages - categorizedCount,
      lastUpdate: this.index?.lastUpdate
        ? new Date(this.index.lastUpdate).toLocaleString()
        : 'Never',
      categories: categoryStats,
    };
  }

  /**
   * Clear the index
   */
  async clear() {
    this.index = null;
    this.isBuilt = false;
    this.buildPromise = null;
    await this._repository.clear();
    console.log(`${MODULE_ID} | Index cleared`);
  }

  /**
   * Force rebuild the index
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<boolean>}
   */
  async forceRebuild(onProgress = null) {
    await this.clear();
    return this.build(true, onProgress);
  }
}

// Export singleton
export const indexService = new IndexService();
