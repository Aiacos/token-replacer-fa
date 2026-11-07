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
