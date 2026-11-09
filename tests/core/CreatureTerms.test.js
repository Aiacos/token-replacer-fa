/**
 * Tests for CreatureTerms: subtype parsing, generic subtypes, cache keys
 *
 * @module tests/core/CreatureTerms.test
 */

import { describe, it, expect } from 'vitest';
import { CreatureTerms } from '../../scripts/core/CreatureTerms.js';

// =========================================================================
// parseSubtype
// =========================================================================

describe('CreatureTerms.parseSubtype', () => {
  it('splits on commas', () => {
    expect(CreatureTerms.parseSubtype('Dwarf, Monk')).toEqual(['dwarf', 'monk']);
  });

  it('splits on slashes', () => {
    expect(CreatureTerms.parseSubtype('Elf/Human')).toEqual(['elf', 'human']);
  });

  it('splits on semicolons', () => {
    expect(CreatureTerms.parseSubtype('Orc;Goblin')).toEqual(['orc', 'goblin']);
  });

  it('splits on ampersands', () => {
    expect(CreatureTerms.parseSubtype('Dwarf&Elf')).toEqual(['dwarf', 'elf']);
  });

  it('returns empty array for generic indicator "any"', () => {
    expect(CreatureTerms.parseSubtype('any')).toEqual([]);
  });

  it('returns empty array for generic indicator "any race"', () => {
    expect(CreatureTerms.parseSubtype('any race')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(CreatureTerms.parseSubtype('')).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(CreatureTerms.parseSubtype(null)).toEqual([]);
  });
});

// =========================================================================
// isGenericSubtype
// =========================================================================

describe('CreatureTerms.isGenericSubtype', () => {
  it.each(['any', 'any race', 'any type', 'various', 'mixed', 'all'])(
    'returns true for generic indicator "%s"',
    (indicator) => {
      expect(CreatureTerms.isGenericSubtype(indicator)).toBe(true);
    }
  );

  it('returns true for empty string', () => {
    expect(CreatureTerms.isGenericSubtype('')).toBe(true);
  });

  it('returns true for null', () => {
    expect(CreatureTerms.isGenericSubtype(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(CreatureTerms.isGenericSubtype(undefined)).toBe(true);
  });

  it('returns false for specific subtype "dwarf"', () => {
    expect(CreatureTerms.isGenericSubtype('dwarf')).toBe(false);
  });

  it('returns false for specific subtype "elf"', () => {
    expect(CreatureTerms.isGenericSubtype('elf')).toBe(false);
  });
});

// =========================================================================
// cacheKey
// =========================================================================

describe('CreatureTerms.cacheKey', () => {
  it('generates lowercase key from actorName, type, subtype', () => {
    expect(
      CreatureTerms.cacheKey({ actorName: 'Goblin', type: 'humanoid', subtype: 'Goblin' })
    ).toBe('goblin_humanoid_goblin');
  });

  it('handles missing properties gracefully', () => {
    expect(CreatureTerms.cacheKey({ actorName: null, type: 'beast' })).toBe('_beast_');
  });

  it('handles completely empty object', () => {
    expect(CreatureTerms.cacheKey({})).toBe('__');
  });
});
