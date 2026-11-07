/**
 * Token Replacer FA - Local index search source
 * @module services/search/LocalIndexSource
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS } from '../../core/Constants.js';
import { ModuleError } from '../../core/ModuleError.js';
import { localizer } from '../../core/Localizer.js';

/**
 * Finds token art in the local image index the caller passes with each search
 * (the scanned library, not the category index). Two kinds of lookup:
 *
 * - **Fuzzy** (`terms`): Fuse.js over name, file name and category. It runs on
 *   the Web Worker through `WorkerSearchClient`; if the worker fails, the worker
 *   is torn down, the user is told once, and the same search runs on the main
 *   thread. A *cancellation* is not a failure and is never "recovered" that
 *   way — that would run the very search the user asked to stop.
 * - **Substring** (`term`, `category`): plain case-insensitive matching over
 *   chosen fields, or a creature-type match on the image's folder category.
 *
 * Fuse.js options reference: https://www.fusejs.io/api/options.html
 *
 * @pattern Strategy — one interchangeable `SearchSource`; `SearchPlan` decides
 * when it runs.
 */
export class LocalIndexSource {
  /** Fields a fuzzy search weighs. */
  static FUZZY_KEYS = Object.freeze(['name', 'fileName', 'category']);

  /** Field sets for substring lookups, one per kind of query the orchestrator makes. */
  static FIELDS = Object.freeze({
    /** A term the user typed: anything that names the image. */
    ANY: Object.freeze(['name', 'fileName', 'category', 'path']),
    /** An actor name. */
    NAME: Object.freeze(['name', 'path']),
    /** A creature subtype, which often lives in the folder (category). */
    SUBTYPE: Object.freeze(['name', 'path', 'category']),
  });

  /**
   * @param {import('./WorkerSearchClient.js').WorkerSearchClient} workerClient - Worker proxy
   * @param {Object} deps - Collaborators
   * @param {{load: function(): Promise<Function|null>}} deps.fuseLoader - Fuse.js loader
   * @param {{isExcluded: function(string): boolean}} deps.pathFilter - Excluded-folder filter
   * @param {function(string, string): *} deps.getSetting - Settings getter
   * @param {function(): boolean} deps.isCancelled - True once the user asked to stop
   * @param {{log: function(...*): void}} deps.logger - Debug logger
   * @param {function(string): void} [deps.notify] - Shows a warning to the user
   */
  constructor(
    workerClient,
    {
      fuseLoader,
      pathFilter,
      getSetting,
      isCancelled,
      logger,
      notify = (message) => ui.notifications.warn(message, { permanent: false }),
    }
  ) {
    this._worker = workerClient;
    this._fuseLoader = fuseLoader;
    this._pathFilter = pathFilter;
    this._getSetting = getSetting;
    this._isCancelled = isCancelled;
    this._logger = logger;
    this._notify = notify;
  }

  /** @returns {string} Source id */
  get name() {
    return 'local';
  }

  /**
   * The index travels with each query, so the source itself is always ready.
   * @returns {boolean}
   */
  isAvailable() {
    return true;
  }

  /**
   * Does a folder name belong to a creature type, directly or through
   * `CREATURE_TYPE_MAPPINGS` (e.g. "Elves" → humanoid)?
   * @param {string} folderName - Folder name to check
   * @param {string} creatureType - Creature type to match
   * @returns {boolean} True if match
   */
  static matchesCreatureType(folderName, creatureType) {
    if (!folderName || !creatureType) return false;
    const folderLower = folderName.toLowerCase();
    const typeLower = creatureType.toLowerCase();
    if (folderLower.includes(typeLower)) return true;
    const mappings = CREATURE_TYPE_MAPPINGS[typeLower];
    return mappings ? mappings.some((term) => folderLower.includes(term.toLowerCase())) : false;
  }

  /**
   * @param {import('./SearchSource.js').SearchQuery} query - `terms` (fuzzy),
   *   `term` (substring) or `category` (creature-type folder match)
   * @param {Object} ctx - Per-search context
   * @param {Array<Object>} ctx.index - Local image index to search
   * @param {string|null} [ctx.creatureType] - Restrict fuzzy hits to this creature type
   * @param {ReadonlyArray<string>} [ctx.fields] - Fields for a `term` lookup (default: `FIELDS.ANY`)
   * @param {function(number, number): void} [ctx.onProgress] - Fuzzy progress
   * @returns {Promise<Array<Object>>} Index entries; fuzzy hits carry `score` and `source: 'local'`
   */
  async search(query, ctx) {
    const { kind, value } = query;
    const { index } = ctx;
    if (!value || value.length === 0 || !index || index.length === 0) return [];
    switch (kind) {
      case 'terms':
        return this.fuzzy(value, index, ctx.creatureType ?? null, ctx.onProgress ?? null);
      case 'term':
        return this._matchTerm(
          index,
          value.toLowerCase(),
          ctx.fields ?? LocalIndexSource.FIELDS.ANY
        );
      case 'category':
        // The exclusion check runs last: it is the expensive predicate, and
        // only the few entries that match need it.
        return index.filter(
          (img) =>
            img.category &&
            LocalIndexSource.matchesCreatureType(img.category, value) &&
            !this._pathFilter.isExcluded(img.path)
        );
      default:
        return [];
    }
  }

  /**
   * Fuzzy search on the worker when one can be built, else on the main thread.
   * @param {string[]} searchTerms - Terms to search
   * @param {Array<Object>} index - Local image index
   * @param {string|null} [creatureType] - Optional creature type filter
   * @param {function(number, number): void} [onProgress] - Progress callback
   * @returns {Promise<Array<Object>>}
   */
  async fuzzy(searchTerms, index, creatureType = null, onProgress = null) {
    if (!index || index.length === 0) return [];

    if (!this._worker.ensure()) {
      console.log(`${MODULE_ID} | Using fallback method (main thread)`);
      return this.fuzzyDirect(searchTerms, index, creatureType);
    }

    console.log(`${MODULE_ID} | Using Web Worker for fuzzy search`);
    try {
      return await this.fuzzyWithWorker(searchTerms, index, creatureType, onProgress);
    } catch (error) {
      if (error?.cancelled) throw error;
      console.warn(`${MODULE_ID} | Worker search failed, falling back to main thread:`, error);
      this._worker.teardown();
      try {
        this._notify(
          localizer.orEnglish(
            'notifications.workerFallback',
            'Token Replacer FA: Background worker failed, using slower method.'
          )
        );
      } catch (notifyError) {
        console.debug(`${MODULE_ID} | Worker fallback notice not shown:`, notifyError);
      }
      return this.fuzzyDirect(searchTerms, index, creatureType);
    }
  }

  /**
   * Fuzzy search on the worker. The worker has no creature-type rules, so its
   * hits are filtered here.
   * @param {string[]} searchTerms - Terms to search
   * @param {Array<Object>} index - Local image index
   * @param {string|null} [creatureType] - Optional creature type filter
   * @param {function(number, number): void} [onProgress] - Progress callback
   * @returns {Promise<Array<Object>>}
   */
  async fuzzyWithWorker(searchTerms, index, creatureType = null, onProgress = null) {
    let results = await this._worker.search(searchTerms, index, this._fuseOptions(), onProgress);
    if (creatureType && results.length > 0) {
      const before = results.length;
      results = results.filter(
        (item) =>
          !item.category || LocalIndexSource.matchesCreatureType(item.category, creatureType)
      );
      if (results.length < before) {
        console.log(
          `${MODULE_ID} | Worker results filtered by "${creatureType}": ${before} → ${results.length}`
        );
      }
    }
    console.log(`${MODULE_ID} | Worker search completed: ${results.length} results found`);
    return results;
  }

  /**
   * Fuzzy search on the main thread: the fallback when no worker can run.
   * @param {string[]} searchTerms - Terms to search
   * @param {Array<Object>} index - Local image index
   * @param {string|null} [creatureType] - Optional creature type filter
   * @returns {Promise<Array<Object>>}
   */
  async fuzzyDirect(searchTerms, index, creatureType = null) {
    if (!index || index.length === 0) return [];

    const Fuse = await this._fuseLoader.load();
    if (!Fuse) {
      console.warn(`${MODULE_ID} | Fuse.js unavailable — search skipped. Results will be empty.`);
      return [];
    }

    const results = [];
    const seenPaths = new Set();
    // @ts-expect-error Fuse constructor injected via DI, type cannot express constructor constraint in JSDoc
    const fuse = new Fuse(index, this._fuseOptions());

    for (const term of searchTerms) {
      // Each term is a full pass over the index; between terms is the only
      // place this path can stop.
      if (this._isCancelled()) {
        this._logger.log('Direct fuzzy search cancelled by user');
        throw ModuleError.cancelled();
      }
      for (const result of fuse.search(term)) {
        const item = result.item;
        if (seenPaths.has(item.path) || this._pathFilter.isExcluded(item.path)) continue;
        if (
          creatureType &&
          item.category &&
          !LocalIndexSource.matchesCreatureType(item.category, creatureType)
        ) {
          continue;
        }
        seenPaths.add(item.path);
        results.push({ ...item, score: result.score, source: 'local' });
      }
    }

    return results;
  }

  /**
   * Fuse.js options for the current `fuzzyThreshold` setting.
   * @private
   * @returns {Object}
   */
  _fuseOptions() {
    return {
      keys: [...LocalIndexSource.FUZZY_KEYS],
      threshold: this._getSetting(MODULE_ID, 'fuzzyThreshold') ?? 0.1,
      includeScore: true,
      minMatchCharLength: 2,
    };
  }

  /**
   * Entries whose given fields contain `termLower`, skipping excluded folders.
   * The exclusion check runs only on matches: over a 50k-image index it is the
   * expensive predicate (its memo cannot hold every path), and the result is the
   * same either way.
   * @private
   * @param {Array<Object>} index - Local image index
   * @param {string} termLower - Lowercased term
   * @param {ReadonlyArray<string>} fields - Fields to look in
   * @returns {Array<Object>}
   */
  _matchTerm(index, termLower, fields) {
    return index.filter((img) => {
      for (const field of fields) {
        const text = img[field];
        if (typeof text === 'string' && text.toLowerCase().includes(termLower)) {
          return !this._pathFilter.isExcluded(img.path);
        }
      }
      return false;
    });
  }
}
