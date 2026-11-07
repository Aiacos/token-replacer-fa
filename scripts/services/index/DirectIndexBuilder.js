/**
 * Token Replacer FA - Main-thread index builder
 * @module services/index/DirectIndexBuilder
 */

import { MODULE_ID } from '../../core/Constants.js';
import { DebugLogger } from '../../core/DebugLogger.js';
import { ModuleError } from '../../core/ModuleError.js';
import { Scheduler } from '../../core/Scheduler.js';

/**
 * Indexes paths on the main thread in batches, yielding between them.
 *
 * This is the fallback for a browser without Worker support or a worker that
 * failed, and it must keep its yields (Constitution, Article IV.1): a 50k
 * library takes over a second of CPU, which unbroken would freeze Foundry.
 * The yield is also where a cancel is noticed — checked *after* it, so a Stop
 * clicked while the batch ran is seen before the next batch starts.
 *
 * It does not know the index's shape: each path goes to the injected
 * `addImage`, which is IndexService's own `addImageToIndex()`, so the direct
 * and worker builds cannot drift on what "adding an image" means.
 *
 * @pattern Strategy — interchangeable with WorkerIndexBuilder behind the same
 *   `build(paths, onProgress, token)`; IndexService picks one per build.
 */
export class DirectIndexBuilder {
  /**
   * @param {Object} deps
   * @param {function(string, string|null): boolean} deps.addImage - Adds one image; true when added
   * @param {function(): Promise<void>} [deps.yieldToMain] - Hands control back to the browser
   * @param {number} [deps.batchSize=1000] - Paths per batch between yields
   * @param {DebugLogger} [deps.logger] - Debug logger
   */
  constructor({
    addImage,
    yieldToMain = () => Scheduler.yieldToMain(10),
    batchSize = 1000,
    logger = new DebugLogger('DirectIndexBuilder'),
  }) {
    this._addImage = addImage;
    this._yieldToMain = yieldToMain;
    this._batchSize = batchSize;
    this._logger = logger;
  }

  /**
   * Index every path.
   * @param {Array<string|{path: string, name?: string}>} paths - Paths or objects
   * @param {function(number, number, number): void|null} [onProgress] - (processed, total, imagesFound)
   * @param {{isCancelled: boolean}} [token] - Polled after every yield
   * @returns {Promise<number>} Images added
   * @throws {ModuleError} invalid_paths, index_build_failed, or a cancellation
   */
  async build(paths, onProgress = null, token = { isCancelled: false }) {
    if (!Array.isArray(paths)) {
      this._logger.log('Invalid paths parameter in indexPathsDirectly:', paths);
      throw ModuleError.of('invalid_paths', 'Paths parameter is not an array', [
        'check_paths',
        'check_console',
      ]);
    }
    if (paths.length === 0) {
      this._logger.log('Empty paths array in indexPathsDirectly');
      return 0;
    }

    const totalPaths = paths.length;
    let imagesFound = 0;
    this._logger.log(`Starting direct indexing for ${totalPaths} paths`);
    console.log(`${MODULE_ID} | Indexing ${totalPaths} paths directly...`);

    const startTime = performance.now();
    try {
      for (let start = 0; start < totalPaths; start += this._batchSize) {
        const batchStart = performance.now();
        const end = Math.min(start + this._batchSize, totalPaths);
        for (let i = start; i < end; i++) {
          const item = paths[i];
          const path = typeof item === 'string' ? item : item?.path;
          const name = typeof item === 'string' ? null : item?.name;
          if (this._addImage(path, name)) imagesFound++;
        }

        const batchMs = performance.now() - batchStart;
        const batchCount = end - start;
        console.log(
          `${MODULE_ID} | Progress: ${end}/${totalPaths} images | Batch: ${batchMs.toFixed(1)}ms (${(batchMs / batchCount).toFixed(3)}ms/image, ${((1000 / batchMs) * batchCount).toFixed(0)} images/sec)`
        );
        onProgress?.(end, totalPaths, imagesFound);

        await this._yieldToMain();
        if (token.isCancelled) {
          console.log(`${MODULE_ID} | Direct indexing cancelled at ${end}/${totalPaths}`);
          throw ModuleError.cancelled();
        }
      }
    } catch (error) {
      if (error?.cancelled) throw error;
      this._logger.log('Error during direct indexing:', error);
      throw ModuleError.of(
        'index_build_failed',
        `Failed to index paths: ${error?.message || 'Unknown error'}`,
        ['reload_module', 'check_console']
      );
    }

    const totalMs = performance.now() - startTime;
    this._logger.log(
      `Indexed ${imagesFound} images from ${totalPaths} paths in ${totalMs.toFixed(0)}ms`
    );
    console.log(`${MODULE_ID} | Indexed ${imagesFound} images from ${totalPaths} paths`);
    console.log(
      `${MODULE_ID} | Performance: Total ${totalMs.toFixed(0)}ms | Avg ${(totalMs / totalPaths).toFixed(3)}ms/image | ${((totalPaths / totalMs) * 1000).toFixed(0)} images/sec`
    );
    return imagesFound;
  }
}
