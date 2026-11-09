/**
 * Token Replacer FA - Main-thread scheduling
 * @module core/Scheduler
 */

/**
 * Hands control back to the event loop during long main-thread work, so the
 * UI can paint and input stays responsive (Constitution, Article IV.1).
 *
 * @pattern Static Utility — a stateless timing primitive with one owner; tests
 * replace it with fake timers rather than an injected instance.
 */
export class Scheduler {
  /**
   * Yield control back to the main thread
   * @param {number} [ms=0] - Milliseconds to wait (0 for immediate)
   * @returns {Promise<void>}
   */
  static yieldToMain(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
