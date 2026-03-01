/**
 * Foundry VTT Global Mock Setup
 *
 * Loaded via Vitest setupFiles BEFORE any test file imports are resolved.
 * All globals must be established here because services export singletons
 * that call createDebugLogger() and new Worker() at module scope.
 *
 * @module tests/setup/foundry-mocks
 */

import { vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// 1. In-memory settings store (Pattern 2 from research)
// ---------------------------------------------------------------------------

const _settingsStore = new Map();
const _settingsDefaults = new Map();

const mockSettings = {
  get: vi.fn((moduleId, key) => {
    const fullKey = `${moduleId}.${key}`;
    if (_settingsStore.has(fullKey)) return _settingsStore.get(fullKey);
    if (_settingsDefaults.has(fullKey)) return _settingsDefaults.get(fullKey);
    return undefined;
  }),
  set: vi.fn(async (moduleId, key, value) => {
    _settingsStore.set(`${moduleId}.${key}`, value);
  }),
  register: vi.fn((moduleId, key, config) => {
    if (config?.default !== undefined) {
      _settingsDefaults.set(`${moduleId}.${key}`, config.default);
    }
  }),
};

// Expose internal stores for helper utilities
mockSettings._stores = { values: _settingsStore, defaults: _settingsDefaults };

// ---------------------------------------------------------------------------
// 2. game object (MOCK-01)
// ---------------------------------------------------------------------------

vi.stubGlobal('game', {
  settings: mockSettings,
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, _data) => key),
  },
  modules: new Map(),
  system: { id: 'dnd5e', version: '3.0.0' },
  user: { isGM: true, id: 'mock-user-id', name: 'Mock GM' },
  forge: null,
});

// ---------------------------------------------------------------------------
// 3. ui object (MOCK-02)
// ---------------------------------------------------------------------------

vi.stubGlobal('ui', {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
});

// ---------------------------------------------------------------------------
// 4. canvas object (MOCK-03)
// ---------------------------------------------------------------------------

vi.stubGlobal('canvas', {
  scene: { id: 'mock-scene-id', name: 'Mock Scene' },
  tokens: {
    placeables: [],
    controlled: [],
  },
  ready: true,
});

// ---------------------------------------------------------------------------
// 5. Hooks (MOCK-04)
// ---------------------------------------------------------------------------

vi.stubGlobal('Hooks', {
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  call: vi.fn(),
  callAll: vi.fn(),
});

// ---------------------------------------------------------------------------
// 6. foundry namespace (ApplicationV2, renderTemplate, loadTemplates)
// ---------------------------------------------------------------------------

vi.stubGlobal('foundry', {
  applications: {
    api: {
      ApplicationV2: class MockApplicationV2 {
        constructor(options = {}) {
          this.options = options;
        }
        static DEFAULT_OPTIONS = {};
        render() {
          return Promise.resolve(this);
        }
        close() {
          return Promise.resolve();
        }
        get rendered() {
          return false;
        }
        get element() {
          return document.createElement('div');
        }
      },
    },
    handlebars: {
      renderTemplate: vi.fn(async (_path, _data) => '<div>mock template</div>'),
      loadTemplates: vi.fn(async (_paths) => {}),
    },
  },
  utils: {
    mergeObject: vi.fn((original, other) => ({ ...original, ...other })),
  },
});

// ---------------------------------------------------------------------------
// 7. v12 global fallbacks
// ---------------------------------------------------------------------------

vi.stubGlobal('renderTemplate', vi.fn(async (_path, _data) => '<div>mock template</div>'));
vi.stubGlobal('loadTemplates', vi.fn(async (_paths) => {}));

// ---------------------------------------------------------------------------
// 8. FilePicker
// ---------------------------------------------------------------------------

vi.stubGlobal('FilePicker', {
  browse: vi.fn(async () => ({ files: [], dirs: [] })),
});

// ---------------------------------------------------------------------------
// 9. Dialog (used by UIManager for legacy dialog fallback)
// ---------------------------------------------------------------------------

vi.stubGlobal(
  'Dialog',
  class MockDialog {
    constructor(data, options) {
      this.data = data;
      this.options = options;
    }
    render(_force) {
      return this;
    }
    close() {
      return this;
    }
  }
);

// ---------------------------------------------------------------------------
// 10. MockWorker class (MOCK-05)
// ---------------------------------------------------------------------------

class MockWorker {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.postMessage = vi.fn();
    this.terminate = vi.fn();
    this._listeners = { message: [], error: [], messageerror: [] };
    this.addEventListener = vi.fn((type, handler) => {
      if (this._listeners[type]) this._listeners[type].push(handler);
    });
    this.removeEventListener = vi.fn((type, handler) => {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter((h) => h !== handler);
      }
    });
  }

  /** Simulate a message from the worker (async via microtask) */
  async _simulateMessage(data) {
    await Promise.resolve();
    const event = { data };
    if (this.onmessage) this.onmessage(event);
    for (const handler of this._listeners.message) handler(event);
  }

  /** Simulate a worker error (async via microtask) */
  async _simulateError(error) {
    await Promise.resolve();
    if (this.onerror) this.onerror(error);
    for (const handler of this._listeners.error) handler(error);
  }
}

vi.stubGlobal('Worker', MockWorker);

// ---------------------------------------------------------------------------
// 11. Export MockWorker for direct test usage
// ---------------------------------------------------------------------------

export { MockWorker };

// ---------------------------------------------------------------------------
// Pre-register module settings defaults
// ---------------------------------------------------------------------------

game.settings.register('token-replacer-fa', 'fuzzyThreshold', { default: 0.1 });
game.settings.register('token-replacer-fa', 'searchPriority', { default: 'both' });
game.settings.register('token-replacer-fa', 'autoReplace', { default: false });
game.settings.register('token-replacer-fa', 'confirmReplace', { default: true });
game.settings.register('token-replacer-fa', 'fallbackFullSearch', { default: false });
game.settings.register('token-replacer-fa', 'useTVACache', { default: true });
game.settings.register('token-replacer-fa', 'refreshTVACache', { default: false });
game.settings.register('token-replacer-fa', 'additionalPaths', { default: '' });
game.settings.register('token-replacer-fa', 'indexUpdateFrequency', { default: 'weekly' });
game.settings.register('token-replacer-fa', 'debugMode', { default: false });

// ---------------------------------------------------------------------------
// 12. beforeEach reset block
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Clear per-test settings values (NOT defaults -- defaults persist)
  _settingsStore.clear();

  // Reset game.modules to empty Map
  game.modules.clear();

  // Reset canvas token arrays
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
});
