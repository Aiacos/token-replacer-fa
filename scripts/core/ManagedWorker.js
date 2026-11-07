/**
 * Token Replacer FA - Web Worker lifecycle
 * @module core/ManagedWorker
 */

import { MODULE_ID } from './Constants.js';

/**
 * Owns one Web Worker: creates it on first use through an injected factory,
 * and tears it down so the next use can create a fresh one.
 *
 * IndexService and SearchOrchestrator each kept a `worker` field and an
 * `_workerInitialized` flag that had to change together; whenever a teardown
 * nulled one but not the other, `_ensureWorker()` refused to replace the worker
 * and the service fell back to the main thread for the rest of the session —
 * silently, because every `if (this.worker)` branch just took the slow path.
 * Here "alive" *is* "a worker is held": there is no second flag to forget.
 *
 * Two deliberate trades, both kept from the services:
 * - A factory that throws is not remembered. The next `ensure()` retries, so a
 *   transient failure costs one attempt instead of the session's worker.
 * - `teardown()` never throws. It is called from error and cancel paths that
 *   must finish cleaning up whatever `terminate()` does.
 *
 * Event listeners stay the caller's concern: the caller attaches them to the
 * instance `ensure()` returns, and a torn-down worker takes them with it.
 *
 * @pattern Factory + lifecycle owner — the injected factory decides *how* a
 * worker is built (a real Worker, or a stub in tests); this class alone decides
 * *when* one exists.
 */
export class ManagedWorker {
  /**
   * @param {function(): Worker} factory - Builds a new worker; may throw
   * @param {Object} [options={}] - Lifecycle hooks
   * @param {function(): void} [options.onTeardown] - Runs on every teardown, e.g.
   *   to forget state the old worker held (a fresh worker holds none)
   */
  constructor(factory, options = {}) {
    const { onTeardown = () => {} } = options;
    this._factory = factory;
    this._onTeardown = onTeardown;
    /** @type {Worker|null} */
    this._worker = null;
  }

  /**
   * True while a worker is held. Becomes false after `teardown()` or a failed
   * `ensure()`.
   * @returns {boolean}
   */
  get isAlive() {
    return this._worker !== null;
  }

  /**
   * The current worker, without creating one.
   * @returns {Worker|null} Live worker or null
   */
  get worker() {
    return this._worker;
  }

  /**
   * Return the live worker, creating it first if none is held.
   * A factory failure is logged and leaves no worker, so the next call retries.
   * @returns {Worker|null} Live worker, or null when the factory failed
   */
  ensure() {
    if (this._worker) return this._worker;
    try {
      this._worker = this._factory() ?? null;
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to initialize Web Worker:`, error);
      this._worker = null;
    }
    return this._worker;
  }

  /**
   * Post a message to the live worker. Never creates one: a message such as
   * `cancel` is meaningless to a worker that did not exist when it was sent.
   * Errors from `postMessage()` itself (e.g. DataCloneError) propagate.
   * @param {*} message - Structured-cloneable message
   * @returns {boolean} True if a worker received the message
   */
  post(message) {
    if (!this._worker) return false;
    this._worker.postMessage(message);
    return true;
  }

  /**
   * Terminate the worker (if any), drop it, and run the teardown hook.
   * Never throws: both a failing `terminate()` and a failing hook are logged.
   * @returns {void}
   */
  teardown() {
    const worker = this._worker;
    this._worker = null;
    if (worker) {
      try {
        worker.terminate();
      } catch (error) {
        console.debug(`${MODULE_ID} | Worker terminate() failed:`, error);
      }
    }
    try {
      this._onTeardown();
    } catch (error) {
      console.warn(`${MODULE_ID} | Worker teardown hook failed:`, error);
    }
  }
}
