/**
 * Mock Helper Utilities
 *
 * Exported test helper functions for per-test mock customization.
 * Downstream test phases use these to configure mock state for
 * specific test scenarios without reimplementing setup boilerplate.
 *
 * Each function manipulates the global Foundry VTT mocks established
 * by tests/setup/foundry-mocks.js (loaded via setupFiles).
 *
 * @module tests/helpers/mock-helpers
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. setTVAAvailable — toggle Token Variant Art module presence
// ---------------------------------------------------------------------------

/**
 * Add or remove the token-variants (TVA) module from game.modules.
 *
 * When available, provides a fully-mocked TVA API matching the shape
 * that TVACacheService and SearchService expect.
 *
 * @param {boolean} [available=true] - Whether TVA should be present
 * @param {object} [apiOverrides={}] - Overrides merged into the default TVA API
 */
export function setTVAAvailable(available = true, apiOverrides = {}) {
  if (available) {
    game.modules.set('token-variants', {
      id: 'token-variants',
      active: true,
      api: {
        doImageSearch: vi.fn(async () => []),
        cacheImages: vi.fn(async () => {}),
        isCaching: vi.fn(() => false),
        TVA_CONFIG: {
          staticCache: true,
          staticCacheFile: 'mock-tva-cache.json',
        },
        updateTokenImage: vi.fn(async () => {}),
        ...apiOverrides,
      },
    });
  } else {
    game.modules.delete('token-variants');
  }
}

// ---------------------------------------------------------------------------
// 2. setFANexusAvailable — toggle FA Nexus module presence
// ---------------------------------------------------------------------------

/**
 * Add or remove the fa-tokens-nexus module from game.modules.
 *
 * @param {boolean} [available=true] - Whether FA Nexus should be present
 */
export function setFANexusAvailable(available = true) {
  if (available) {
    game.modules.set('fa-tokens-nexus', { id: 'fa-tokens-nexus', active: true });
  } else {
    game.modules.delete('fa-tokens-nexus');
  }
}

// ---------------------------------------------------------------------------
// 3. setSetting — override a module setting for the current test
// ---------------------------------------------------------------------------

/**
 * Set a module setting value in the internal mock store.
 *
 * The value takes priority over registered defaults in game.settings.get().
 *
 * @param {string} key - Setting key (e.g., 'debugMode', 'fuzzyThreshold')
 * @param {*} value - Value to set
 * @param {string} [moduleId='token-replacer-fa'] - Module namespace
 */
export function setSetting(key, value, moduleId = 'token-replacer-fa') {
  game.settings._stores.values.set(`${moduleId}.${key}`, value);
}

// ---------------------------------------------------------------------------
// 4. resetAllMocks — restore all mock state to clean defaults
// ---------------------------------------------------------------------------

/**
 * Clear all per-test mock state back to clean defaults.
 *
 * Resets: settings values, game.modules, canvas.tokens arrays,
 * notification spies, and Hooks spies. Does NOT clear registered
 * setting defaults (those persist across tests).
 */
export function resetAllMocks() {
  // Clear settings values (keep defaults)
  game.settings._stores.values.clear();

  // Clear modules
  game.modules.clear();

  // Reset canvas tokens
  canvas.tokens.placeables = [];
  canvas.tokens.controlled = [];

  // Clear notification spies
  ui.notifications.info.mockClear();
  ui.notifications.warn.mockClear();
  ui.notifications.error.mockClear();

  // Clear Hooks spies
  Hooks.on.mockClear();
  Hooks.once.mockClear();
  Hooks.off.mockClear();
  Hooks.call.mockClear();
  Hooks.callAll.mockClear();
}

// ---------------------------------------------------------------------------
// 5. createMockActor — build a D&D 5e actor-shaped object
// ---------------------------------------------------------------------------

/**
 * Create a mock D&D 5e actor object matching the structure that
 * TokenService.extractCreatureInfo() expects.
 *
 * @param {object} [overrides={}] - Properties to customize
 * @param {string} [overrides.name='Mock Creature'] - Actor name
 * @param {string} [overrides.type='humanoid'] - Creature type (value)
 * @param {string} [overrides.subtype=''] - Creature subtype
 * @param {string} [overrides.custom=''] - Custom type string
 * @param {string} [overrides.tokenImg='icons/svg/mystery-man.svg'] - Token image path
 * @param {string} [overrides.id] - Actor ID (auto-generated if omitted)
 * @returns {object} Mock actor shaped for D&D 5e system
 */
export function createMockActor(overrides = {}) {
  const {
    name = 'Mock Creature',
    type = 'humanoid',
    subtype = '',
    custom = '',
    tokenImg = 'icons/svg/mystery-man.svg',
    id = `mock-actor-${Math.random().toString(36).slice(2, 8)}`,
  } = overrides;

  return {
    id,
    name,
    type: 'npc',
    img: tokenImg,
    system: {
      details: {
        type: {
          value: type,
          subtype,
          custom,
        },
      },
    },
    prototypeToken: {
      name,
      texture: { src: tokenImg },
    },
  };
}

// ---------------------------------------------------------------------------
// 6. createMockToken — build a token-shaped object with actor
// ---------------------------------------------------------------------------

/**
 * Create a mock token object with nested actor, matching the shape
 * that TokenService and canvas.tokens.placeables expect.
 *
 * @param {object} [overrides={}] - Properties to customize
 * @param {object} [overrides.actor] - Actor object (created via createMockActor if omitted)
 * @param {boolean} [overrides.controlled=false] - Whether the token is selected
 * @param {string} [overrides.id] - Token ID (auto-generated if omitted)
 * @returns {object} Mock token shaped for Foundry VTT
 */
export function createMockToken(overrides = {}) {
  const {
    actor = createMockActor(),
    controlled = false,
    id = `mock-token-${Math.random().toString(36).slice(2, 8)}`,
  } = overrides;

  return {
    id,
    name: actor.name,
    actor,
    controlled,
    document: {
      id,
      name: actor.name,
      texture: { src: actor.prototypeToken.texture.src },
    },
  };
}

// ---------------------------------------------------------------------------
// 7. addMockTokens — populate canvas.tokens arrays
// ---------------------------------------------------------------------------

/**
 * Populate canvas.tokens.placeables with the given token objects.
 * Also filters controlled tokens into canvas.tokens.controlled.
 *
 * @param {object[]} tokens - Array of mock token objects
 */
export function addMockTokens(tokens) {
  canvas.tokens.placeables = [...tokens];
  canvas.tokens.controlled = tokens.filter((t) => t.controlled);
}
