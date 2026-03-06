/**
 * Shared mock TVA cache fixture
 *
 * Provides realistic TVA cache data covering all 3 entry formats used by
 * Token Variant Art's static cache. Used across all service-layer test plans.
 *
 * TVA cache JSON format: { category: [ path | [path, name] | [path, name, tags] ] }
 *
 * @module tests/helpers/mock-tva-cache
 */

/**
 * Raw TVA cache JSON matching the shape TVACacheService reads from disk.
 * Covers 5+ categories with all 3 entry formats and includes Forge CDN URLs.
 */
export const MOCK_TVA_CACHE_JSON = {
  // -- Humanoids: mixed formats --
  Humanoids: [
    // Format 1: plain string path
    'FA_Pack/Tokens/Humanoids/Bandit/Bandit_01.webp',
    'FA_Pack/Tokens/Humanoids/Bandit/Bandit_02.webp',
    'FA_Pack/Tokens/Humanoids/Bandit/Bandit_Captain_01.webp',
    // Format 2: [path, name] tuple
    ['FA_Pack/Tokens/Humanoids/Guard/Guard_City_01.webp', 'City Guard'],
    ['FA_Pack/Tokens/Humanoids/Guard/Guard_City_02.webp', 'City Guard Variant'],
    // Format 3: [path, name, tags] triple
    [
      'FA_Pack/Tokens/Humanoids/Cultist/Cultist_01.webp',
      'Cultist',
      ['humanoid', 'cultist', 'evil'],
    ],
    [
      'FA_Pack/Tokens/Humanoids/Cultist/Cultist_Fanatic_01.webp',
      'Cultist Fanatic',
      ['humanoid', 'cultist', 'fanatic'],
    ],
    // Forge CDN URL (format 1)
    'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Humanoids/Noble/Noble_01.webp',
    // Forge CDN URL (format 2)
    [
      'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Humanoids/Noble/Noble_02.webp',
      'Noble Lady',
    ],
  ],

  // -- Beasts: mostly tuples --
  Beasts: [
    ['FA_Pack/Tokens/Beasts/Bear/Bear_Brown_01.webp', 'Brown Bear'],
    ['FA_Pack/Tokens/Beasts/Bear/Bear_Polar_01.webp', 'Polar Bear'],
    ['FA_Pack/Tokens/Beasts/Wolf/Wolf_01.webp', 'Wolf'],
    ['FA_Pack/Tokens/Beasts/Wolf/Wolf_Dire_01.webp', 'Dire Wolf'],
    'FA_Pack/Tokens/Beasts/Bat/Bat_01.webp',
    'FA_Pack/Tokens/Beasts/Bat/Bat_Giant_01.webp',
  ],

  // -- Undead: all 3 formats --
  Undead: [
    'FA_Pack/Tokens/Undead/Skeleton/Skeleton_01.webp',
    'FA_Pack/Tokens/Undead/Skeleton/Skeleton_02.webp',
    [
      'FA_Pack/Tokens/Undead/Skeleton/Skeleton_Warrior_01.webp',
      'Skeleton Warrior',
      ['undead', 'skeleton'],
    ],
    ['FA_Pack/Tokens/Undead/Zombie/Zombie_01.webp', 'Zombie'],
    ['FA_Pack/Tokens/Undead/Zombie/Zombie_Ogre_01.webp', 'Zombie Ogre'],
    [
      'FA_Pack/Tokens/Undead/Vampire/Vampire_Lord_01.webp',
      'Vampire Lord',
      ['undead', 'vampire', 'boss'],
    ],
  ],

  // -- Dragons: plain strings + tagged --
  Dragons: [
    'FA_Pack/Tokens/Dragons/Dragon_Red/Dragon_Red_Adult_01.webp',
    'FA_Pack/Tokens/Dragons/Dragon_Red/Dragon_Red_Wyrmling_01.webp',
    ['FA_Pack/Tokens/Dragons/Dragon_Blue/Dragon_Blue_Adult_01.webp', 'Adult Blue Dragon'],
    [
      'FA_Pack/Tokens/Dragons/Dragon_Black/Dragon_Black_Young_01.webp',
      'Young Black Dragon',
      ['dragon', 'chromatic', 'black'],
    ],
    [
      'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/Tokens/Dragons/Dragon_Green/Dragon_Green_Adult_01.webp',
      'Adult Green Dragon',
      ['dragon', 'chromatic', 'green'],
    ],
  ],

  // -- Aberrations: mixed --
  Aberrations: [
    'FA_Pack/Tokens/Aberrations/Beholder/Beholder_01.webp',
    ['FA_Pack/Tokens/Aberrations/Beholder/Beholder_Zombie_01.webp', 'Beholder Zombie'],
    ['FA_Pack/Tokens/Aberrations/MindFlayer/MindFlayer_01.webp', 'Mind Flayer'],
    [
      'FA_Pack/Tokens/Aberrations/MindFlayer/MindFlayer_Arcanist_01.webp',
      'Mind Flayer Arcanist',
      ['aberration', 'mindflayer', 'psionic'],
    ],
  ],

  // -- Fiends: extra category for breadth --
  Fiends: [
    'FA_Pack/Tokens/Fiends/Demon/Demon_Balor_01.webp',
    ['FA_Pack/Tokens/Fiends/Devil/Devil_Bone_01.webp', 'Bone Devil'],
    [
      'FA_Pack/Tokens/Fiends/Devil/Devil_Pit_Fiend_01.webp',
      'Pit Fiend',
      ['fiend', 'devil', 'boss'],
    ],
  ],
};

/**
 * Total number of image entries across all categories.
 */
export const EXPECTED_IMAGE_COUNT = Object.values(MOCK_TVA_CACHE_JSON).reduce(
  (sum, entries) => sum + entries.length,
  0
);

/**
 * Array of category keys present in the mock cache.
 */
export const EXPECTED_CATEGORIES = Object.keys(MOCK_TVA_CACHE_JSON);

/**
 * Convert raw TVA cache JSON into the flat array format that TVACacheService produces.
 * Each entry becomes { path, name, category, tags? }.
 *
 * @param {Object} cacheJson - Raw cache JSON (category -> entries)
 * @returns {Array<{path: string, name: string, category: string, tags?: string[]}>}
 */
export function createParsedImages(cacheJson) {
  const images = [];

  for (const [category, entries] of Object.entries(cacheJson)) {
    for (const entry of entries) {
      if (typeof entry === 'string') {
        // Format 1: plain path
        const fileName = entry.split('/').pop() || 'Unknown';
        const nameClean = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
        images.push({ path: entry, name: nameClean, category });
      } else if (Array.isArray(entry)) {
        const [path, name, tags] = entry;
        const result = { path, name: name || path.split('/').pop() || 'Unknown', category };
        if (tags) {
          result.tags = tags;
        }
        images.push(result);
      }
    }
  }

  return images;
}
