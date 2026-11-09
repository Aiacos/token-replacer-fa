/**
 * Tests for FuseLoader: lazy CDN load, shape validation, window fallback and
 * retry after failure (TEST-04).
 *
 * @module tests/core/FuseLoader.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FuseLoader } from '../../scripts/core/FuseLoader.js';

/** Minimal constructor that passes _validateFuseShape. */
class MockFuse {
  search() {
    return [];
  }
}

const networkError = () => Promise.reject(new Error('Network error'));

describe('FuseLoader.load', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    delete window.Fuse;
  });

  it('returns Fuse constructor from CDN on success', async () => {
    const importModule = vi.fn(async () => ({ default: MockFuse }));
    const loader = new FuseLoader({ importModule });

    await expect(loader.load()).resolves.toBe(MockFuse);
    expect(importModule).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs'
    );
  });

  it('loads through the real dynamic import by default', async () => {
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => ({
      default: MockFuse,
    }));
    try {
      await expect(new FuseLoader().load()).resolves.toBe(MockFuse);
    } finally {
      vi.doUnmock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs');
    }
  });

  it('falls back to window.Fuse when CDN fails', async () => {
    window.Fuse = MockFuse;
    const loader = new FuseLoader({ importModule: networkError });

    await expect(loader.load()).resolves.toBe(MockFuse);
  });

  it('returns null when both CDN and window.Fuse fail', async () => {
    const loader = new FuseLoader({ importModule: networkError });

    await expect(loader.load()).resolves.toBeNull();
  });

  it('rejects a CDN module that is not shaped like Fuse.js', async () => {
    const loader = new FuseLoader({ importModule: async () => ({ default: () => 'pwned' }) });

    await expect(loader.load()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failed shape validation'));
  });

  it('rejects a window.Fuse that is not shaped like Fuse.js', async () => {
    window.Fuse = { search: () => [] };
    const loader = new FuseLoader({ importModule: networkError });

    await expect(loader.load()).resolves.toBeNull();
  });

  it('caches result and returns same reference on subsequent calls', async () => {
    const importModule = vi.fn(async () => ({ default: MockFuse }));
    const loader = new FuseLoader({ importModule });

    const first = await loader.load();
    const second = await loader.load();

    expect(first).toBe(second);
    expect(importModule).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure instead of remembering it', async () => {
    const importModule = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ default: MockFuse });
    const loader = new FuseLoader({ importModule, getGlobalFuse: () => undefined });

    await expect(loader.load()).resolves.toBeNull();
    await expect(loader.load()).resolves.toBe(MockFuse);
    expect(importModule).toHaveBeenCalledTimes(2);
  });

  it('survives a fallback lookup that throws', async () => {
    const loader = new FuseLoader({
      importModule: networkError,
      getGlobalFuse: () => {
        throw new ReferenceError('window is not defined');
      },
    });

    await expect(loader.load()).resolves.toBeNull();
  });
});

describe('FuseLoader._validateFuseShape', () => {
  it('accepts a constructor whose instances search into an array', () => {
    expect(FuseLoader._validateFuseShape(MockFuse)).toBe(true);
  });

  it.each([
    ['a non-function', {}],
    ['a constructor without search()', class {}],
    [
      'a search() that does not return an array',
      class {
        search() {
          return 'x';
        }
      },
    ],
    [
      'a constructor that throws',
      class {
        constructor() {
          throw new Error('boom');
        }
      },
    ],
  ])('rejects %s', (_label, candidate) => {
    expect(FuseLoader._validateFuseShape(candidate)).toBe(false);
  });
});
