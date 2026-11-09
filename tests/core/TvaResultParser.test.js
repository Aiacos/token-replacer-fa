/**
 * Tests for TvaResultParser: TVA result shapes to path and name
 *
 * @module tests/core/TvaResultParser.test
 */

import { describe, it, expect } from 'vitest';
import { TvaResultParser } from '../../scripts/core/TvaResultParser.js';

// =========================================================================
// extractPath (TEST-03)
// =========================================================================

describe('TvaResultParser.extractPath', () => {
  // String paths
  it('returns a local file path string', () => {
    expect(TvaResultParser.extractPath('modules/fa-pack/tokens/goblin.png')).toBe(
      'modules/fa-pack/tokens/goblin.png'
    );
  });

  it('returns a CDN URL string', () => {
    const url = 'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/goblin.png';
    expect(TvaResultParser.extractPath(url)).toBe(url);
  });

  it('returns a forge:// URL string', () => {
    expect(TvaResultParser.extractPath('forge://assets/tokens/goblin.png')).toBe(
      'forge://assets/tokens/goblin.png'
    );
  });

  // Array tuples
  it('returns first element from [path, name] tuple', () => {
    expect(TvaResultParser.extractPath(['modules/fa-pack/goblin.png', 'Goblin'])).toBe(
      'modules/fa-pack/goblin.png'
    );
  });

  it('returns first element from [path, name, tags] tuple', () => {
    expect(
      TvaResultParser.extractPath(['modules/fa-pack/goblin.png', 'Goblin', ['humanoid']])
    ).toBe('modules/fa-pack/goblin.png');
  });

  // Object formats
  it('extracts path from object with path property', () => {
    expect(TvaResultParser.extractPath({ path: 'modules/fa-pack/goblin.png' })).toBe(
      'modules/fa-pack/goblin.png'
    );
  });

  it('extracts path from object with img property', () => {
    expect(TvaResultParser.extractPath({ img: 'tokens/goblin.png' })).toBe('tokens/goblin.png');
  });

  // Null/undefined
  it('returns null for null input', () => {
    expect(TvaResultParser.extractPath(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(TvaResultParser.extractPath(undefined)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(TvaResultParser.extractPath([])).toBeNull();
  });

  it('returns null for string without path indicators', () => {
    expect(TvaResultParser.extractPath('justAName')).toBeNull();
  });
});

// =========================================================================
// extractPathFromObject (TEST-03)
// =========================================================================

describe('TvaResultParser.extractPathFromObject', () => {
  const pathProperties = [
    'path',
    'route',
    'img',
    'src',
    'image',
    'url',
    'thumb',
    'thumbnail',
    'uri',
  ];

  it.each(pathProperties)('extracts path from "%s" property', (prop) => {
    const obj = { [prop]: 'tokens/goblin.png' };
    expect(TvaResultParser.extractPathFromObject(obj)).toBe('tokens/goblin.png');
  });

  it('extracts path from nested .data property', () => {
    expect(TvaResultParser.extractPathFromObject({ data: { path: 'tokens/goblin.png' } })).toBe(
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
    expect(TvaResultParser.extractPathFromObject(deep)).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(TvaResultParser.extractPathFromObject({})).toBeNull();
  });

  it('ignores __proto__ key (prototype pollution guard)', () => {
    const obj = Object.create(null);
    obj.__proto__ = { path: 'evil.png' };
    obj.safe = 'not-a-path';
    expect(TvaResultParser.extractPathFromObject(obj)).toBeNull();
  });

  it('ignores constructor key (prototype pollution guard)', () => {
    const obj = Object.create(null);
    obj.constructor = { path: 'evil.png' };
    expect(TvaResultParser.extractPathFromObject(obj)).toBeNull();
  });

  it('ignores prototype key (prototype pollution guard)', () => {
    const obj = Object.create(null);
    obj.prototype = { path: 'evil.png' };
    expect(TvaResultParser.extractPathFromObject(obj)).toBeNull();
  });
});

// =========================================================================
// extractName
// =========================================================================

describe('TvaResultParser.extractName', () => {
  it('extracts name from object name property', () => {
    expect(TvaResultParser.extractName({ name: 'Goblin Warrior' }, null)).toBe('Goblin Warrior');
  });

  it('extracts name from object label property', () => {
    expect(TvaResultParser.extractName({ label: 'Elf Scout' }, null)).toBe('Elf Scout');
  });

  it('extracts name from object title property', () => {
    expect(TvaResultParser.extractName({ title: 'Dragon' }, null)).toBe('Dragon');
  });

  it('falls back to filename extraction from image path', () => {
    expect(TvaResultParser.extractName({}, 'modules/fa-pack/tokens/goblin_warrior.png')).toBe(
      'goblin warrior'
    );
  });

  it('returns "Unknown" when no name and no path available', () => {
    expect(TvaResultParser.extractName({}, null)).toBe('Unknown');
  });

  it('returns "Unknown" for null item with no path', () => {
    expect(TvaResultParser.extractName(null, null)).toBe('Unknown');
  });

  it('extracts name from path for string item', () => {
    expect(TvaResultParser.extractName('just-a-string', 'tokens/orc_shaman.png')).toBe(
      'orc shaman'
    );
  });
});
