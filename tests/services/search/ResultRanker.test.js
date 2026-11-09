/**
 * ResultRanker: match tier, then source preference per priority, then score.
 * @module tests/services/search/ResultRanker.test
 */
import { describe, it, expect } from 'vitest';
import { ResultRanker } from '../../../scripts/services/search/ResultRanker.js';

const paths = (results) => results.map((r) => r.path);

describe('ResultRanker', () => {
  it('orders name > subtype > other > category', () => {
    const ranked = new ResultRanker('both').rank([
      { path: 'cat.webp', fromCategory: true, score: 0 },
      { path: 'other.webp', score: 0.9 },
      { path: 'sub.webp', fromSubtype: true, score: 0.9 },
      { path: 'name.webp', fromName: true, score: 0.9 },
    ]);
    expect(paths(ranked)).toEqual(['name.webp', 'sub.webp', 'other.webp', 'cat.webp']);
  });

  it('prefers local art for faNexus and TVA art for forgeBazaar', () => {
    const results = [
      { path: 'a/tva.webp', source: 'tva', score: 0.5 },
      { path: 'a/local.webp', source: 'local', score: 0.5 },
    ];
    expect(paths(new ResultRanker('faNexus').rank(results))[0]).toBe('a/local.webp');
    expect(paths(new ResultRanker('forgeBazaar').rank(results))[0]).toBe('a/tva.webp');
  });

  it('has no source preference for both: score decides', () => {
    const ranked = new ResultRanker('both').rank([
      { path: 'a/local.webp', source: 'local', score: 0.4 },
      { path: 'a/tva.webp', source: 'tva', score: 0.2 },
    ]);
    expect(paths(ranked)).toEqual(['a/tva.webp', 'a/local.webp']);
  });

  it('ranks a score of 0 as a perfect match, not as a missing score', () => {
    const ranked = new ResultRanker('both').rank([
      { path: 'a/missing.webp' },
      { path: 'a/close.webp', score: 0.3 },
      { path: 'a/exact.webp', score: 0 },
    ]);
    expect(paths(ranked)).toEqual(['a/exact.webp', 'a/close.webp', 'a/missing.webp']);
  });

  it('drops results without a usable image path', () => {
    const ranked = new ResultRanker('both').rank([
      { path: 'FA/valid.webp' },
      { path: 'https://cdn.example/x' },
      { path: 'forge://bazaar/x' },
      { path: 'noextension' },
      { path: null },
      { path: 42 },
      {},
    ]);
    expect(paths(ranked).sort()).toEqual(
      ['FA/valid.webp', 'forge://bazaar/x', 'https://cdn.example/x'].sort()
    );
  });

  it('returns an empty array for empty input', () => {
    expect(new ResultRanker('faNexus').rank([])).toEqual([]);
  });
});
