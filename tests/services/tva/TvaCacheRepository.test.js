/**
 * TvaCacheRepository — restore validity rules, save/remove failure handling.
 * @module tests/services/tva/TvaCacheRepository
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TvaCacheRepository } from '../../../scripts/services/tva/TvaCacheRepository.js';

const FILE = 'data/tva-cache.json';
const IMAGES = [{ path: 'a.webp', name: 'A', category: 'C' }];

function headResponse({ ok = true, lastModified = null, contentLength = null } = {}) {
  return {
    ok,
    headers: {
      get: (h) =>
        h === 'Last-Modified' ? lastModified : h === 'Content-Length' ? contentLength : null,
    },
  };
}

function createStorage(record) {
  return {
    load: vi.fn(async () => record),
    save: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  };
}

/** Save through a repository, capture the record, and return it. */
async function savedRecord(source = {}) {
  const storage = createStorage(null);
  const repo = new TvaCacheRepository({ storage, fetch: vi.fn() });
  await repo.save(
    IMAGES,
    { C: IMAGES },
    { cacheFilePath: FILE, lastModified: 'Mon', contentLength: 100, ...source }
  );
  return storage.save.mock.calls[0][1];
}

describe('TvaCacheRepository', () => {
  let warn;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('restores what it saved when the file is unchanged', async () => {
    const record = await savedRecord();
    const fetch = vi.fn(async () => headResponse({ lastModified: 'Mon', contentLength: '100' }));
    const repo = new TvaCacheRepository({ storage: createStorage(record), fetch });

    const restored = await repo.restore(FILE);

    expect(restored).toEqual({ images: IMAGES, byCategory: { C: IMAGES } });
    expect(fetch).toHaveBeenCalledWith(
      FILE,
      expect.objectContaining({ method: 'HEAD', credentials: 'omit' })
    );
  });

  it('misses on a record version mismatch, without a HEAD request', async () => {
    const record = { ...(await savedRecord()), version: 999 };
    const fetch = vi.fn();
    const repo = new TvaCacheRepository({ storage: createStorage(record), fetch });

    expect(await repo.restore(FILE)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('misses on a record saved before versioning (no version field)', async () => {
    const { version: _version, ...legacy } = await savedRecord();
    const repo = new TvaCacheRepository({ storage: createStorage(legacy), fetch: vi.fn() });

    expect(await repo.restore(FILE)).toBeNull();
  });

  it('misses when the record is for another file', async () => {
    const record = await savedRecord({ cacheFilePath: 'other.json' });
    const repo = new TvaCacheRepository({ storage: createStorage(record), fetch: vi.fn() });

    expect(await repo.restore(FILE)).toBeNull();
  });

  it('misses when Last-Modified changed', async () => {
    const record = await savedRecord();
    const fetch = vi.fn(async () => headResponse({ lastModified: 'Tue' }));
    const repo = new TvaCacheRepository({ storage: createStorage(record), fetch });

    expect(await repo.restore(FILE)).toBeNull();
  });

  it('misses when Content-Length changed', async () => {
    const record = await savedRecord();
    const fetch = vi.fn(async () => headResponse({ contentLength: '101' }));
    const repo = new TvaCacheRepository({ storage: createStorage(record), fetch });

    expect(await repo.restore(FILE)).toBeNull();
  });

  it('uses the record when the HEAD request fails', async () => {
    const record = await savedRecord();
    const fetch = vi.fn(async () => {
      throw new TypeError('CORS');
    });
    const repo = new TvaCacheRepository({ storage: createStorage(record), fetch });

    expect(await repo.restore(FILE)).not.toBeNull();
  });

  it.each([
    ['nothing saved', null],
    [
      'images not an array',
      { version: 1, cacheFilePath: FILE, tvaCacheImages: 'x', tvaCacheByCategory: {} },
    ],
    ['no images', { version: 1, cacheFilePath: FILE, tvaCacheImages: [], tvaCacheByCategory: {} }],
    [
      'no categories',
      { version: 1, cacheFilePath: FILE, tvaCacheImages: IMAGES, tvaCacheByCategory: null },
    ],
  ])('misses when the stored record is invalid: %s', async (_label, record) => {
    const repo = new TvaCacheRepository({ storage: createStorage(record), fetch: vi.fn() });

    expect(await repo.restore(FILE)).toBeNull();
  });

  it('misses, and logs, when storage throws on load', async () => {
    const storage = createStorage(null);
    storage.load.mockRejectedValue(new Error('broken'));
    const repo = new TvaCacheRepository({ storage, fetch: vi.fn() });

    expect(await repo.restore(FILE)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('save reports false, and logs, when storage refuses or throws — never rejects', async () => {
    const refusing = createStorage(null);
    refusing.save.mockResolvedValue(false);
    const throwing = createStorage(null);
    throwing.save.mockRejectedValue(new Error('quota'));
    const source = { cacheFilePath: FILE, lastModified: '', contentLength: 0 };

    expect(await new TvaCacheRepository({ storage: refusing }).save(IMAGES, {}, source)).toBe(
      false
    );
    expect(await new TvaCacheRepository({ storage: throwing }).save(IMAGES, {}, source)).toBe(
      false
    );
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('remove reports false, and logs, when storage throws', async () => {
    const storage = createStorage(null);
    storage.remove.mockRejectedValue(new Error('broken'));

    expect(await new TvaCacheRepository({ storage }).remove()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
