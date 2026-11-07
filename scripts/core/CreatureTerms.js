/**
 * Token Replacer FA - Creature subtype terms
 * @module core/CreatureTerms
 */

import { GENERIC_SUBTYPE_INDICATORS } from './Constants.js';

/** Delimiters between subtypes in D&D 5e data, e.g. "Dwarf, Monk" or "elf/human". */
const SUBTYPE_DELIMITERS = /[,;&/]+/;

/**
 * Reads a creature's D&D 5e subtype string the way search and the result cache
 * both need it: as search terms, as a "generic, show everything" verdict, and
 * as part of a cache key. Keeping the three together keeps them agreeing on
 * what "generic" means.
 *
 * @pattern Static Utility — stateless rules over creature data with one owner;
 * no instance, because there is nothing to hold between calls.
 */
export class CreatureTerms {
  /**
   * Parse subtype string into individual terms
   * e.g., "Dwarf, Monk" → ["dwarf", "monk"]
   * @param {string} [subtype] - The subtype string
   * @returns {string[]} Array of lowercase subtype terms (empty for a generic subtype)
   */
  static parseSubtype(subtype) {
    if (!subtype) return [];

    // A generic subtype ("any race") contributes no terms
    const subtypeLower = subtype.toLowerCase().trim();
    if (GENERIC_SUBTYPE_INDICATORS.some((g) => subtypeLower.includes(g))) {
      return [];
    }

    return subtype
      .toLowerCase()
      .split(SUBTYPE_DELIMITERS)
      .map((term) => term.trim())
      .filter((term) => term.length > 0 && !GENERIC_SUBTYPE_INDICATORS.includes(term));
  }

  /**
   * Check if subtype is generic (any, any race, etc.) or absent
   * @param {string} [subtype] - The subtype string
   * @returns {boolean} True if subtype is generic or missing
   */
  static isGenericSubtype(subtype) {
    // No subtype means it's generic (show all)
    if (!subtype || subtype.trim() === '') return true;
    const subtypeLower = subtype.toLowerCase().trim();
    return GENERIC_SUBTYPE_INDICATORS.some(
      (indicator) => subtypeLower === indicator || subtypeLower.includes(indicator)
    );
  }

  /**
   * Generate a unique cache key from creature info
   * All components are lowercased for consistent matching
   * @param {{actorName?: string, type?: string, subtype?: string}} creatureInfo - Creature information object
   * @returns {string} Cache key
   */
  static cacheKey(creatureInfo) {
    return `${creatureInfo.actorName?.toLowerCase() || ''}_${creatureInfo.type || ''}_${(creatureInfo.subtype || '').toLowerCase()}`;
  }
}
