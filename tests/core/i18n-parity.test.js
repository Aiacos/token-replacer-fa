/**
 * Localization parity tests.
 *
 * Every user-visible string now comes from lang/*.json, so a key that exists in
 * English but not in Italian is a silently English dialog for Italian users —
 * Foundry falls back rather than failing, which is exactly why drift went
 * unnoticed for so long.
 *
 * @module tests/core/i18n-parity
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const english = JSON.parse(readFileSync('lang/en.json', 'utf8')).TOKEN_REPLACER_FA;
const italian = JSON.parse(readFileSync('lang/it.json', 'utf8')).TOKEN_REPLACER_FA;

/**
 * Flatten a nested language object into dotted key/value pairs.
 * @param {object} object - Language object
 * @param {string} [prefix=''] - Key prefix
 * @returns {Map<string, string>} Flattened entries
 */
function flatten(object, prefix = '') {
  const entries = new Map();
  for (const [key, value] of Object.entries(object)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nested, nestedValue] of flatten(value, `${prefix}${key}.`)) {
        entries.set(nested, nestedValue);
      }
    } else {
      entries.set(`${prefix}${key}`, value);
    }
  }
  return entries;
}

/**
 * Placeholder names used in a translation string, sorted.
 * @param {string} value - Translation string
 * @returns {string[]} Placeholder names
 */
const placeholders = (value) =>
  [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

const englishEntries = flatten(english);
const italianEntries = flatten(italian);

describe('lang/it.json', () => {
  it('translates every English key', () => {
    const missing = [...englishEntries.keys()].filter((key) => !italianEntries.has(key));
    expect(missing).toEqual([]);
  });

  it('defines no key English has dropped', () => {
    const orphaned = [...italianEntries.keys()].filter((key) => !englishEntries.has(key));
    expect(orphaned).toEqual([]);
  });

  it('leaves no translation empty', () => {
    const empty = [...italianEntries.entries()]
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  it('keeps the same {placeholders} as the English string', () => {
    // A dropped placeholder renders to the user as a literal "{count}".
    const mismatched = [...englishEntries.entries()]
      .filter(([key, value]) => {
        const translated = italianEntries.get(key);
        return (
          typeof translated === 'string' &&
          placeholders(value).join() !== placeholders(translated).join()
        );
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});
