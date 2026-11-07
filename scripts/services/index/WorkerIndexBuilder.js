/**
 * Token Replacer FA - Web Worker index builder
 * @module services/index/WorkerIndexBuilder
 */

import { MODULE_ID } from '../../core/Constants.js';
import { DebugLogger } from '../../core/DebugLogger.js';
import { ManagedWorker } from '../../core/ManagedWorker.js';
import { ModuleError } from '../../core/ModuleError.js';

/**
 * Builds the index in IndexWorker.js, off the main thread.
 *
 * The worker's lifecycle belongs to ManagedWorker: created on first use,
 * replaced after a teardown. This class owns one build at a time — its
 * listeners, its timeout and the hand-off of the result. It rejects; it never
 * falls back. Falling back is IndexService's decision, because only it knows
 * that a cancellation must *not* trigger the slow path the user just stopped.
 *
 * Settling is guarded by one flag: a worker that posts `complete` after the
 * timeout fired, or an `error` event after `cancelled`, must not settle the
 * same build twice or resolve a build nobody is waiting for.
 *
 * Worker protocol (scripts/workers/IndexWorker.js):
 * in  `{ command: 'indexPaths', data: { paths, creatureTypeMappings, excludedFolders, excludedFilenameTerms } }`
 * out `{ type: 'progress'|'complete'|'cancelled'|'error', processed, total, imagesFound, result, message }`
 *
 * @pattern Strategy — interchangeable with DirectIndexBuilder behind
 *   `build(paths, onProgress, token)`.
 */
export class WorkerIndexBuilder {
  /** Default build timeout: long enough for 100k paths, short enough to recover from a hang. */
  static TIMEOUT_MS = 120_000;

  /**
   * @param {Object} deps
   * @param {function(): Worker} deps.workerFactory - Builds a worker; may throw or return nothing
   * @param {function(Object): boolean} deps.applyResult - Adopts the worker's result; false when
   *   the index it was built for is gone
   * @param {Object} deps.config - Categorization data sent with every build:
   *   `{ creatureTypeMappings, excludedFolders, excludedFilenameTerms }`
   * @param {number} [deps.timeoutMs] - Build timeout
   * @param {DebugLogger} [deps.logger] - Debug logger
   */
  constructor({
    workerFactory,
    applyResult,
    config,
    timeoutMs = WorkerIndexBuilder.TIMEOUT_MS,
    logger = new DebugLogger('WorkerIndexBuilder'),
  }) {
    this._managed = new ManagedWorker(workerFactory);
    this._applyResult = applyResult;
    this._config = config;
    this._timeoutMs = timeoutMs;
    this._logger = logger;
    this._building = false;
  }

  /** @returns {Worker|null} The live worker, without creating one */
  get worker() {
    return this._managed.worker;
  }

  /**
   * Create the worker if none is held.
   * @returns {Worker|null} The live worker, or null when it cannot be created
   */
  ensureWorker() {
    const hadWorker = this._managed.isAlive;
    const worker = this._managed.ensure();
    if (worker && !hadWorker) {
      console.log(`${MODULE_ID} | Web Worker initialized for background index building`);
    }
    return worker;
  }

  /**
   * Ask the worker to stop the running build. A no-op without a worker.
   * @returns {boolean} True if a worker received the request
   */
  cancel() {
    return this._managed.post({ command: 'cancel' });
  }

  /** Terminate the worker; the next build creates a fresh one. Never throws. */
  teardown() {
    this._managed.teardown();
  }

  /**
   * Index the paths in the worker.
   * @param {Array<string|{path: string, name?: string}>} paths - Paths or objects
   * @param {function(number, number, number): void|null} [onProgress] - (processed, total, imagesFound)
   * @param {{isCancelled: boolean}} [token] - Checked before the build starts
   * @returns {Promise<number>} Images indexed
   * @throws {ModuleError} worker_failed, invalid_paths, or a cancellation
   */
  async build(paths, onProgress = null, token = { isCancelled: false }) {
    const worker = this.ensureWorker();
    if (!worker) {
      this._logger.log('Worker not available for indexPathsWithWorker');
      throw ModuleError.of('worker_failed', 'Web Worker not available for background indexing', [
        'disable_worker',
        'reload_module',
      ]);
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      this._logger.log('Invalid paths array in indexPathsWithWorker:', paths);
      throw ModuleError.of('invalid_paths', 'Paths array is empty or invalid', [
        'check_paths',
        'reload_module',
      ]);
    }
    // The worker resets its own cancel flag when a command arrives, so a Stop
    // pressed before this point would otherwise be forgotten.
    if (token.isCancelled) throw ModuleError.cancelled();
    // The protocol carries no request id: two builds on one worker would both
    // settle on the first `complete`. IndexService.build() already serialises.
    if (this._building) {
      throw ModuleError.of('worker_failed', 'An index build is already running in the worker', [
        'reload_module',
      ]);
    }

    this._building = true;
    try {
      return await this._run(worker, paths, onProgress);
    } finally {
      this._building = false;
    }
  }

  /**
   * One build on one worker: attach listeners, post, settle exactly once.
   * @param {Worker} worker - Live worker
   * @param {Array} paths - Paths to index
   * @param {function(number, number, number): void|null} onProgress - Progress callback
   * @returns {Promise<number>} Images indexed
   * @private
   */
  _run(worker, paths, onProgress) {
    this._logger.log(`Starting worker-based indexing for ${paths.length} paths`);

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;

      const settle = (outcome, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        worker.removeEventListener?.('message', onMessage);
        worker.removeEventListener?.('error', onError);
        if (outcome === 'resolve') resolve(value);
        else reject(value);
      };

      const fail = (details, recovery = ['disable_worker', 'reload_module', 'check_console']) =>
        settle('reject', ModuleError.of('worker_failed', details, recovery));

      const onMessage = (event) => {
        const { type, processed, total, imagesFound, result, message } = event.data ?? {};
        switch (type) {
          case 'progress':
            if (settled) return;
            this._logger.log(
              `Worker progress: ${processed}/${total} (${imagesFound} images found)`
            );
            onProgress?.(processed, total, imagesFound);
            break;
          case 'complete':
            if (settled) return;
            // A complete for an index that was cleared meanwhile has nowhere to go.
            if (!this._applyResult(result)) {
              settle('resolve', 0);
              return;
            }
            this._logger.log(`Worker completed: ${imagesFound} images from ${total} paths`);
            console.log(
              `${MODULE_ID} | Worker completed: ${imagesFound} images from ${total} paths`
            );
            settle('resolve', imagesFound);
            break;
          case 'cancelled':
            if (settled) return;
            console.log(`${MODULE_ID} | Operation cancelled by user`);
            settle('reject', ModuleError.cancelled());
            break;
          case 'error':
            if (settled) return;
            this._logger.log(`Worker error: ${message}`);
            console.error(`${MODULE_ID} | Worker error:`, message);
            fail(`Web Worker indexing failed: ${message || 'Unknown error'}`);
            break;
          default:
            // Replies to other commands (pong, indexSet) are not ours.
            break;
        }
      };

      const onError = (error) => {
        if (settled) return;
        this._logger.log('Worker error event:', error);
        console.error(`${MODULE_ID} | Worker error event:`, error);
        fail(`Web Worker crashed: ${error?.message || 'Unknown error'}`);
      };

      timeoutId = setTimeout(() => {
        if (settled) return;
        const seconds = this._timeoutMs / 1000;
        this._logger.log(`Worker build timed out after ${seconds}s`);
        console.warn(`${MODULE_ID} | Worker build timed out after ${seconds}s, terminating`);
        // A hung worker would still hold the next build's messages.
        this.teardown();
        fail('Worker build timed out — falling back to direct indexing', [
          'disable_worker',
          'reload_module',
        ]);
      }, this._timeoutMs);

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);

      try {
        worker.postMessage({ command: 'indexPaths', data: { paths, ...this._config } });
      } catch (error) {
        this._logger.log('Failed to post message to worker:', error);
        console.warn(`${MODULE_ID} | Failed to post message to worker:`, error);
        fail(`Failed to start worker: ${error?.message}`, ['disable_worker', 'reload_module']);
      }
    });
  }
}
