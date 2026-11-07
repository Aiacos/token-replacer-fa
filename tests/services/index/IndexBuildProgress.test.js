/**
 * IndexBuildProgress: ~10% throttling, first and final report always forwarded.
 *
 * @module tests/services/index/IndexBuildProgress.test
 */
import { describe, it, expect, vi } from 'vitest';
import { IndexBuildProgress } from '../../../scripts/services/index/IndexBuildProgress.js';

describe('IndexBuildProgress', () => {
  it('forwards about one report per ten percent for a fifty-batch build', () => {
    const listener = vi.fn();
    const progress = new IndexBuildProgress(listener);

    for (let processed = 1000; processed <= 50000; processed += 1000) {
      progress.report(processed, 50000, processed);
    }

    // 2%, 12%, 22%, ... 92%, then 100%: never the fifty the builders emit.
    expect(listener.mock.calls.length).toBeLessThanOrEqual(11);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(listener).toHaveBeenLastCalledWith(50000, 50000, 50000);
  });

  it('always forwards the first report', () => {
    const listener = vi.fn();
    new IndexBuildProgress(listener).report(1, 1000, 0);
    expect(listener).toHaveBeenCalledWith(1, 1000, 0);
  });

  it('forwards completion once, even when reported twice', () => {
    const listener = vi.fn();
    const progress = new IndexBuildProgress(listener);
    progress.report(95, 100, 1);
    progress.report(100, 100, 2);
    progress.report(100, 100, 2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('throttle() passes a missing listener through as null', () => {
    expect(IndexBuildProgress.throttle(null)).toBeNull();
    expect(IndexBuildProgress.throttle(undefined)).toBeNull();
  });

  it('throttle() returns a callback that throttles', () => {
    const listener = vi.fn();
    const throttled = IndexBuildProgress.throttle(listener);
    throttled(1, 100, 0);
    throttled(2, 100, 0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
