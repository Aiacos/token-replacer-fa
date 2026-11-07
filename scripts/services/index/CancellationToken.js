/**
 * Token Replacer FA - Index build cancellation flag
 * @module services/index/CancellationToken
 */

/**
 * The "stop" flag a running index build polls between batches.
 *
 * IndexService owns one token and hands it to whichever builder runs. A Stop
 * pressed before the worker starts must still be honoured, and the worker
 * forgets a cancel when a new command arrives — so the flag lives on the main
 * thread, not in the worker, and only `IndexService.build()` resets it.
 *
 * @pattern Cancellation Token — builders read `isCancelled` instead of a field
 *   on the service, so the strategy that runs never needs the service itself.
 */
export class CancellationToken {
  constructor() {
    this._cancelled = false;
  }

  /** @returns {boolean} True once cancel() was called since the last reset() */
  get isCancelled() {
    return this._cancelled;
  }

  /** Ask the running build to stop at its next check. */
  cancel() {
    this._cancelled = true;
  }

  /** Forget a cancel from a previous run, so it cannot abort the next one. */
  reset() {
    this._cancelled = false;
  }
}
