/**
 * CREATURE_TYPE_MAPPINGS data-integrity tests.
 *
 * A term listed under two categories is usually a data error, and it used to be
 * an invisible one: the main-thread term→category Map kept only the last
 * category it saw, so the same image landed in different categories depending
 * on whether the Web Worker was available. The code now handles shared terms
 * correctly, but an *accidental* duplicate is still a bug — so every one has to
 * be declared here on purpose.
 *
 * @module tests/core/creature-mappings
 */
import { describe, it, expect } from 'vitest';
import { CREATURE_TYPE_MAPPINGS } from '../../scripts/core/Constants.js';

/**
 * Terms that genuinely belong to more than one creature type, with the reason.
 * Anything else showing up as a duplicate is a mistake.
 */
const INTENTIONALLY_SHARED = {
  // Yuan-ti purebloods are humanoid; malisons and abominations are monstrosities.
  'yuan-ti': ['humanoid', 'monstrosity'],
};

describe('CREATURE_TYPE_MAPPINGS', () => {
  it('lists no term under two categories by accident', () => {
    const categoriesByTerm = new Map();
    for (const [category, terms] of Object.entries(CREATURE_TYPE_MAPPINGS)) {
      for (const term of terms) {
        const key = term.toLowerCase();
        if (!categoriesByTerm.has(key)) categoriesByTerm.set(key, []);
        categoriesByTerm.get(key).push(category);
      }
    }

    const unexpected = [...categoriesByTerm.entries()]
      .filter(([, categories]) => categories.length > 1)
      .filter(([term, categories]) => {
        const declared = INTENTIONALLY_SHARED[term];
        return !declared || declared.slice().sort().join() !== categories.slice().sort().join();
      })
      .map(([term, categories]) => `${term}: ${categories.join(' + ')}`);

    expect(unexpected).toEqual([]);
  });

  it('repeats no term within a single category', () => {
    const repeated = [];
    for (const [category, terms] of Object.entries(CREATURE_TYPE_MAPPINGS)) {
      const seen = new Set();
      for (const term of terms) {
        const key = term.toLowerCase();
        // A repeat inflates the match count and skews which category wins.
        if (seen.has(key)) repeated.push(`${category}: ${key}`);
        seen.add(key);
      }
    }
    expect(repeated).toEqual([]);
  });

  it('has no empty or whitespace-only term', () => {
    const blank = Object.entries(CREATURE_TYPE_MAPPINGS).flatMap(([category, terms]) =>
      terms.filter((term) => typeof term !== 'string' || term.trim() === '').map(() => category)
    );
    expect(blank).toEqual([]);
  });
});
