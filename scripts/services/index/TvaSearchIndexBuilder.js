/**
 * Token Replacer FA - Index built from TVA searches
 * @module services/index/TvaSearchIndexBuilder
 */

import { MODULE_ID } from '../../core/Constants.js';
import { DebugLogger } from '../../core/DebugLogger.js';
import { Scheduler } from '../../core/Scheduler.js';
import { TvaResultParser } from '../../core/TvaResultParser.js';
import { TvaCachePathExtractor } from './TvaCachePathExtractor.js';

/**
 * Last-resort index build: run one TVA `doImageSearch` per creature term and
 * index whatever comes back.
 *
 * It only runs when no TVA path source returned anything, and it is slow —
 * hundreds of TVA searches in batches of twenty — but it is the one route that
 * relies on TVA's public API alone, so it keeps working when every
 * undocumented cache location has moved.
 *
 * @pattern Strategy — a third way to fill the index, chosen by IndexService
 *   only when the TvaPathSourceChain came back empty.
 */
export class TvaSearchIndexBuilder {
  /** Concurrent TVA searches per batch. */
  static BATCH_SIZE = 20;

  /**
   * @param {Object} deps
   * @param {function(string, string): boolean} deps.addImage - Adds one image; true when added
   * @param {function(): number} deps.countImages - Images currently in the index
   * @param {Object<string, string[]>} deps.mappings - Category → terms; every key and term is searched
   * @param {function(): Promise<void>} [deps.yieldToMain] - Pause between batches
   * @param {DebugLogger} [deps.logger] - Debug logger
   */
  constructor({
    addImage,
    countImages,
    mappings,
    yieldToMain = () => Scheduler.yieldToMain(50),
    logger = new DebugLogger('TvaSearchIndexBuilder'),
  }) {
    this._addImage = addImage;
    this._countImages = countImages;
    this._mappings = mappings;
    this._yieldToMain = yieldToMain;
    this._logger = logger;
  }

  /**
   * Search TVA for every term and index the results.
   * A failed search is logged and skipped: one term must not sink the rest.
   * @param {Object} tvaAPI - TVA API with `doImageSearch`
   * @param {function(number, number, number): void|null} [onProgress] - (terms searched, total terms, images)
   * @returns {Promise<number>} Images added
   */
  async build(tvaAPI, onProgress = null) {
    const terms = this._collectTerms();
    const { BATCH_SIZE } = TvaSearchIndexBuilder;
    const startTime = performance.now();
    let processed = 0;
    let imagesFound = 0;

    console.log(`${MODULE_ID} | Searching ${terms.length} terms via doImageSearch...`);

    for (let i = 0; i < terms.length; i += BATCH_SIZE) {
      const batch = terms.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(batch.map((term) => this._search(tvaAPI, term)));

      for (const outcome of settled) {
        if (outcome.status !== 'fulfilled' || !outcome.value.results) continue;
        const { term, results } = outcome.value;
        const items = TvaCachePathExtractor.extractItems(results);
        this._logger.log(`doImageSearch "${term}": ${items.length} items`, items[0]);

        for (const item of items) {
          const path = TvaResultParser.extractPath(item);
          if (!path) {
            this._logger.log('Path extraction failed for:', item);
            continue;
          }
          if (this._addImage(path, TvaResultParser.extractName(item, path))) imagesFound++;
        }
      }

      processed += batch.length;
      if (onProgress && (processed % 50 === 0 || processed === terms.length)) {
        onProgress(processed, terms.length, this._countImages());
      }
      await this._yieldToMain();
    }

    const totalMs = performance.now() - startTime;
    const totalImages = this._countImages();
    if (totalImages > 0) {
      console.log(
        `${MODULE_ID} | Performance: Total ${totalMs.toFixed(0)}ms | Avg ${(totalMs / totalImages).toFixed(3)}ms/image | ${((totalImages / totalMs) * 1000).toFixed(0)} images/sec`
      );
    }
    return imagesFound;
  }

  /**
   * Every category name and term, deduplicated.
   * @returns {string[]}
   * @private
   */
  _collectTerms() {
    const terms = new Set();
    for (const [category, list] of Object.entries(this._mappings)) {
      terms.add(category);
      for (const term of list) terms.add(term);
    }
    return [...terms];
  }

  /**
   * Search one term, Portrait first, then any image type.
   * @param {Object} tvaAPI - TVA API
   * @param {string} term - Search term
   * @returns {Promise<{term: string, results: *}>} results is null when the search failed
   * @private
   */
  async _search(tvaAPI, term) {
    try {
      let results = await tvaAPI.doImageSearch(term, { searchType: 'Portrait' });
      if (!results || (Array.isArray(results) && results.length === 0)) {
        results = await tvaAPI.doImageSearch(term);
      }
      return { term, results };
    } catch (error) {
      console.debug(`${MODULE_ID} | doImageSearch("${term}") failed:`, error);
      return { term, results: null };
    }
  }
}
