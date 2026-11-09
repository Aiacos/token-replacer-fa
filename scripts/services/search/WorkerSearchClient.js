/**
 * Token Replacer FA - Fuzzy search on the Web Worker
 * @module services/search/WorkerSearchClient
 */

import { MODULE_ID } from '../../core/Constants.js';
import { ManagedWorker } from '../../core/ManagedWorker.js';
import { ModuleError } from '../../core/ModuleError.js';

/**
 * Runs fuzzy searches on `IndexWorker.js` so the main thread never blocks
 * (Constitution, Article IV.1). Four invariants, each the fix for a bug this
 * module once shipped:
 *
 * 1. **One search in flight.** Worker replies carry no request id, so with
 *    several pending searches every one resolved with the first reply — three
 *    creatures out of four were offered another creature's art. Searches are
 *    queued; a failed one frees its slot.
 * 2. **The worker is captured per search.** A timeout elsewhere may tear the
 *    worker down while a search waits; the search keeps talking to the
 *    instance it started on, and only tears down that same instance.
 * 3. **A failed post cleans up.** Otherwise the pending timer would later tear
 *    down a healthy worker.
 * 4. **The index is sent once, tracked by identity.** `setSearchIndex` makes the
 *    worker keep a copy; a boolean "already sent" flag was never cleared when
 *    the library was rescanned, so a fresh index array is sent again. A torn
 *    down worker forgets the index it held.
 *
 * Message protocol: `scripts/workers/IndexWorker.js` (commands `setSearchIndex`,
 * `fuzzySearch`, `cancel`; replies `progress`, `complete`, `cancelled`, `error`).
 *
 * @pattern Proxy + Command queue — callers search as if locally; this class
 * owns the worker's lifecycle (through `ManagedWorker`) and serializes the
 * commands it sends.
 */
export class WorkerSearchClient {
  /** Long enough for a 50k-image fuzzy pass on a slow machine, short enough to notice a stall. */
  static DEFAULT_TIMEOUT_MS = 60000;

  /**
   * @param {function(): Worker} workerFactory - Builds the worker; may throw
   * @param {Object} deps - Collaborators
   * @param {function(): boolean} deps.isCancelled - True once the user asked to stop
   * @param {number} [deps.timeoutMs=60000] - Per-search timeout
   */
  constructor(workerFactory, { isCancelled, timeoutMs = WorkerSearchClient.DEFAULT_TIMEOUT_MS }) {
    this._isCancelled = isCancelled;
    this._timeoutMs = timeoutMs;
    /** @type {Array<Object>|null} The index the live worker holds, by identity */
    this._heldIndex = null;
    this._managed = new ManagedWorker(workerFactory, {
      onTeardown: () => {
        this._heldIndex = null;
      },
    });
    this._queue = Promise.resolve();
  }

  /**
   * The live worker, without creating one.
   * @returns {Worker|null}
   */
  get worker() {
    return this._managed.worker;
  }

  /**
   * Create the worker if none is live.
   * @returns {Worker|null} Live worker, or null when it cannot be built
   */
  ensure() {
    return this._managed.ensure();
  }

  /**
   * Ask the worker to stop its current search; it replies `cancelled`.
   * @returns {boolean} True if a worker received the request
   */
  cancel() {
    return this._managed.post({ command: 'cancel' });
  }

  /**
   * Terminate the worker so the next `ensure()` builds a fresh one.
   * @returns {void}
   */
  teardown() {
    this._managed.teardown();
  }

  /**
   * Fuzzy-search `index` on the worker, after every search queued before it.
   * @param {string[]} searchTerms - Terms to search
   * @param {Array<Object>} index - Local image index
   * @param {Object} fuseOptions - Fuse.js options (keys, threshold, …)
   * @param {function(number, number): void} [onProgress] - Progress callback
   * @returns {Promise<Array<Object>>} Raw worker results
   */
  search(searchTerms, index, fuseOptions, onProgress = null) {
    const run = () => this._run(searchTerms, index, fuseOptions, onProgress);
    const result = this._queue.then(run, run);
    // The caller gets the failure through `result`; the queue only needs to
    // know the slot is free.
    this._queue = result.catch(() => {});
    return result;
  }

  /**
   * Run one search. Only reached through the queue in `search()`.
   * @private
   */
  async _run(searchTerms, index, fuseOptions, onProgress) {
    // A search queued behind one the user cancelled must not start.
    if (this._isCancelled()) throw ModuleError.cancelled();

    const worker = this._managed.worker;
    if (!worker) {
      throw ModuleError.of('worker_failed', 'Web Worker not available for background search', [
        'reload_module',
      ]);
    }

    if (!index || index.length === 0) return [];

    return new Promise((resolve, reject) => {
      let timeoutId;
      const cleanup = () => {
        clearTimeout(timeoutId);
        worker.removeEventListener('message', messageHandler);
        worker.removeEventListener('error', errorHandler);
      };

      const messageHandler = (event) => {
        const { type, result, current, total, message } = event.data;
        switch (type) {
          case 'progress':
            if (onProgress) onProgress(current, total);
            break;
          case 'complete':
            cleanup();
            resolve(result || []);
            break;
          case 'cancelled':
            cleanup();
            console.log(`${MODULE_ID} | Search operation cancelled by user`);
            reject(ModuleError.cancelled());
            break;
          case 'error':
            cleanup();
            console.error(`${MODULE_ID} | Worker search error:`, message);
            reject(
              ModuleError.of(
                'worker_failed',
                `Worker search error: ${message || 'Unknown error'}`,
                ['reload_module', 'check_console']
              )
            );
            break;
          default:
            break;
        }
      };

      // Worker crashes: unhandled exceptions, out-of-memory, import failures
      const errorHandler = (error) => {
        cleanup();
        console.error(`${MODULE_ID} | Worker crashed during search:`, error);
        reject(
          ModuleError.of('worker_failed', `Worker crashed: ${error.message || 'Unknown error'}`, [
            'reload_module',
            'check_console',
          ])
        );
      };

      worker.addEventListener('message', messageHandler);
      worker.addEventListener('error', errorHandler);

      timeoutId = setTimeout(() => {
        cleanup();
        // Terminate the zombie so its late reply cannot reach the next search —
        // unless it has already been replaced.
        if (this._managed.worker === worker) this._managed.teardown();
        reject(
          ModuleError.of(
            'worker_failed',
            `Worker search timed out after ${this._timeoutMs / 1000} seconds`,
            ['reload_module', 'check_console']
          )
        );
      }, this._timeoutMs);

      try {
        if (this._heldIndex !== index) {
          worker.postMessage({ command: 'setSearchIndex', data: { index } });
          this._heldIndex = index;
        }
        // index omitted: the worker searches the copy from setSearchIndex
        worker.postMessage({ command: 'fuzzySearch', data: { searchTerms, options: fuseOptions } });
      } catch (error) {
        cleanup();
        console.error(`${MODULE_ID} | Failed to post search to worker:`, error);
        reject(
          ModuleError.of('worker_failed', `Failed to start worker search: ${error.message}`, [
            'reload_module',
            'check_console',
          ])
        );
      }
    });
  }
}
