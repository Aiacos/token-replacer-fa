/**
 * FilterTermStore: a remembered filter is a convenience, so storage failures
 * must never reach the dialog.
 *
 * @module tests/ui/FilterTermStore
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FilterTermStore } from '../../scripts/ui/FilterTermStore.js';

function memory() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

afterEach(() => vi.restoreAllMocks());

describe('FilterTermStore', () => {
  it('remembers and returns a term', () => {
    const storage = memory();
    const store = new FilterTermStore(() => storage);

    store.save('dwarf monk');

    expect(store.load()).toBe('dwarf monk');
  });

  it('returns an empty string when nothing is remembered', () => {
    expect(new FilterTermStore(() => memory()).load()).toBe('');
  });

  it('forgets the term when saving a blank one, and on clear', () => {
    const storage = memory();
    const store = new FilterTermStore(() => storage);

    store.save('orc');
    store.save('   ');
    expect(store.load()).toBe('');

    store.save('orc');
    store.clear();
    expect(storage.data.size).toBe(0);
  });

  it('truncates an over-long remembered term', () => {
    const storage = memory();
    storage.setItem(FilterTermStore.KEY, 'x'.repeat(500));

    expect(new FilterTermStore(() => storage).load()).toHaveLength(FilterTermStore.MAX_LENGTH);
  });

  it('absorbs and logs every storage failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new FilterTermStore(() => throwing);

    expect(() => store.save('orc')).not.toThrow();
    expect(store.load()).toBe('');
    expect(() => store.clear()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('survives storage being unavailable altogether', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new FilterTermStore(() => undefined);

    expect(store.load()).toBe('');
    expect(() => store.save('orc')).not.toThrow();
  });
});
