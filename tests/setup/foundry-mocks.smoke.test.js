/**
 * Smoke tests for Foundry VTT mock infrastructure
 *
 * Validates that all global stubs are in place and that importing
 * module files with import-time side effects does not throw ReferenceError.
 *
 * @module tests/setup/foundry-mocks.smoke.test
 */

import { describe, it, expect } from 'vitest';

describe('Foundry Mock Infrastructure', () => {
  describe('Global stubs exist', () => {
    it('game object is defined with settings, modules, i18n, system', () => {
      expect(game).toBeDefined();
      expect(game.settings).toBeDefined();
      expect(game.modules).toBeInstanceOf(Map);
      expect(game.i18n.localize).toBeTypeOf('function');
      expect(game.system.id).toBe('dnd5e');
    });

    it('ui object is defined with notification methods', () => {
      expect(ui).toBeDefined();
      expect(ui.notifications.info).toBeTypeOf('function');
      expect(ui.notifications.warn).toBeTypeOf('function');
      expect(ui.notifications.error).toBeTypeOf('function');
    });

    it('canvas object is defined with tokens and scene', () => {
      expect(canvas).toBeDefined();
      expect(canvas.tokens.placeables).toBeInstanceOf(Array);
      expect(canvas.tokens.controlled).toBeInstanceOf(Array);
      expect(canvas.scene).toBeDefined();
    });

    it('Hooks object is defined with registration methods', () => {
      expect(Hooks).toBeDefined();
      expect(Hooks.on).toBeTypeOf('function');
      expect(Hooks.once).toBeTypeOf('function');
      expect(Hooks.off).toBeTypeOf('function');
      expect(Hooks.call).toBeTypeOf('function');
      expect(Hooks.callAll).toBeTypeOf('function');
    });

    it('Worker constructor returns MockWorker with postMessage spy', () => {
      const worker = new Worker('test-url.js');
      expect(worker).toBeDefined();
      expect(worker.url).toBe('test-url.js');
      expect(worker.postMessage).toBeTypeOf('function');
      expect(worker.terminate).toBeTypeOf('function');
    });

    it('foundry.applications.api.ApplicationV2 is a class that can be extended', () => {
      class TestApp extends foundry.applications.api.ApplicationV2 {
        constructor() {
          super({ title: 'Test' });
        }
      }
      const app = new TestApp();
      expect(app).toBeDefined();
      expect(app.options.title).toBe('Test');
    });

    it('renderTemplate and loadTemplates are defined', () => {
      expect(renderTemplate).toBeTypeOf('function');
      expect(loadTemplates).toBeTypeOf('function');
    });

    it('FilePicker is defined with browse method', () => {
      expect(FilePicker).toBeDefined();
      expect(FilePicker.browse).toBeTypeOf('function');
    });
  });

  describe('Settings round-trip', () => {
    it('game.settings.get returns registered default', () => {
      const value = game.settings.get('token-replacer-fa', 'debugMode');
      expect(value).toBe(false);
    });

    it('game.settings.get returns registered fuzzyThreshold default', () => {
      const value = game.settings.get('token-replacer-fa', 'fuzzyThreshold');
      expect(value).toBe(0.1);
    });

    it('game.settings.set overrides default', async () => {
      await game.settings.set('token-replacer-fa', 'debugMode', true);
      expect(game.settings.get('token-replacer-fa', 'debugMode')).toBe(true);
    });

    it('settings store resets between tests (debugMode back to false)', () => {
      // This test MUST run after the one above -- relies on beforeEach reset
      const value = game.settings.get('token-replacer-fa', 'debugMode');
      expect(value).toBe(false);
    });

    it('game.settings.get returns undefined for unregistered keys', () => {
      const value = game.settings.get('token-replacer-fa', 'nonexistent');
      expect(value).toBeUndefined();
    });
  });

  describe('Module imports without ReferenceError', () => {
    it('can import Constants.js', async () => {
      const mod = await import('../../scripts/core/Constants.js');
      expect(mod.MODULE_ID).toBe('token-replacer-fa');
    });

    it('can import Utils.js', async () => {
      const mod = await import('../../scripts/core/Utils.js');
      expect(mod.escapeHtml).toBeTypeOf('function');
      expect(mod.createDebugLogger).toBeTypeOf('function');
    });

    it('can import IndexService.js (eager Worker creation)', async () => {
      const mod = await import('../../scripts/services/IndexService.js');
      expect(mod.IndexService).toBeTypeOf('function');
      expect(mod.indexService).toBeDefined();
    });

    it('can import SearchService.js', async () => {
      const mod = await import('../../scripts/services/SearchService.js');
      expect(mod.searchService).toBeDefined();
    });

    it('can import TVACacheService.js', async () => {
      const mod = await import('../../scripts/services/TVACacheService.js');
      expect(mod.tvaCacheService).toBeDefined();
    });

    it('can import StorageService.js', async () => {
      const mod = await import('../../scripts/services/StorageService.js');
      expect(mod.storageService).toBeDefined();
    });

    it('can import TokenService.js', async () => {
      const mod = await import('../../scripts/services/TokenService.js');
      expect(mod.TokenService).toBeTypeOf('function');
    });

    it('can import ScanService.js', async () => {
      const mod = await import('../../scripts/services/ScanService.js');
      expect(mod.scanService).toBeDefined();
    });
  });

  describe('MockWorker behavior', () => {
    it('_simulateMessage triggers onmessage handler', async () => {
      const worker = new Worker('test.js');
      const received = [];
      worker.onmessage = (event) => received.push(event.data);
      await worker._simulateMessage({ type: 'done', result: 42 });
      expect(received).toEqual([{ type: 'done', result: 42 }]);
    });

    it('_simulateMessage triggers addEventListener handlers', async () => {
      const worker = new Worker('test.js');
      const received = [];
      worker.addEventListener('message', (event) => received.push(event.data));
      await worker._simulateMessage('hello');
      expect(received).toEqual(['hello']);
    });

    it('_simulateError triggers onerror handler', async () => {
      const worker = new Worker('test.js');
      const errors = [];
      worker.onerror = (err) => errors.push(err);
      const testError = new Error('worker crashed');
      await worker._simulateError(testError);
      expect(errors).toEqual([testError]);
    });

    it('postMessage is a spy that records calls', () => {
      const worker = new Worker('test.js');
      worker.postMessage({ cmd: 'indexPaths', paths: [] });
      expect(worker.postMessage).toHaveBeenCalledWith({ cmd: 'indexPaths', paths: [] });
    });

    it('terminate is a spy', () => {
      const worker = new Worker('test.js');
      worker.terminate();
      expect(worker.terminate).toHaveBeenCalled();
    });
  });

  describe('beforeEach reset', () => {
    it('notification spies are cleared between tests', () => {
      ui.notifications.info('test message');
      expect(ui.notifications.info).toHaveBeenCalledTimes(1);
    });

    it('notification spy call count is fresh (previous test call cleared)', () => {
      // beforeEach should have cleared the spy from the previous test
      expect(ui.notifications.info).toHaveBeenCalledTimes(0);
    });
  });
});
