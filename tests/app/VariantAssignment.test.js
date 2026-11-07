/**
 * Which selected token art goes to which token.
 * @module tests/app/VariantAssignment
 */
import { describe, it, expect } from 'vitest';
import {
  SequentialAssignment,
  RandomAssignment,
  VariantAssignment,
} from '../../scripts/app/VariantAssignment.js';

const tokens = ['t1', 't2', 't3', 't4', 't5'];

/** A deterministic random source replaying the given values. */
const replay = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('SequentialAssignment', () => {
  it('cycles through the paths in selection order', () => {
    const result = new SequentialAssignment().assign(tokens, ['a', 'b']);
    expect(result.map((r) => r.path)).toEqual(['a', 'b', 'a', 'b', 'a']);
    expect(result.map((r) => r.token)).toEqual(tokens);
  });

  it('returns nothing when no path was selected', () => {
    expect(new SequentialAssignment().assign(tokens, [])).toEqual([]);
    expect(new SequentialAssignment().assign(tokens, null)).toEqual([]);
  });

  it('returns nothing for no tokens', () => {
    expect(new SequentialAssignment().assign([], ['a'])).toEqual([]);
  });
});

describe('RandomAssignment', () => {
  it('is deterministic for an injected random source', () => {
    // i=2 → j=floor(0*3)=0 → [c,b,a]; i=1 → j=floor(0*2)=0 → [b,c,a]
    const result = new RandomAssignment(replay(0)).assign(tokens, ['a', 'b', 'c']);
    expect(result.map((r) => r.path)).toEqual(['b', 'c', 'a', 'b', 'c']);
  });

  it('uses every image once before any repeats', () => {
    const paths = ['a', 'b', 'c'];
    const result = new RandomAssignment(replay(0.7, 0.2)).assign(tokens, paths);
    expect(new Set(result.slice(0, 3).map((r) => r.path))).toEqual(new Set(paths));
  });

  it('does not mutate the selection it is given', () => {
    const paths = ['a', 'b', 'c'];
    new RandomAssignment(replay(0)).assign(tokens, paths);
    expect(paths).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing when no path was selected', () => {
    expect(new RandomAssignment(replay(0)).assign(tokens, [])).toEqual([]);
  });
});

describe('VariantAssignment.forMode', () => {
  it('maps random to the random strategy', () => {
    expect(VariantAssignment.forMode('random')).toBeInstanceOf(RandomAssignment);
  });

  it('falls back to sequential for sequential, missing or unknown modes', () => {
    expect(VariantAssignment.forMode('sequential')).toBeInstanceOf(SequentialAssignment);
    expect(VariantAssignment.forMode(undefined)).toBeInstanceOf(SequentialAssignment);
    expect(VariantAssignment.forMode('bogus')).toBeInstanceOf(SequentialAssignment);
  });

  it('passes the random source through', () => {
    const strategy = VariantAssignment.forMode('random', { random: replay(0) });
    expect(strategy.assign(['t'], ['a', 'b', 'c'])[0].path).toBe('b');
  });
});
