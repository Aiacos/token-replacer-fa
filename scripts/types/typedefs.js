/**
 * @file Central JSDoc typedef definitions for shared data structures.
 * This file contains ONLY type definitions — no runtime code, no side effects.
 * Services import types via: import('../types/typedefs.js').TypeName
 */

/**
 * Creature information extracted from a Foundry VTT token/actor.
 * @typedef {Object} CreatureInfo
 * @property {string} tokenId - Foundry token ID
 * @property {string} tokenName - Token display name
 * @property {string} actorName - Actor name
 * @property {string} actorId - Foundry actor ID
 * @property {string} currentImage - Current token image path
 * @property {string|null} type - D&D 5e creature type (e.g., "humanoid")
 * @property {string|null} subtype - Creature subtype (e.g., "human")
 * @property {string|null} race - Character race if available
 * @property {string} [custom] - Custom type string if available
 * @property {string[]} searchTerms - Prioritized search terms
 */

/**
 * A matched token image result from search.
 * @typedef {Object} TokenMatch
 * @property {string} path - File path to token image
 * @property {string} name - Display name for the match
 * @property {string} category - Creature category
 * @property {number} [score] - Fuzzy match score (0-1, lower is better)
 */

/**
 * Cached hierarchical index of token images stored in IndexedDB.
 * @typedef {Object} IndexedCache
 * @property {number} version - Index version number
 * @property {number} timestamp - Build timestamp
 * @property {number} lastUpdate - Last update timestamp
 * @property {Object<string, Object<string, Array<{path: string, name: string}>>>} categories - Hierarchical category index
 * @property {Object<string, {name: string, category: string, subcategories: string[]}>} allPaths - Path lookup map
 * @property {Object<string, string[]>} termIndex - Term to paths lookup
 */

/**
 * Structured error information for user-facing error display.
 * @typedef {Object} ModuleError
 * @property {string} errorType - Error category (e.g., "tva_cache", "index", "unknown")
 * @property {string} message - User-facing error message (localized)
 * @property {string} [details] - Technical details for debugging
 * @property {string[]} [recoverySuggestions] - Actionable recovery steps
 */

/**
 * Normalized form of a TVA cache entry after parsing.
 * @typedef {Object} TVACacheEntry
 * @property {string} path - File path to token image
 * @property {string} name - Display name extracted from path
 * @property {string} category - Creature category from folder structure
 */

/**
 * Result of a token image search operation.
 * @typedef {Object} SearchResult
 * @property {TokenMatch[]} matches - Matched token images
 * @property {string} searchType - Type of search performed (e.g., "tva_cache", "scan")
 * @property {string} query - Original search query
 * @property {number} [duration] - Search duration in milliseconds
 */

export {};
