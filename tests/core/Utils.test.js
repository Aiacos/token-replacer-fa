/**
 * Tests for Utils.js exported functions
 *
 * Covers all pure utility functions, path extraction, security functions,
 * CDN path exclusion filtering, and Fuse.js loader with fallback paths.
 *
 * Requirements: TEST-02, TEST-03, TEST-04, TEST-05
 *
 * @module tests/core/Utils.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setSetting } from '../helpers/mock-helpers.js';
import {
  escapeHtml,
  sanitizePath,
  parseFilterTerms,
  matchesAllTerms,
  parseSubtypeTerms,
  hasGenericSubtype,
  getCreatureCacheKey,
  extractPathFromTVAResult,
  extractPathFromObject,
  extractNameFromTVAResult,
  createModuleError,
  createDebugLogger,
  clearExcludedPathCache,
  isExcludedPath,
} from '../../scripts/core/Utils.js';

// =========================================================================
// 1. escapeHtml (TEST-05)
// =========================================================================

describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes all five HTML chars in combination', () => {
    expect(escapeHtml('<a href="x">it\'s & done</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;it&#039;s &amp; done&lt;/a&gt;'
    );
  });

  // OWASP XSS payloads
  it('neutralizes script tag injection', () => {
    const result = escapeHtml('<script>alert("xss")</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('neutralizes img onerror event handler', () => {
    const result = escapeHtml('<img onerror="alert(1)" src=x>');
    expect(result).toContain('&lt;img onerror');
    expect(result).not.toContain('<img');
  });

  it('neutralizes anchor onmouseover event handler', () => {
    const result = escapeHtml('<a onmouseover="alert(1)">hover</a>');
    expect(result).toContain('&lt;a onmouseover');
    expect(result).not.toContain('<a ');
  });

  it('neutralizes svg onload injection', () => {
    const result = escapeHtml('"><svg onload=alert(1)>');
    expect(result).toContain('&quot;&gt;&lt;svg');
    expect(result).not.toContain('<svg');
  });

  it('neutralizes SQL injection quotes', () => {
    const result = escapeHtml("'; DROP TABLE users;--");
    expect(result).toContain('&#039;');
    expect(result).not.toContain("'");
  });

  // Edge cases
  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces number input via String()', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  it('coerces boolean input via String()', () => {
    expect(escapeHtml(true)).toBe('true');
  });

  it('leaves unicode entities as-is (only escapes 5 HTML chars)', () => {
    expect(escapeHtml('\u00e9\u00e8')).toBe('\u00e9\u00e8');
  });

  it('double-escapes already-escaped content', () => {
    // &amp; becomes &amp;amp; -- this is expected behavior
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });
});

// =========================================================================
// 2. sanitizePath (TEST-05)
// =========================================================================

describe('sanitizePath', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  // Valid paths
  it('returns normalized path for valid relative path', () => {
    expect(sanitizePath('modules/fa-pack/tokens/goblin.png')).toBe(
      'modules/fa-pack/tokens/goblin.png'
    );
  });

  it('normalizes backslashes to forward slashes', () => {
    expect(sanitizePath('modules\\fa\\token.png')).toBe('modules/fa/token.png');
  });

  // Traversal attacks
  it('rejects path traversal with ../../../etc/passwd', () => {
    expect(sanitizePath('../../../etc/passwd')).toBeNull();
  });

  it('rejects Windows path traversal with backslashes', () => {
    expect(sanitizePath('..\\..\\windows\\system32')).toBeNull();
  });

  it('rejects mid-path traversal sequences', () => {
    expect(sanitizePath('valid/../../../etc/shadow')).toBeNull();
  });

  it('rejects short traversal sequences', () => {
    expect(sanitizePath('path/../../secret')).toBeNull();
  });

  // Null byte
  it('rejects paths with null bytes', () => {
    expect(sanitizePath('normal\0.txt')).toBeNull();
  });

  // Absolute paths
  it('rejects Unix absolute paths', () => {
    expect(sanitizePath('/etc/passwd')).toBeNull();
  });

  it('rejects Windows absolute paths', () => {
    expect(sanitizePath('\\windows\\system32')).toBeNull();
  });

  // Edge cases
  it('returns null for null input', () => {
    expect(sanitizePath(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(sanitizePath(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizePath('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(sanitizePath('   ')).toBeNull();
  });

  it('returns null for non-string input (number)', () => {
    expect(sanitizePath(42)).toBeNull();
  });

  it('returns null for non-string input (object)', () => {
    expect(sanitizePath({})).toBeNull();
  });

  // Console.warn verification
  it('calls console.warn for rejected traversal paths', () => {
    sanitizePath('../../../etc/passwd');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('calls console.warn for rejected null byte paths', () => {
    sanitizePath('normal\0.txt');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('calls console.warn for rejected absolute paths', () => {
    sanitizePath('/etc/passwd');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizePath('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: protocol', () => {
    expect(sanitizePath('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects vbscript: protocol', () => {
    expect(sanitizePath('vbscript:MsgBox("XSS")')).toBeNull();
  });

  it('rejects dangerous protocols case-insensitively', () => {
    expect(sanitizePath('JAVASCRIPT:alert(1)')).toBeNull();
    expect(sanitizePath('Data:text/html,test')).toBeNull();
    expect(sanitizePath('VbScript:run')).toBeNull();
  });

  it('calls console.warn for rejected protocol paths', () => {
    sanitizePath('javascript:alert(1)');
    expect(warnSpy).toHaveBeenCalled();
  });
});

// =========================================================================
// 3. parseFilterTerms
// =========================================================================

describe('parseFilterTerms', () => {
  it('splits on commas', () => {
    expect(parseFilterTerms('goblin, orc')).toEqual(['goblin', 'orc']);
  });

  it('splits on spaces', () => {
    expect(parseFilterTerms('red dragon')).toEqual(['red', 'dragon']);
  });

  it('splits on colons', () => {
    expect(parseFilterTerms('fire:ice')).toEqual(['fire', 'ice']);
  });

  it('trims and lowercases input', () => {
    expect(parseFilterTerms('  GOBLIN  ')).toEqual(['goblin']);
  });

  it('returns empty array for empty string', () => {
    expect(parseFilterTerms('')).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(parseFilterTerms(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(parseFilterTerms(undefined)).toEqual([]);
  });
});

// =========================================================================
// 4. matchesAllTerms
// =========================================================================

describe('matchesAllTerms', () => {
  it('returns true when all terms are found (case insensitive)', () => {
    expect(matchesAllTerms('Red Dragon', ['red', 'dragon'])).toBe(true);
  });

  it('returns false when any term is missing', () => {
    expect(matchesAllTerms('Red Dragon', ['red', 'blue'])).toBe(false);
  });

  it('returns true for empty terms array', () => {
    expect(matchesAllTerms('anything', [])).toBe(true);
  });

  it('returns true for null terms array', () => {
    expect(matchesAllTerms('anything', null)).toBe(true);
  });

  it('returns false for null text with terms', () => {
    expect(matchesAllTerms(null, ['term'])).toBe(false);
  });

  it('returns false for empty text with terms', () => {
    expect(matchesAllTerms('', ['term'])).toBe(false);
  });
});

// =========================================================================
// 5. parseSubtypeTerms
// =========================================================================

describe('parseSubtypeTerms', () => {
  it('splits on commas', () => {
    expect(parseSubtypeTerms('Dwarf, Monk')).toEqual(['dwarf', 'monk']);
  });

  it('splits on slashes', () => {
    expect(parseSubtypeTerms('Elf/Human')).toEqual(['elf', 'human']);
  });

  it('splits on semicolons', () => {
    expect(parseSubtypeTerms('Orc;Goblin')).toEqual(['orc', 'goblin']);
  });

  it('splits on ampersands', () => {
    expect(parseSubtypeTerms('Dwarf&Elf')).toEqual(['dwarf', 'elf']);
  });

  it('returns empty array for generic indicator "any"', () => {
    expect(parseSubtypeTerms('any')).toEqual([]);
  });

  it('returns empty array for generic indicator "any race"', () => {
    expect(parseSubtypeTerms('any race')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseSubtypeTerms('')).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(parseSubtypeTerms(null)).toEqual([]);
  });
});

// =========================================================================
// 6. hasGenericSubtype
// =========================================================================

describe('hasGenericSubtype', () => {
  it.each(['any', 'any race', 'any type', 'various', 'mixed', 'all'])(
    'returns true for generic indicator "%s"',
    (indicator) => {
      expect(hasGenericSubtype(indicator)).toBe(true);
    }
  );

  it('returns true for empty string', () => {
    expect(hasGenericSubtype('')).toBe(true);
  });

  it('returns true for null', () => {
    expect(hasGenericSubtype(null)).toBe(true);
  });

  it('returns true for undefined', () => {
    expect(hasGenericSubtype(undefined)).toBe(true);
  });

  it('returns false for specific subtype "dwarf"', () => {
    expect(hasGenericSubtype('dwarf')).toBe(false);
  });

  it('returns false for specific subtype "elf"', () => {
    expect(hasGenericSubtype('elf')).toBe(false);
  });
});

// =========================================================================
// 7. getCreatureCacheKey
// =========================================================================

describe('getCreatureCacheKey', () => {
  it('generates lowercase key from actorName, type, subtype', () => {
    expect(
      getCreatureCacheKey({ actorName: 'Goblin', type: 'humanoid', subtype: 'Goblin' })
    ).toBe('goblin_humanoid_goblin');
  });

  it('handles missing properties gracefully', () => {
    expect(getCreatureCacheKey({ actorName: null, type: 'beast' })).toBe('_beast_');
  });

  it('handles completely empty object', () => {
    expect(getCreatureCacheKey({})).toBe('__');
  });
});

// =========================================================================
// 8. extractPathFromTVAResult (TEST-03)
// =========================================================================

describe('extractPathFromTVAResult', () => {
  // String paths
  it('returns a local file path string', () => {
    expect(extractPathFromTVAResult('modules/fa-pack/tokens/goblin.png')).toBe(
      'modules/fa-pack/tokens/goblin.png'
    );
  });

  it('returns a CDN URL string', () => {
    const url = 'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/goblin.png';
    expect(extractPathFromTVAResult(url)).toBe(url);
  });

  it('returns a forge:// URL string', () => {
    expect(extractPathFromTVAResult('forge://assets/tokens/goblin.png')).toBe(
      'forge://assets/tokens/goblin.png'
    );
  });

  // Array tuples
  it('returns first element from [path, name] tuple', () => {
    expect(extractPathFromTVAResult(['modules/fa-pack/goblin.png', 'Goblin'])).toBe(
      'modules/fa-pack/goblin.png'
    );
  });

  it('returns first element from [path, name, tags] tuple', () => {
    expect(
      extractPathFromTVAResult(['modules/fa-pack/goblin.png', 'Goblin', ['humanoid']])
    ).toBe('modules/fa-pack/goblin.png');
  });

  // Object formats
  it('extracts path from object with path property', () => {
    expect(extractPathFromTVAResult({ path: 'modules/fa-pack/goblin.png' })).toBe(
      'modules/fa-pack/goblin.png'
    );
  });

  it('extracts path from object with img property', () => {
    expect(extractPathFromTVAResult({ img: 'tokens/goblin.png' })).toBe(
      'tokens/goblin.png'
    );
  });

  // Null/undefined
  it('returns null for null input', () => {
    expect(extractPathFromTVAResult(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractPathFromTVAResult(undefined)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(extractPathFromTVAResult([])).toBeNull();
  });

  it('returns null for string without path indicators', () => {
    expect(extractPathFromTVAResult('justAName')).toBeNull();
  });
});

// =========================================================================
// 9. extractPathFromObject (TEST-03)
// =========================================================================

describe('extractPathFromObject', () => {
  const pathProperties = ['path', 'route', 'img', 'src', 'image', 'url', 'thumb', 'thumbnail', 'uri'];

  it.each(pathProperties)('extracts path from "%s" property', (prop) => {
    const obj = { [prop]: 'tokens/goblin.png' };
    expect(extractPathFromObject(obj)).toBe('tokens/goblin.png');
  });

  it('extracts path from nested .data property', () => {
    expect(extractPathFromObject({ data: { path: 'tokens/goblin.png' } })).toBe(
      'tokens/goblin.png'
    );
  });

  it('respects depth limit (returns null beyond depth 3)', () => {
    const deep = {
      level1: {
        level2: {
          level3: {
            level4: {
              path: 'tokens/goblin.png',
            },
          },
        },
      },
    };
    expect(extractPathFromObject(deep)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(extractPathFromObject({})).toBeNull();
  });

  it('ignores __proto__ key (prototype pollution guard)', () => {
    const obj = Object.create(null);
    obj.__proto__ = { path: 'evil.png' };
    obj.safe = 'not-a-path';
    expect(extractPathFromObject(obj)).toBeNull();
  });

  it('ignores constructor key (prototype pollution guard)', () => {
    const obj = Object.create(null);
    obj.constructor = { path: 'evil.png' };
    expect(extractPathFromObject(obj)).toBeNull();
  });

  it('ignores prototype key (prototype pollution guard)', () => {
    const obj = Object.create(null);
    obj.prototype = { path: 'evil.png' };
    expect(extractPathFromObject(obj)).toBeNull();
  });
});

// =========================================================================
// 10. extractNameFromTVAResult
// =========================================================================

describe('extractNameFromTVAResult', () => {
  it('extracts name from object name property', () => {
    expect(extractNameFromTVAResult({ name: 'Goblin Warrior' }, null)).toBe(
      'Goblin Warrior'
    );
  });

  it('extracts name from object label property', () => {
    expect(extractNameFromTVAResult({ label: 'Elf Scout' }, null)).toBe('Elf Scout');
  });

  it('extracts name from object title property', () => {
    expect(extractNameFromTVAResult({ title: 'Dragon' }, null)).toBe('Dragon');
  });

  it('falls back to filename extraction from image path', () => {
    expect(extractNameFromTVAResult({}, 'modules/fa-pack/tokens/goblin_warrior.png')).toBe(
      'goblin warrior'
    );
  });

  it('returns "Unknown" when no name and no path available', () => {
    expect(extractNameFromTVAResult({}, null)).toBe('Unknown');
  });

  it('returns "Unknown" for null item with no path', () => {
    expect(extractNameFromTVAResult(null, null)).toBe('Unknown');
  });

  it('extracts name from path for string item', () => {
    expect(extractNameFromTVAResult('just-a-string', 'tokens/orc_shaman.png')).toBe(
      'orc shaman'
    );
  });
});

// =========================================================================
// 11. createModuleError
// =========================================================================

describe('createModuleError', () => {
  it('returns structured error with errorType and message', () => {
    const err = createModuleError('search_failed', 'Something went wrong');
    expect(err.errorType).toBe('search_failed');
    expect(err.message).toBe('TOKEN_REPLACER_FA.errors.search_failed');
    expect(err.details).toBe('Something went wrong');
  });

  it('calls game.i18n.localize with correct key pattern', () => {
    createModuleError('tva_unavailable', 'No TVA');
    expect(game.i18n.localize).toHaveBeenCalledWith(
      'TOKEN_REPLACER_FA.errors.tva_unavailable'
    );
  });

  it('maps recoveryKeys to localized recovery suggestions', () => {
    const err = createModuleError('search_failed', 'Error', [
      'check_tva',
      'refresh_cache',
    ]);
    expect(err.recoverySuggestions).toEqual([
      'TOKEN_REPLACER_FA.recovery.check_tva',
      'TOKEN_REPLACER_FA.recovery.refresh_cache',
    ]);
  });

  it('returns empty recoverySuggestions when no keys provided', () => {
    const err = createModuleError('search_failed', 'Error');
    expect(err.recoverySuggestions).toEqual([]);
  });
});

// =========================================================================
// 12. createDebugLogger
// =========================================================================

describe('createDebugLogger', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('returns a function', () => {
    expect(typeof createDebugLogger('TestService')).toBe('function');
  });

  it('logs when debugMode is true', () => {
    setSetting('debugMode', true);
    const logger = createDebugLogger('TestService');
    logger('test message', { data: 1 });
    expect(logSpy).toHaveBeenCalledWith(
      'token-replacer-fa | [TestService] test message',
      { data: 1 }
    );
  });

  it('does not log when debugMode is false', () => {
    setSetting('debugMode', false);
    const logger = createDebugLogger('TestService');
    logger('test message');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('silently ignores when settings are not registered', () => {
    // Simulate settings.get throwing
    const originalGet = game.settings.get;
    game.settings.get = vi.fn(() => {
      throw new Error('Settings not registered');
    });
    const logger = createDebugLogger('TestService');
    expect(() => logger('test message')).not.toThrow();
    game.settings.get = originalGet;
  });
});

// =========================================================================
// 13. isExcludedPath (TEST-02)
// =========================================================================

describe('isExcludedPath', () => {
  beforeEach(() => {
    clearExcludedPathCache();
  });

  // CDN URL handling
  it('does NOT exclude CDN URL with non-excluded folder (Tokens)', () => {
    expect(
      isExcludedPath(
        'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Goblin/goblin.png'
      )
    ).toBe(false);
  });

  it('excludes CDN URL with excluded folder in real path (props)', () => {
    expect(
      isExcludedPath(
        'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/props/barrel.png'
      )
    ).toBe(true);
  });

  it('CDN segments (assets, bazaar) do NOT trigger exclusion in URL structure', () => {
    // The path has "assets" and "bazaar" in the CDN structure but the actual
    // content path (FA_Pack/Tokens/Goblin) is not excluded
    expect(
      isExcludedPath(
        'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Goblin/goblin_warrior.png'
      )
    ).toBe(false);
  });

  // Local path handling
  it('excludes local path with excluded folder (tiles)', () => {
    expect(isExcludedPath('modules/fa-pack/tiles/floor-01.png')).toBe(true);
  });

  it('does NOT exclude local path with non-excluded folder (tokens)', () => {
    expect(isExcludedPath('modules/fa-pack/tokens/goblin.png')).toBe(false);
  });

  // Filename exclusion with word boundary matching
  it('excludes path with excluded term in filename (cliff_entrance)', () => {
    expect(
      isExcludedPath('modules/fa-pack/Tokens/cliff_entrance_01.png')
    ).toBe(true);
  });

  it('does NOT exclude partial word match in filename (Clifford)', () => {
    expect(
      isExcludedPath('modules/fa-pack/Tokens/Clifford_The_Dog.png')
    ).toBe(false);
  });

  // Excluded folder groups - representative samples
  it('excludes generic asset folder (props)', () => {
    expect(isExcludedPath('some/props/item.png')).toBe(true);
  });

  it('excludes FA-specific folder (dungeon_decor)', () => {
    expect(isExcludedPath('some/dungeon_decor/torch.png')).toBe(true);
  });

  it('excludes structure folder (bridge)', () => {
    expect(isExcludedPath('some/bridge/stone_bridge.png')).toBe(true);
  });

  it('excludes nature folder (tree)', () => {
    expect(isExcludedPath('some/tree/oak.png')).toBe(true);
  });

  // Null/empty input
  it('returns true for null input', () => {
    expect(isExcludedPath(null)).toBe(true);
  });

  it('returns true for empty string', () => {
    expect(isExcludedPath('')).toBe(true);
  });

  // Memoization cache
  it('returns consistent results (cached values match fresh results)', () => {
    const path = 'modules/fa-pack/tokens/goblin.png';
    const firstResult = isExcludedPath(path);
    const secondResult = isExcludedPath(path);
    expect(firstResult).toBe(secondResult);
    expect(firstResult).toBe(false);
  });
});

// =========================================================================
// 14. loadFuse (TEST-04)
// =========================================================================

describe('loadFuse', () => {
  let errorSpy;

  beforeEach(() => {
    vi.resetModules();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    delete window.Fuse;
  });

  it('returns Fuse constructor from CDN on success', async () => {
    const mockFuse = class MockFuse {};
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => ({
      default: mockFuse,
    }));
    const { loadFuse } = await import('../../scripts/core/Utils.js');
    const result = await loadFuse();
    expect(result).toBe(mockFuse);
  });

  it('falls back to window.Fuse when CDN fails', async () => {
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => {
      throw new Error('Network error');
    });
    const mockFuse = class WindowFuse {};
    window.Fuse = mockFuse;
    const { loadFuse } = await import('../../scripts/core/Utils.js');
    const result = await loadFuse();
    expect(result).toBe(mockFuse);
  });

  it('returns null when both CDN and window.Fuse fail', async () => {
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => {
      throw new Error('Network error');
    });
    delete window.Fuse;
    const { loadFuse } = await import('../../scripts/core/Utils.js');
    const result = await loadFuse();
    expect(result).toBeNull();
  });

  it('caches result and returns same reference on subsequent calls', async () => {
    const mockFuse = class MockFuse {};
    vi.doMock('https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs', () => ({
      default: mockFuse,
    }));
    const { loadFuse } = await import('../../scripts/core/Utils.js');
    const first = await loadFuse();
    const second = await loadFuse();
    expect(first).toBe(second);
  });
});
