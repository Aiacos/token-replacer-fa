/**
 * Tests for Constants.js data exports
 *
 * Verifies structural correctness of all exported data (shapes, keys,
 * non-empty arrays) using representative samples -- NOT exhaustive enumeration.
 *
 * @module tests/core/Constants.test
 */

import { describe, it, expect } from 'vitest';
import {
  MODULE_ID,
  MODULE_TITLE,
  FUSE_CDN,
  PARALLEL_BATCH_SIZE,
  SLOW_MODE_BATCH_SIZE,
  INDEX_BATCH_SIZE,
  MAX_SCAN_DEPTH,
  MAX_DISPLAY_RESULTS,
  EXCLUDED_FOLDERS,
  EXCLUDED_FOLDERS_SET,
  EXCLUDED_FILENAME_TERMS,
  PRIMARY_CATEGORY_TERMS,
  CREATURE_TYPE_MAPPINGS,
  GENERIC_SUBTYPE_INDICATORS,
  DEFAULT_SETTINGS,
} from '../../scripts/core/Constants.js';

// The 14 expected D&D creature type categories
const EXPECTED_CATEGORIES = [
  'humanoid',
  'beast',
  'undead',
  'fiend',
  'dragon',
  'elemental',
  'fey',
  'celestial',
  'construct',
  'aberration',
  'monstrosity',
  'giant',
  'plant',
  'ooze',
];

describe('CREATURE_TYPE_MAPPINGS', () => {
  it('has exactly 14 category keys', () => {
    expect(Object.keys(CREATURE_TYPE_MAPPINGS)).toHaveLength(14);
  });

  it.each(EXPECTED_CATEGORIES)(
    'contains the "%s" category as a non-empty array of strings',
    (category) => {
      expect(CREATURE_TYPE_MAPPINGS).toHaveProperty(category);
      const terms = CREATURE_TYPE_MAPPINGS[category];
      expect(Array.isArray(terms)).toBe(true);
      expect(terms.length).toBeGreaterThan(0);
      terms.forEach((term) => {
        expect(typeof term).toBe('string');
      });
    }
  );

  describe('representative terms', () => {
    it('humanoid contains "elf" and "goblin"', () => {
      expect(CREATURE_TYPE_MAPPINGS.humanoid).toContain('elf');
      expect(CREATURE_TYPE_MAPPINGS.humanoid).toContain('goblin');
    });

    it('beast contains "wolf" and "bear"', () => {
      expect(CREATURE_TYPE_MAPPINGS.beast).toContain('wolf');
      expect(CREATURE_TYPE_MAPPINGS.beast).toContain('bear');
    });

    it('undead contains "skeleton" and "zombie"', () => {
      expect(CREATURE_TYPE_MAPPINGS.undead).toContain('skeleton');
      expect(CREATURE_TYPE_MAPPINGS.undead).toContain('zombie');
    });

    it('dragon contains "dragon" and "wyvern"', () => {
      expect(CREATURE_TYPE_MAPPINGS.dragon).toContain('dragon');
      expect(CREATURE_TYPE_MAPPINGS.dragon).toContain('wyvern');
    });

    it('fiend contains "demon" and "devil"', () => {
      expect(CREATURE_TYPE_MAPPINGS.fiend).toContain('demon');
      expect(CREATURE_TYPE_MAPPINGS.fiend).toContain('devil');
    });

    it('elemental contains "elemental" and "mephit"', () => {
      expect(CREATURE_TYPE_MAPPINGS.elemental).toContain('elemental');
      expect(CREATURE_TYPE_MAPPINGS.elemental).toContain('mephit');
    });

    it('fey contains "pixie" and "dryad"', () => {
      expect(CREATURE_TYPE_MAPPINGS.fey).toContain('pixie');
      expect(CREATURE_TYPE_MAPPINGS.fey).toContain('dryad');
    });

    it('celestial contains "angel" and "unicorn"', () => {
      expect(CREATURE_TYPE_MAPPINGS.celestial).toContain('angel');
      expect(CREATURE_TYPE_MAPPINGS.celestial).toContain('unicorn');
    });

    it('construct contains "golem" and "homunculus"', () => {
      expect(CREATURE_TYPE_MAPPINGS.construct).toContain('golem');
      expect(CREATURE_TYPE_MAPPINGS.construct).toContain('homunculus');
    });

    it('aberration contains "beholder" and "mind flayer"', () => {
      expect(CREATURE_TYPE_MAPPINGS.aberration).toContain('beholder');
      expect(CREATURE_TYPE_MAPPINGS.aberration).toContain('mind flayer');
    });

    it('monstrosity contains "owlbear" and "hydra"', () => {
      expect(CREATURE_TYPE_MAPPINGS.monstrosity).toContain('owlbear');
      expect(CREATURE_TYPE_MAPPINGS.monstrosity).toContain('hydra');
    });

    it('giant contains "giant" and "ogre"', () => {
      expect(CREATURE_TYPE_MAPPINGS.giant).toContain('giant');
      expect(CREATURE_TYPE_MAPPINGS.giant).toContain('ogre');
    });

    it('plant contains "treant" and "myconid"', () => {
      expect(CREATURE_TYPE_MAPPINGS.plant).toContain('treant');
      expect(CREATURE_TYPE_MAPPINGS.plant).toContain('myconid');
    });

    it('ooze contains "ooze" and "slime"', () => {
      expect(CREATURE_TYPE_MAPPINGS.ooze).toContain('ooze');
      expect(CREATURE_TYPE_MAPPINGS.ooze).toContain('slime');
    });
  });
});

describe('EXCLUDED_FOLDERS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(EXCLUDED_FOLDERS)).toBe(true);
    expect(EXCLUDED_FOLDERS.length).toBeGreaterThan(0);
  });

  it('contains only lowercase strings', () => {
    EXCLUDED_FOLDERS.forEach((folder) => {
      expect(typeof folder).toBe('string');
      expect(folder).toBe(folder.toLowerCase());
    });
  });

  describe('representative samples from logical groups', () => {
    it('generic assets: contains "props" and "tiles"', () => {
      expect(EXCLUDED_FOLDERS).toContain('props');
      expect(EXCLUDED_FOLDERS).toContain('tiles');
    });

    it('FA-specific: contains "dungeon_decor" and "prefabs"', () => {
      expect(EXCLUDED_FOLDERS).toContain('dungeon_decor');
      expect(EXCLUDED_FOLDERS).toContain('prefabs');
    });

    it('structures: contains "bridge" and "tower"', () => {
      expect(EXCLUDED_FOLDERS).toContain('bridge');
      expect(EXCLUDED_FOLDERS).toContain('tower');
    });

    it('nature: contains "tree" and "river"', () => {
      expect(EXCLUDED_FOLDERS).toContain('tree');
      expect(EXCLUDED_FOLDERS).toContain('river');
    });
  });
});

describe('EXCLUDED_FOLDERS_SET', () => {
  it('has the same size as EXCLUDED_FOLDERS array length', () => {
    expect(EXCLUDED_FOLDERS_SET.size).toBe(EXCLUDED_FOLDERS.length);
  });

  it('contains every entry from EXCLUDED_FOLDERS', () => {
    EXCLUDED_FOLDERS.forEach((folder) => {
      expect(EXCLUDED_FOLDERS_SET.has(folder)).toBe(true);
    });
  });

  it('is an instance of Set', () => {
    expect(EXCLUDED_FOLDERS_SET).toBeInstanceOf(Set);
  });
});

describe('EXCLUDED_FILENAME_TERMS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(EXCLUDED_FILENAME_TERMS)).toBe(true);
    expect(EXCLUDED_FILENAME_TERMS.length).toBeGreaterThan(0);
  });

  it('contains only lowercase strings', () => {
    EXCLUDED_FILENAME_TERMS.forEach((term) => {
      expect(typeof term).toBe('string');
      expect(term).toBe(term.toLowerCase());
    });
  });

  it('contains representative terms: "cliff", "barrel", "tree"', () => {
    expect(EXCLUDED_FILENAME_TERMS).toContain('cliff');
    expect(EXCLUDED_FILENAME_TERMS).toContain('barrel');
    expect(EXCLUDED_FILENAME_TERMS).toContain('tree');
  });
});

describe('PRIMARY_CATEGORY_TERMS', () => {
  it('has the same 14 category keys as CREATURE_TYPE_MAPPINGS', () => {
    const primaryKeys = Object.keys(PRIMARY_CATEGORY_TERMS).sort();
    const mappingKeys = Object.keys(CREATURE_TYPE_MAPPINGS).sort();
    expect(primaryKeys).toEqual(mappingKeys);
  });

  it.each(EXPECTED_CATEGORIES)(
    '"%s" is a non-empty array of strings',
    (category) => {
      const terms = PRIMARY_CATEGORY_TERMS[category];
      expect(Array.isArray(terms)).toBe(true);
      expect(terms.length).toBeGreaterThan(0);
      terms.forEach((term) => {
        expect(typeof term).toBe('string');
      });
    }
  );
});

describe('GENERIC_SUBTYPE_INDICATORS', () => {
  it('is an array', () => {
    expect(Array.isArray(GENERIC_SUBTYPE_INDICATORS)).toBe(true);
  });

  it('contains all 6 expected values', () => {
    const expected = ['any', 'any race', 'any type', 'various', 'mixed', 'all'];
    expected.forEach((value) => {
      expect(GENERIC_SUBTYPE_INDICATORS).toContain(value);
    });
  });

  it('has exactly 6 entries', () => {
    expect(GENERIC_SUBTYPE_INDICATORS).toHaveLength(6);
  });
});

describe('DEFAULT_SETTINGS', () => {
  const expectedKeys = [
    'fuzzyThreshold',
    'searchPriority',
    'autoReplace',
    'confirmReplace',
    'fallbackFullSearch',
    'useTVACache',
    'refreshTVACache',
    'additionalPaths',
  ];

  it('has all expected keys', () => {
    expectedKeys.forEach((key) => {
      expect(DEFAULT_SETTINGS).toHaveProperty(key);
    });
  });

  it('fuzzyThreshold is 0.1 (number)', () => {
    expect(DEFAULT_SETTINGS.fuzzyThreshold).toBe(0.1);
    expect(typeof DEFAULT_SETTINGS.fuzzyThreshold).toBe('number');
  });

  it('searchPriority is "both" (string)', () => {
    expect(DEFAULT_SETTINGS.searchPriority).toBe('both');
  });

  it('boolean settings have expected defaults', () => {
    expect(DEFAULT_SETTINGS.autoReplace).toBe(false);
    expect(DEFAULT_SETTINGS.confirmReplace).toBe(true);
    expect(DEFAULT_SETTINGS.fallbackFullSearch).toBe(false);
    expect(DEFAULT_SETTINGS.useTVACache).toBe(true);
    expect(DEFAULT_SETTINGS.refreshTVACache).toBe(false);
  });

  it('additionalPaths defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.additionalPaths).toBe('');
  });
});

describe('Scalar Constants', () => {
  it('MODULE_ID is "token-replacer-fa"', () => {
    expect(MODULE_ID).toBe('token-replacer-fa');
  });

  it('MODULE_TITLE is "Token Replacer - Forgotten Adventures"', () => {
    expect(MODULE_TITLE).toBe('Token Replacer - Forgotten Adventures');
  });

  it('FUSE_CDN is a valid URL string', () => {
    expect(typeof FUSE_CDN).toBe('string');
    expect(FUSE_CDN).toMatch(/^https:\/\//);
  });

  it('PARALLEL_BATCH_SIZE is a positive number', () => {
    expect(typeof PARALLEL_BATCH_SIZE).toBe('number');
    expect(PARALLEL_BATCH_SIZE).toBeGreaterThan(0);
  });

  it('SLOW_MODE_BATCH_SIZE is a positive number', () => {
    expect(typeof SLOW_MODE_BATCH_SIZE).toBe('number');
    expect(SLOW_MODE_BATCH_SIZE).toBeGreaterThan(0);
  });

  it('INDEX_BATCH_SIZE is a positive number', () => {
    expect(typeof INDEX_BATCH_SIZE).toBe('number');
    expect(INDEX_BATCH_SIZE).toBeGreaterThan(0);
  });

  it('MAX_SCAN_DEPTH is a positive number', () => {
    expect(typeof MAX_SCAN_DEPTH).toBe('number');
    expect(MAX_SCAN_DEPTH).toBeGreaterThan(0);
  });

  it('MAX_DISPLAY_RESULTS is a positive number', () => {
    expect(typeof MAX_DISPLAY_RESULTS).toBe('number');
    expect(MAX_DISPLAY_RESULTS).toBeGreaterThan(0);
  });
});
