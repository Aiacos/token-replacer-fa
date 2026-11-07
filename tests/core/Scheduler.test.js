/**
 * Tests for Scheduler.yieldToMain: hands control back to the event loop.
 *
 * @module tests/core/Scheduler.test
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scheduler } from '../../scripts/core/Scheduler.js';

describe('Scheduler.yieldToMain', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves only after the requested delay', async () => {
    vi.useFakeTimers();
    let resolved = false;
    Scheduler.yieldToMain(50).then(() => (resolved = true));

    await vi.advanceTimersByTimeAsync(49);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
  });

  it('defaults to a zero-delay macrotask, not a synchronous return', async () => {
    vi.useFakeTimers();
    let resolved = false;
    Scheduler.yieldToMain().then(() => (resolved = true));

    await Promise.resolve();
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });
});
