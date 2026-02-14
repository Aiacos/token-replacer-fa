/**
 * Token Replacer FA - Utility Functions
 * @module core/Utils
 */

import { FUSE_CDN, GENERIC_SUBTYPE_INDICATORS, EXCLUDED_FOLDERS, EXCLUDED_FILENAME_TERMS } from './Constants.js';

// Fuse.js instance cache
let FuseClass = null;

/**
 * Precompiled RegExp patterns for EXCLUDED_FILENAME_TERMS
 * Created once at module load time for 10-50x faster path filtering
 * compared to creating new RegExp objects on every isExcludedPath() call
 */
const EXCLUDED_FILENAME_PATTERNS = EXCLUDED_FILENAME_TERMS.map(term => new RegExp(`\\b${term}\\b`, 'i'));

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
 * Check if subtype is generic (any, any race, etc.) or absent
 * @param {string} subtype - The subtype string
 * @returns {boolean} True if subtype is generic or missing
 */
export function hasGenericSubtype(subtype) {
  // No subtype means it's generic (show all)
  if (!subtype || subtype.trim() === '') return true;
  const subtypeLower = subtype.toLowerCase().trim();
  return GENERIC_SUBTYPE_INDICATORS.some(indicator =>
    subtypeLower === indicator || subtypeLower.includes(indicator)
  );
}

/**
 * Generate a unique cache key from creature info
 * All components are lowercased for consistent matching
 * @param {Object} creatureInfo - Creature information object
 * @returns {string} Cache key
 */
export function getCreatureCacheKey(creatureInfo) {
  return `${creatureInfo.actorName?.toLowerCase() || ''}_${creatureInfo.type || ''}_${(creatureInfo.subtype || '').toLowerCase()}`;
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
    return item.startsWith('http') || item.startsWith('forge://') || item.includes('/') || item.includes('.') ? item : null;
  }

  // Handle tuple format [path, config] from TVA
  if (Array.isArray(item)) {
    // First element is usually the path
    if (item.length > 0) {
      const firstEl = item[0];
      if (typeof firstEl === 'string') {
        return firstEl.startsWith('http') || firstEl.startsWith('forge://') || firstEl.includes('/') || firstEl.includes('.') ? firstEl : null;
      }
      if (typeof firstEl === 'object' && firstEl !== null) {
        return extractPathFromObject(firstEl);
      }
    }
    // Try second element if first didn't work
    if (item.length > 1 && typeof item[1] === 'object' && item[1] !== null) {
      return extractPathFromObject(item[1]);
    }
    return null;
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
  // Include 'route' and 'uri' for TVA compatibility
  const pathProps = ['path', 'route', 'img', 'src', 'image', 'url', 'thumb', 'thumbnail', 'uri'];

  // Helper to validate path string
  const isValidPath = (val) => val.startsWith('http') || val.startsWith('forge://') || val.includes('/') || val.includes('.');

  for (const prop of pathProps) {
    if (obj[prop] && typeof obj[prop] === 'string') {
      const val = obj[prop];
      if (isValidPath(val)) {
        return val;
      }
    }
  }

  // Check nested .data property (TVA format)
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    for (const prop of pathProps) {
      if (obj.data[prop] && typeof obj.data[prop] === 'string') {
        const val = obj.data[prop];
        if (isValidPath(val)) {
          return val;
        }
      }
    }
  }

  // Check nested objects (general case)
  for (const key of Object.keys(obj)) {
    if (key === 'data') continue; // Already checked above
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

/**
 * CDN URL segments to skip when checking folder exclusions
 * These are common in Forge bazaar URLs: https://assets.forge-vtt.com/bazaar/assets/...
 */
const CDN_SEGMENTS = new Set([
  'https:', 'http:', '', 'bazaar', 'assets', 'modules', 'systems',
  'assets.forge-vtt.com', 'forge-vtt.com', 'foundryvtt.com',
  'www', 'cdn', 'static', 'public', 'uploads', 'files'
]);

/**
 * Check if a path should be excluded from token search
 * Checks both folder names and filename for environmental/prop terms
 * @param {string} path - Image path to check
 * @returns {boolean} True if path should be excluded
 */
export function isExcludedPath(path) {
  if (!path) return true;
  const pathLower = path.toLowerCase();
  const segments = pathLower.split('/');

  // Filter out CDN segments and check remaining folder names
  const folderSegments = segments.filter(s => !CDN_SEGMENTS.has(s) && s.length > 0);

  // Check folder names against exclusion list
  const folderExcluded = EXCLUDED_FOLDERS.some(folder =>
    folderSegments.some(segment => segment === folder)
  );
  if (folderExcluded) return true;

  // Also check filename for environmental/prop terms
  const filename = segments[segments.length - 1] || '';
  // Remove extension and convert separators to spaces for word matching
  const filenameClean = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').toLowerCase();

  // Check if filename contains excluded terms using precompiled patterns
  // Match as word boundary: "cliff_entrance" matches "cliff", but "clifford" doesn't
  return EXCLUDED_FILENAME_PATTERNS.some(pattern => pattern.test(filenameClean));
}
