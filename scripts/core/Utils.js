/**
 * Token Replacer FA - Utility Functions
 * @module core/Utils
 */

import { FUSE_CDN, GENERIC_SUBTYPE_INDICATORS } from './Constants.js';

// Fuse.js instance cache
let FuseClass = null;

/**
 * Load Fuse.js library from CDN
 * @returns {Promise<Function|null>} Fuse constructor or null
 */
export async function loadFuse() {
  if (FuseClass) return FuseClass;

  try {
    const module = await import(FUSE_CDN);
    FuseClass = module.default;
    return FuseClass;
  } catch (error) {
    console.error('token-replacer-fa | Failed to load Fuse.js:', error);
    try {
      if (window.Fuse) {
        FuseClass = window.Fuse;
        return FuseClass;
      }
    } catch (e) {
      console.error('token-replacer-fa | Fuse.js not available:', e);
    }
    return null;
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Parse filter text into individual terms for AND logic filtering
 * Supports comma, space, and colon as delimiters
 * @param {string} filterText - The raw filter input text
 * @returns {string[]} Array of lowercase filter terms
 */
export function parseFilterTerms(filterText) {
  if (!filterText) return [];
  return filterText
    .toLowerCase()
    .trim()
    .split(/[,\s:]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

/**
 * Check if text matches all filter terms (AND logic)
 * @param {string} text - The text to check against
 * @param {string[]} filterTerms - Array of terms that must all be present
 * @returns {boolean} True if all terms are found in text
 */
export function matchesAllTerms(text, filterTerms) {
  if (!filterTerms || filterTerms.length === 0) return true;
  const textLower = (text || '').toLowerCase();
  return filterTerms.every(term => textLower.includes(term));
}

/**
 * Yield control back to the main thread
 * @param {number} ms - Milliseconds to wait (0 for immediate)
 * @returns {Promise<void>}
 */
export function yieldToMain(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse subtype string into individual terms
 * e.g., "Dwarf, Monk" → ["dwarf", "monk"]
 * @param {string} subtype - The subtype string
 * @returns {string[]} Array of lowercase subtype terms
 */
export function parseSubtypeTerms(subtype) {
  if (!subtype) return [];

  // Check if it's a generic subtype
  const subtypeLower = subtype.toLowerCase().trim();
  if (GENERIC_SUBTYPE_INDICATORS.some(g => subtypeLower.includes(g))) {
    return [];
  }

  // Split by common delimiters and clean up
  return subtype
    .toLowerCase()
    .split(/[,;\/&]+/)
    .map(term => term.trim())
    .filter(term => term.length > 0 && !GENERIC_SUBTYPE_INDICATORS.includes(term));
}

/**
 * Check if subtype is generic (any, any race, etc.)
 * @param {string} subtype - The subtype string
 * @returns {boolean} True if subtype is generic
 */
export function hasGenericSubtype(subtype) {
  if (!subtype) return false;
  const subtypeLower = subtype.toLowerCase().trim();
  return GENERIC_SUBTYPE_INDICATORS.some(indicator =>
    subtypeLower === indicator || subtypeLower.includes(indicator)
  );
}

/**
 * Generate a unique cache key from creature info
 * @param {Object} creatureInfo - Creature information object
 * @returns {string} Cache key
 */
export function getCreatureCacheKey(creatureInfo) {
  return `${creatureInfo.actorName?.toLowerCase() || ''}_${creatureInfo.type || ''}_${creatureInfo.subtype || ''}`;
}

/**
 * Safely close a Foundry dialog
 * @param {Dialog} dialog - The dialog to close
 */
export async function closeDialogSafely(dialog) {
  if (!dialog) return;
  try {
    if (dialog.rendered) {
      await dialog.close();
    }
  } catch (e) {
    console.warn('token-replacer-fa | Error closing dialog:', e);
  }
}

/**
 * Extract image path from various TVA result formats
 * @param {*} item - TVA result item
 * @returns {string|null} Image path or null
 */
export function extractPathFromTVAResult(item) {
  if (!item) return null;

  // Direct string path
  if (typeof item === 'string') {
    return item.startsWith('http') || item.includes('/') || item.includes('.') ? item : null;
  }

  // Object with path property
  if (typeof item === 'object') {
    return extractPathFromObject(item);
  }

  return null;
}

/**
 * Extract path from an object with various property names
 * @param {Object} obj - Object to extract from
 * @returns {string|null} Path or null
 */
export function extractPathFromObject(obj) {
  const pathProps = ['path', 'img', 'src', 'image', 'url', 'thumb', 'thumbnail'];

  for (const prop of pathProps) {
    if (obj[prop] && typeof obj[prop] === 'string') {
      const val = obj[prop];
      if (val.startsWith('http') || val.includes('/') || val.includes('.')) {
        return val;
      }
    }
  }

  // Check nested objects
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const nestedPath = extractPathFromObject(val);
      if (nestedPath) return nestedPath;
    }
  }

  return null;
}

/**
 * Extract name from TVA result
 * @param {*} item - TVA result item
 * @param {string} imagePath - Fallback image path for name extraction
 * @returns {string} Extracted name
 */
export function extractNameFromTVAResult(item, imagePath) {
  // Try to get name from object properties
  if (typeof item === 'object' && item !== null) {
    const nameProps = ['name', 'label', 'title', 'displayName'];
    for (const prop of nameProps) {
      if (item[prop] && typeof item[prop] === 'string') {
        return item[prop];
      }
    }
  }

  // Extract from path
  if (imagePath) {
    const fileName = imagePath.split('/').pop();
    const nameWithoutExt = fileName?.replace(/\.[^/.]+$/, '') || '';
    return nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Unknown';
  }

  return 'Unknown';
}
