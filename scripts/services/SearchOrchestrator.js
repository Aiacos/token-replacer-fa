/**
 * Token Replacer FA - Search Orchestrator
 * Coordinates the search sources into one ranked, cached answer per creature
 * @module services/SearchOrchestrator
 */

import {
  MODULE_ID,
  PARALLEL_BATCH_SIZE,
  CREATURE_TYPE_MAPPINGS,
  PRIMARY_CATEGORY_TERMS,
  SLOW_MODE_BATCH_SIZE,
} from '../core/Constants.js';
import { Scheduler } from '../core/Scheduler.js';
import { pathFilter as defaultPathFilter } from '../core/PathFilter.js';
import { CreatureTerms } from '../core/CreatureTerms.js';
import { localizer } from '../core/Localizer.js';
import { fuseLoader as defaultFuseLoader } from '../core/FuseLoader.js';
import { Settings } from '../core/Settings.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { indexService } from './IndexService.js';
import { IndexSource } from './search/IndexSource.js';
import { TvaCacheSource } from './search/TvaCacheSource.js';
import { LocalIndexSource } from './search/LocalIndexSource.js';
import { ForgeBazaarSource } from './search/ForgeBazaarSource.js';
import { SearchPlan } from './search/SearchPlan.js';
import { WorkerSearchClient } from './search/WorkerSearchClient.js';
import { SearchResultCache } from './search/SearchResultCache.js';
import { ResultRanker } from './search/ResultRanker.js';
import { ResultCollector } from './search/ResultCollector.js';
import { ParallelSearchRunner } from './search/ParallelSearchRunner.js';

/**
 * Turns creature information into a ranked list of token-art matches. The
 * orchestrator owns the *flow* — subtype OR-search, standard search, category
 * browse — and delegates each concern to a collaborator in `search/`:
 * the sources find candidates, `SearchPlan` picks which source runs for the
 * priority setting, `ResultRanker` orders, `SearchResultCache` remembers,
 * `WorkerSearchClient` keeps fuzzy search off the main thread and
 * `ParallelSearchRunner` batches a whole scene.
 *
 * Collaborators are built once — in the constructor, or again when
 * `setDependencies()` swaps the TVA or Bazaar service — never per search.
 *
 * Cancellation is one flag owned here and read by the worker client, the
 * main-thread fuzzy search and the batch runner, so a single
 * `cancelOperation()` stops whichever is running.
 *
 * @pattern Facade + Mediator — one entry point for search; the collaborators
 * never call each other, the orchestrator wires their results together.
 */
export class SearchOrchestrator {
  /**
   * @param {Object} [deps={}] - Injected collaborators (defaults are the module singletons)
   * @param {Object} [deps.tvaCacheService] - TVACacheService-like
   * @param {Object} [deps.forgeBazaarService] - ForgeBazaarService-like
   * @param {Object} [deps.indexService] - IndexService-like
   * @param {function(string, string): *} [deps.getSetting] - Settings getter
   * @param {function(): Worker} [deps.workerFactory] - Builds the search worker
   * @param {Object} [deps.pathFilter] - Excluded-folder filter
   * @param {Object} [deps.fuseLoader] - Fuse.js loader
   */
  constructor(deps = {}) {
    const {
      tvaCacheService: injectedTVACache,
      forgeBazaarService: injectedForgeBazaar,
      indexService: injectedIndex = indexService,
      getSetting = Settings.defaultGetter(),
      workerFactory = () => new Worker(`modules/${MODULE_ID}/scripts/workers/IndexWorker.js`),
      pathFilter = defaultPathFilter,
      fuseLoader = defaultFuseLoader,
    } = deps;

    this._tvaCacheService = injectedTVACache ?? null;
    this._forgeBazaarService = injectedForgeBazaar ?? null;
    this._indexService = injectedIndex;
    this._getSetting = getSetting;
    this._workerFactory = workerFactory;
    this._pathFilter = pathFilter;
    this._logger = new DebugLogger('SearchOrchestrator');

    // Distinguishes a user cancellation from a worker failure, so a cancelled
    // search is not "recovered" by running the slow main-thread path anyway.
    this._cancelRequested = false;
    const isCancelled = () => this._cancelRequested;

    /** Ranked results per creature (`CreatureTerms.cacheKey`). */
    this.searchCache = new SearchResultCache();
    /** @type {Map<string, ResultRanker>} One ranker per priority, built on first use */
    this._rankers = new Map();

    this._workerClient = new WorkerSearchClient(workerFactory, { isCancelled });
    this._localSource = new LocalIndexSource(this._workerClient, {
      fuseLoader,
      pathFilter,
      getSetting,
      isCancelled,
      logger: this._logger,
    });
    this._runner = new ParallelSearchRunner({
      batchSize: PARALLEL_BATCH_SIZE,
      isCancelled,
      logger: this._logger,
    });
    this._buildPlan();
  }

  /**
   * (Re)build the sources that depend on swappable services, and the plan
   * over them.
   * @private
   */
  _buildPlan() {
    this._indexSource = new IndexSource(this._indexService);
    this._tvaSource = new TvaCacheSource(this._tvaCacheService, {
      pathFilter: this._pathFilter,
      logger: this._logger,
    });
    this._forgeSource = new ForgeBazaarSource(this._forgeBazaarService);
    this._plan = new SearchPlan({
      index: this._indexSource,
      tva: this._tvaSource,
      forge: this._forgeSource,
    });
  }

  /**
   * The live search worker, if one has been created.
   * @returns {Worker|null}
   */
  get worker() {
    return this._workerClient.worker;
  }

  /**
   * Set dependencies for the orchestrator
   * @param {Object} tvaCacheService - TVACacheService instance
   * @param {Object} forgeBazaarService - ForgeBazaarService instance
   */
  setDependencies(tvaCacheService, forgeBazaarService) {
    this._tvaCacheService = tvaCacheService;
    this._forgeBazaarService = forgeBazaarService;
    this._buildPlan();
  }

  /**
   * Clear the search cache
   * @returns {void}
   */
  clearCache() {
    this.searchCache.clear();
  }

  /**
   * Terminate the Web Worker and clean up resources
   * Should be called when the SearchOrchestrator is no longer needed
   * @returns {void}
   */
  terminate() {
    if (this._workerClient.worker) {
      this._workerClient.teardown();
      console.log(`${MODULE_ID} | Web Worker terminated`);
    }
  }

  /**
   * Cancel the current search: the worker stops and replies `cancelled`, the
   * main-thread fuzzy search stops before its next term, and a parallel search
   * stops at its next batch boundary.
   * @returns {void}
   */
  cancelOperation() {
    // Set unconditionally: the main-thread fallback has no worker to message.
    this._cancelRequested = true;
    this._workerClient.cancel();
    console.log(`${MODULE_ID} | Cancellation requested`);
  }

  /**
   * Check if folder name matches a creature type
   * @param {string} folderName - Folder name to check
   * @param {string} creatureType - Creature type to match
   * @returns {boolean} True if match
   */
  folderMatchesCreatureType(folderName, creatureType) {
    return LocalIndexSource.matchesCreatureType(folderName, creatureType);
  }

  /**
   * Search Token Variant Art for a term: the direct cache when loaded, else
   * TVA's doImageSearch API
   * @param {string} searchTerm - Term to search
   * @returns {Promise<Array>} Search results
   */
  searchTVA(searchTerm) {
    return this._tvaSource.search({ kind: 'term', value: searchTerm });
  }

  /**
   * Search local index using fuzzy search
   * Uses Web Worker for background processing when available, falls back to main thread
   * @param {string[]} searchTerms - Terms to search
   * @param {Array} index - Local image index
   * @param {string} creatureType - Optional creature type filter
   * @param {function(number, number): void} [onProgress] - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  searchLocalIndex(searchTerms, index, creatureType = null, onProgress = null) {
    return this._localSource.fuzzy(searchTerms, index, creatureType, onProgress);
  }

  /**
   * Search local index directly on main thread (fallback when worker unavailable)
   * @param {string[]} searchTerms - Terms to search
   * @param {Array} index - Local image index
   * @param {string} creatureType - Optional creature type filter
   * @returns {Promise<Array>} Search results
   */
  searchLocalIndexDirectly(searchTerms, index, creatureType = null) {
    return this._localSource.fuzzyDirect(searchTerms, index, creatureType);
  }

  /**
   * Search local index on the existing Web Worker, after any search already queued
   * @param {string[]} searchTerms - Terms to search
   * @param {Array} index - Local image index
   * @param {string} creatureType - Optional creature type filter
   * @param {function(number, number): void} [onProgress] - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  searchLocalIndexWithWorker(searchTerms, index, creatureType = null, onProgress = null) {
    return this._localSource.fuzzyWithWorker(searchTerms, index, creatureType, onProgress);
  }

  /**
   * Search by creature type category, or by a term the user typed
   * @param {string} categoryType - Creature type category
   * @param {Array} localIndex - Local image index
   * @param {string} directSearchTerm - Optional direct search term
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Array>} Search results
   */
  async searchByCategory(
    categoryType,
    localIndex,
    directSearchTerm = null,
    progressCallback = null
  ) {
    console.log(
      `${MODULE_ID} | searchByCategory START - type: ${categoryType}, directSearch: ${directSearchTerm}`
    );
    const priority = this._getSetting(MODULE_ID, 'searchPriority');
    const collector = new ResultCollector(this._pathFilter);

    if (directSearchTerm) {
      return this._searchDirectTerm(
        directSearchTerm,
        priority,
        localIndex,
        collector,
        progressCallback
      );
    }

    console.log(`${MODULE_ID} | Starting comprehensive search for category: ${categoryType}`);
    await this._runCategoryStep(
      this._plan.stepForCategory(priority),
      categoryType,
      collector,
      progressCallback
    );

    if (localIndex?.length > 0) {
      SearchOrchestrator._report(
        progressCallback,
        0,
        1,
        localizer.orEnglish('ui.progressLocalIndex', 'local index'),
        collector.size
      );
      const categoryMatches = await this._localSource.search(
        { kind: 'category', value: categoryType },
        { index: localIndex }
      );
      collector.addAll(categoryMatches, { tag: (match) => ({ ...match, source: 'local' }) });
    }

    console.log(
      `${MODULE_ID} | searchByCategory END - found ${collector.size} results for ${categoryType}`
    );
    return collector.results;
  }

  /**
   * A term the user typed: the remote source the priority picks, then the
   * local index.
   * @private
   */
  async _searchDirectTerm(term, priority, localIndex, collector, progressCallback) {
    SearchOrchestrator._report(progressCallback, 0, 1, term, 0);

    const remote = this._plan.sourceForDirectTerm(priority);
    if (remote) collector.addAll(await remote.search({ kind: 'term', value: term }));

    if (localIndex?.length > 0) {
      const localMatches = await this._localSource.search(
        { kind: 'term', value: term },
        { index: localIndex, fields: LocalIndexSource.FIELDS.ANY }
      );
      collector.addAll(localMatches, { tag: (match) => ({ ...match, source: 'local' }) });
    }

    SearchOrchestrator._report(progressCallback, 1, 1, term, collector.size);
    console.log(`${MODULE_ID} | Direct search for "${term}" found ${collector.size} results`);
    return collector.results;
  }

  /**
   * Run the remote step `SearchPlan.stepForCategory()` picked.
   * @private
   */
  async _runCategoryStep(step, categoryType, collector, progressCallback) {
    const { STEP } = SearchPlan;
    const query = { kind: 'category', value: categoryType };

    switch (step) {
      case STEP.INDEX: {
        console.log(`${MODULE_ID} | Using pre-built index (FAST mode)`);
        const label = localizer.orEnglish('ui.progressIndexLookup', 'index lookup');
        SearchOrchestrator._report(progressCallback, 0, 1, label, 0);
        // Double-check the exclusion filter: an index built before a folder was
        // excluded still holds its paths.
        collector.addAll(await this._indexSource.search(query), {
          skipExcluded: true,
          tag: (result) => ({ ...result, source: result.source || 'index' }),
        });
        SearchOrchestrator._report(progressCallback, 1, 1, label, collector.size);
        console.log(`${MODULE_ID} | Index search found ${collector.size} results (FAST mode)`);

        // A built index can be stale (a pack added after the last build) and
        // return nothing for a category the raw cache still covers. One cheap
        // cache read beats letting the index's emptiness be authoritative; the
        // slow per-term API search is deliberately not tried.
        if (collector.size === 0 && this._tvaSource.isCacheLoaded()) {
          console.log(`${MODULE_ID} | Index returned 0 results — falling back to TVA direct cache`);
          const fallbackLabel = localizer.orEnglish(
            'ui.progressTvaCacheFallback',
            'TVA cache fallback'
          );
          SearchOrchestrator._report(progressCallback, 0, 1, fallbackLabel, 0);
          collector.addAll(await this._tvaSource.search(query));
          SearchOrchestrator._report(progressCallback, 1, 1, fallbackLabel, collector.size);
          console.log(`${MODULE_ID} | TVA cache fallback found ${collector.size} results`);
        }
        return;
      }

      case STEP.FORGE: {
        console.log(`${MODULE_ID} | Using ForgeBazaarService`);
        const label = localizer.orEnglish('ui.progressForgeBazaar', 'Forge Bazaar');
        SearchOrchestrator._report(progressCallback, 0, 1, label, 0);
        collector.addAll(await this._forgeSource.search(query));
        SearchOrchestrator._report(progressCallback, 1, 1, label, collector.size);
        console.log(`${MODULE_ID} | ForgeBazaarService found ${collector.size} results`);
        return;
      }

      case STEP.TVA_CACHE: {
        console.log(`${MODULE_ID} | Using TVA direct cache (FAST mode)`);
        const label = localizer.orEnglish('ui.progressTvaCacheLookup', 'TVA cache lookup');
        SearchOrchestrator._report(progressCallback, 0, 1, label, 0);
        collector.addAll(await this._tvaSource.search(query));
        SearchOrchestrator._report(progressCallback, 1, 1, label, collector.size);
        console.log(`${MODULE_ID} | TVA direct cache found ${collector.size} results (FAST mode)`);
        return;
      }

      case STEP.TVA_API: {
        const typeLower = categoryType?.toLowerCase();
        const terms = CREATURE_TYPE_MAPPINGS[typeLower] ?? PRIMARY_CATEGORY_TERMS[typeLower];
        if (terms) {
          console.log(
            `${MODULE_ID} | Searching ${terms.length} terms for ${categoryType} (SLOW mode - index not built)`
          );
          await this._searchTvaTermsInBatches(terms, collector, progressCallback);
        }
        console.log(`${MODULE_ID} | TVA search complete, total unique results: ${collector.size}`);
        return;
      }

      default:
        return;
    }
  }

  /**
   * SLOW mode: one TVA API search per term, a few in parallel per batch,
   * yielding to the UI between batches.
   * @private
   */
  async _searchTvaTermsInBatches(terms, collector, progressCallback) {
    let searchCount = 0;
    for (let i = 0; i < terms.length; i += SLOW_MODE_BATCH_SIZE) {
      const batch = terms.slice(i, i + SLOW_MODE_BATCH_SIZE);
      SearchOrchestrator._report(
        progressCallback,
        searchCount,
        terms.length,
        batch.join(', '),
        collector.size
      );

      const settled = await Promise.allSettled(
        batch.map((term) => this._tvaSource.search({ kind: 'term', value: term }))
      );
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && outcome.value) collector.addAll(outcome.value);
        else if (outcome.status === 'rejected') {
          console.warn(`${MODULE_ID} | TVA term search failed:`, outcome.reason);
        }
      }

      searchCount += batch.length;
      if (searchCount % 12 === 0 || searchCount === terms.length) {
        console.log(
          `${MODULE_ID} | Search progress: ${searchCount}/${terms.length} terms, ${collector.size} results`
        );
      }
      await Scheduler.yieldToMain(50);
    }
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

    const cacheKey = CreatureTerms.cacheKey(creatureInfo);
    if (useCache) {
      const cached = this.searchCache.get(cacheKey);
      if (cached !== undefined) return cached;
    }

    const priority = this._getSetting(MODULE_ID, 'searchPriority');
    const useTVACache = this._getSetting(MODULE_ID, 'useTVACache');
    const isGenericSubtype = CreatureTerms.isGenericSubtype(creatureInfo.subtype);
    const subtypeTerms = CreatureTerms.parseSubtype(creatureInfo.subtype);
    const collector = new ResultCollector(this._pathFilter);

    // Specific subtypes: search the name and each subtype separately (OR logic).
    // These results are cached as found, unranked.
    if (subtypeTerms.length > 0 && !isGenericSubtype && creatureInfo.type) {
      await this._searchNameAndSubtypes(creatureInfo, subtypeTerms, localIndex, collector);
      this.searchCache.set(cacheKey, collector.results);
      return collector.results;
    }

    const steps = this._plan.standardSteps(priority, useTVACache);

    if (localIndex?.length > 0 && steps.fuzzyLocal) {
      collector.addAll(await this._localSource.fuzzy(searchTerms, localIndex, creatureInfo.type));
    }

    if (steps.tvaTerms) {
      for (const term of searchTerms) {
        const tvaResults = await this._tvaSource.search({ kind: 'term', value: term });
        collector.addAll(tvaResults);
        // Enough hits on the primary term: the fallback terms would only add noise.
        if (tvaResults.length >= 5 && term === searchTerms[0]) break;
      }
    }

    // Generic subtype: offer the whole category. searchByCategory covers both
    // the index and the local index.
    if (isGenericSubtype && creatureInfo.type) {
      console.log(`${MODULE_ID} | Generic subtype mode for ${creatureInfo.type}`);
      const categoryResults = await this.searchByCategory(creatureInfo.type, localIndex);
      collector.addAll(categoryResults, {
        tag: (result) => ({ ...result, score: result.score ?? 0.6, fromCategory: true }),
      });
    }

    const ranked = this._rankerFor(priority).rank(collector.results);
    this.searchCache.set(cacheKey, ranked);
    return ranked;
  }

  /**
   * The OR search for a creature with specific subtypes: its actor name
   * first (best matches), then every subtype, from the fastest ready source and
   * from the local index.
   * @private
   */
  async _searchNameAndSubtypes(creatureInfo, subtypeTerms, localIndex, collector) {
    const { actorName } = creatureInfo;
    console.log(
      `${MODULE_ID} | OR Logic Mode: "${creatureInfo.type}" with subtypes (${subtypeTerms.join(', ')})`
    );
    const nameTag = (result) => ({ ...result, score: result.score ?? 0.1, fromName: true });
    const subtypeTag = (result) => ({ ...result, score: result.score ?? 0.3, fromSubtype: true });
    const { STEP } = SearchPlan;

    switch (this._plan.stepForSubtypes()) {
      case STEP.INDEX: {
        console.log(`${MODULE_ID} | Using index for subtype search (FAST mode)`);
        if (actorName) {
          const nameResults = await this._indexSource.search({
            kind: 'term',
            value: actorName.toLowerCase(),
          });
          console.log(
            `${MODULE_ID} | Index returned ${nameResults.length} results for actor name "${actorName}"`
          );
          collector.addAll(nameResults, { skipExcluded: true, tag: nameTag });
        }
        const indexResults = await this._indexSource.search({ kind: 'terms', value: subtypeTerms });
        console.log(`${MODULE_ID} | Index returned ${indexResults.length} results for subtypes`);
        collector.addAll(indexResults, { skipExcluded: true, tag: subtypeTag });
        break;
      }

      case STEP.TVA_CACHE: {
        console.log(`${MODULE_ID} | Using TVA direct cache for subtype search (FAST mode)`);
        if (actorName) {
          const nameResults = await this._tvaSource.search({ kind: 'term', value: actorName });
          console.log(
            `${MODULE_ID} | TVA direct cache returned ${nameResults.length} results for actor name "${actorName}"`
          );
          collector.addAll(nameResults, { tag: nameTag });
        }
        const subtypeResults = await this._tvaSource.search({ kind: 'terms', value: subtypeTerms });
        console.log(
          `${MODULE_ID} | TVA direct cache returned ${subtypeResults.length} results for subtypes (${subtypeTerms.join(', ')})`
        );
        collector.addAll(subtypeResults, { tag: subtypeTag });
        break;
      }

      case STEP.TVA_API: {
        console.log(
          `${MODULE_ID} | Searching TVA for each subtype separately (SLOW mode - cache not loaded)`
        );
        if (actorName) {
          const nameResults = await this._tvaSource.search({ kind: 'term', value: actorName });
          console.log(`${MODULE_ID} | TVA returned ${nameResults.length} results for actor name`);
          collector.addAll(nameResults, { tag: nameTag });
        }
        for (const term of subtypeTerms) {
          const tvaResults = await this._tvaSource.search({ kind: 'term', value: term });
          console.log(`${MODULE_ID} | TVA returned ${tvaResults.length} results for "${term}"`);
          collector.addAll(tvaResults, {
            tag: (result) => ({ ...subtypeTag(result), matchedTerm: term }),
          });
        }
        break;
      }

      default:
        break;
    }

    if (localIndex?.length > 0) {
      if (actorName) {
        const nameMatches = await this._localSource.search(
          { kind: 'term', value: actorName },
          { index: localIndex, fields: LocalIndexSource.FIELDS.NAME }
        );
        collector.addAll(nameMatches, {
          tag: (match) => ({
            ...match,
            source: 'local',
            score: match.score ?? 0.15,
            fromName: true,
          }),
        });
      }
      for (const term of subtypeTerms) {
        const localMatches = await this._localSource.search(
          { kind: 'term', value: term },
          { index: localIndex, fields: LocalIndexSource.FIELDS.SUBTYPE }
        );
        collector.addAll(localMatches, {
          tag: (match) => ({
            ...match,
            source: 'local',
            score: match.score ?? 0.4,
            fromSubtype: true,
            matchedTerm: term,
          }),
        });
      }
    }

    console.log(
      `${MODULE_ID} | Total results after OR search: ${collector.size} (matching ${subtypeTerms.join(' OR ')})`
    );
  }

  /**
   * Perform parallel searches for multiple creature groups
   * @param {Map} groups - Creature groups
   * @param {Array} localIndex - Local image index
   * @param {function(Object): void} [progressCallback] - Progress callback
   * @returns {Promise<Map>} Search results map
   */
  parallelSearchCreatures(groups, localIndex, progressCallback = null) {
    // A cancel from a previous run must not abort this one before it starts.
    this._cancelRequested = false;
    return this._runner.run(
      groups,
      (creatureInfo) => this.searchTokenArt(creatureInfo, localIndex, true),
      progressCallback
    );
  }

  /**
   * The ranker for a priority, built once and reused.
   * @private
   * @param {string} priority - `searchPriority` setting
   * @returns {ResultRanker}
   */
  _rankerFor(priority) {
    let ranker = this._rankers.get(priority);
    if (!ranker) {
      ranker = new ResultRanker(priority);
      this._rankers.set(priority, ranker);
    }
    return ranker;
  }

  /**
   * Send a progress tick, if anyone listens.
   * @private
   */
  static _report(progressCallback, current, total, term, resultsFound) {
    if (progressCallback) progressCallback({ current, total, term, resultsFound });
  }
}

// Export singleton instance
export const searchOrchestrator = new SearchOrchestrator();
