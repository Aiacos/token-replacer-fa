/**
 * Tests for FilterQuery: the match-filter box's AND-of-terms value object.
 *
 * @module tests/core/FilterQuery.test
 */

import { describe, it, expect } from 'vitest';
import { FilterQuery } from '../../scripts/core/FilterQuery.js';

describe('FilterQuery.parse', () => {
  it('splits on commas', () => {
    expect(FilterQuery.parse('goblin, orc').terms).toEqual(['goblin', 'orc']);
  });

  it('splits on spaces', () => {
    expect(FilterQuery.parse('red dragon').terms).toEqual(['red', 'dragon']);
  });

  it('splits on colons', () => {
    expect(FilterQuery.parse('fire:ice').terms).toEqual(['fire', 'ice']);
  });

  it('trims and lowercases input', () => {
    expect(FilterQuery.parse('  GOBLIN  ').terms).toEqual(['goblin']);
  });

  it.each([[''], [null], [undefined], ['  ,: ']])('is empty for %j', (text) => {
    const query = FilterQuery.parse(text);
    expect(query.terms).toEqual([]);
    expect(query.isEmpty).toBe(true);
  });

  it('is not empty when it has a term', () => {
    expect(FilterQuery.parse('orc').isEmpty).toBe(false);
  });
});

describe('FilterQuery.matches', () => {
  it('returns true when all terms are found (case insensitive)', () => {
    expect(FilterQuery.parse('red dragon').matches('Red Dragon')).toBe(true);
  });

  it('returns false when any term is missing', () => {
    expect(FilterQuery.parse('red blue').matches('Red Dragon')).toBe(false);
  });

  it('matches anything when empty', () => {
    expect(FilterQuery.parse('').matches('anything')).toBe(true);
    expect(FilterQuery.parse('').matches(null)).toBe(true);
  });

  it('returns false for null text with terms', () => {
    expect(FilterQuery.parse('term').matches(null)).toBe(false);
  });

  it('returns false for empty text with terms', () => {
    expect(FilterQuery.parse('term').matches('')).toBe(false);
  });

  it('matches terms anywhere in a combined name and path', () => {
    const query = FilterQuery.parse('goblin, archer');
    expect(query.matches('Goblin Boss modules/fa/tokens/goblin_archer_01.webp')).toBe(true);
  });
});

describe('FilterQuery immutability', () => {
  it('cannot be mutated after parsing', () => {
    const query = FilterQuery.parse('orc');

    expect(Object.isFrozen(query)).toBe(true);
    expect(Object.isFrozen(query.terms)).toBe(true);
    expect(() => {
      /** @type {any} */ (query.terms).push('elf');
    }).toThrow(TypeError);
    expect(query.matches('orc warrior')).toBe(true);
  });

  it('does not share the caller’s array', () => {
    const terms = ['orc'];
    const query = new FilterQuery(terms);
    terms.push('elf');

    expect(query.terms).toEqual(['orc']);
  });
});

describe('FilterQuery wildcards', () => {
  const name = 'goblin archer modules/fa/tokens/goblin_archer_01.webp';

  it('treats * as any run of characters, including none', () => {
    expect(FilterQuery.parse('gob*archer').matches(name)).toBe(true);
    expect(FilterQuery.parse('goblin*_archer').matches(name)).toBe(true);
    expect(FilterQuery.parse('gob**lin').matches(name)).toBe(true);
    expect(FilterQuery.parse('gob*wolf').matches(name)).toBe(false);
  });

  it('treats ? as exactly one character', () => {
    expect(FilterQuery.parse('gob?in').matches(name)).toBe(true);
    expect(FilterQuery.parse('gob??in').matches(name)).toBe(false);
    expect(FilterQuery.parse('archer_0?.webp').matches(name)).toBe(true);
  });

  it('stays unanchored and case-insensitive', () => {
    expect(FilterQuery.parse('ARCH*01').matches('Goblin ARCHER_01 boss')).toBe(true);
    expect(FilterQuery.parse('??rcher').matches('Archer')).toBe(false);
    expect(FilterQuery.parse('??rcher').matches('x Archer')).toBe(true);
  });

  it('keeps AND logic across wildcard and plain terms', () => {
    expect(FilterQuery.parse('gob* 01').matches(name)).toBe(true);
    expect(FilterQuery.parse('gob* 02').matches(name)).toBe(false);
  });

  it('matches everything with a term made only of *', () => {
    expect(FilterQuery.parse('*').matches('anything')).toBe(true);
    expect(FilterQuery.parse('***').matches('')).toBe(true);
    expect(FilterQuery.parse('***').matches(null)).toBe(true);
  });

  it('takes every other regex metacharacter literally', () => {
    expect(FilterQuery.parse('(a+)+$').matches('aaaa')).toBe(false);
    expect(FilterQuery.parse('(a+)+$').matches('x(a+)+$y')).toBe(true);
    expect(FilterQuery.parse('[*]').matches('[x]')).toBe(true);
    expect(FilterQuery.parse('a.b*').matches('axb')).toBe(false);
    expect(FilterQuery.parse('a.?').matches('a.b')).toBe(true);
    expect(FilterQuery.parse('a.?').matches('axb')).toBe(false);
  });

  it.each([['['], ['\\'], ['(a+)+$'], ['*[?'], ['^$|{}'], ['\\*'], ['(?<x>a)']])(
    'never throws on hostile input %j',
    (text) => {
      expect(() =>
        FilterQuery.parse(text).matches('some text [with] \\ (a+)+$ ^$|{}')
      ).not.toThrow();
    }
  );

  it('matches a backslash literally', () => {
    expect(FilterQuery.parse('a\\?').matches('xa\\by')).toBe(true);
    expect(FilterQuery.parse('a\\?').matches('xab')).toBe(false);
  });

  it('is not prone to catastrophic backtracking', () => {
    const haystack = 'a'.repeat(20000);
    const started = performance.now();

    expect(FilterQuery.parse('a*a*a*a*a*a*a*a*a*b').matches(haystack)).toBe(false);
    expect(FilterQuery.parse('a?a?a?a?a?a?b').matches(haystack)).toBe(false);

    expect(performance.now() - started).toBeLessThan(500);
  });

  it('keeps the parsed terms as typed', () => {
    expect(FilterQuery.parse('Gob*, ?rc').terms).toEqual(['gob*', '?rc']);
  });

  it('gives the same answer when a wildcard query is reused', () => {
    const query = FilterQuery.parse('gob?in');

    expect(Object.isFrozen(query)).toBe(true);
    expect(query.matches('xx goblin')).toBe(true);
    expect(query.matches('goblin')).toBe(true);
    expect(query.matches('gob')).toBe(false);
    expect(query.matches('goblin')).toBe(true);
  });
});
