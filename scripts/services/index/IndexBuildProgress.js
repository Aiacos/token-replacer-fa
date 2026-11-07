/**
 * Token Replacer FA - Throttled index build progress
 * @module services/index/IndexBuildProgress
 */

/**
 * Forwards build progress to a listener in steps of about ten percent.
 *
 * The worker reports every thousand paths and the direct builder every batch,
 * which on a 50k library is fifty notifications; the user needs about ten
 * (Constitution, Article III.3). The first report and the final one always go
 * through, so the user sees the build start and finish.
 *
 * @pattern Proxy — stands in for the caller's progress listener and decides
 *   which reports reach it; builders report unconditionally.
 */
export class IndexBuildProgress {
  /**
   * @param {Function} listener - Receives (processed, total, imagesFound)
   * @param {Object} [options={}]
   * @param {number} [options.stepPercent=10] - Minimum percent advance between reports
   */
  constructor(listener, options = {}) {
    const { stepPercent = 10 } = options;
    this._listener = listener;
    this._stepPercent = stepPercent;
    this._lastPercent = null;
  }

  /**
   * Wrap a listener, or pass "no listener" through so builders can skip work.
   * @param {Function|null} listener - Progress callback, called as (processed, total, imagesFound)
   * @returns {function(number, number, number): void|null} Throttled callback, or null
   */
  static throttle(listener) {
    if (typeof listener !== 'function') return null;
    const progress = new IndexBuildProgress(listener);
    return (processed, total, imagesFound) => progress.report(processed, total, imagesFound);
  }

  /**
   * Report progress; forwarded only when it advanced a full step or finished.
   * @param {number} processed - Items processed so far
   * @param {number} total - Items in the build
   * @param {number} imagesFound - Images indexed so far
   * @returns {boolean} True when the listener was called
   */
  report(processed, total, imagesFound) {
    const percent = total > 0 ? Math.floor((processed / total) * 100) : 100;
    const finished = total > 0 && processed >= total;
    const due =
      this._lastPercent === null ||
      percent - this._lastPercent >= this._stepPercent ||
      (finished && this._lastPercent < 100);
    if (!due) return false;
    this._lastPercent = percent;
    this._listener(processed, total, imagesFound);
    return true;
  }
}
