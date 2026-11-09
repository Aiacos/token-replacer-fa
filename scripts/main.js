/**
 * Token Replacer - Forgotten Adventures
 * Entry point: builds the composition root from the service singletons and
 * forwards Foundry's hooks to it. Behaviour lives in scripts/app/.
 * @module main
 * @version 2.13.0
 */

import { MODULE_ID } from './core/Constants.js';
import { fuseLoader } from './core/FuseLoader.js';
import { templateRenderer } from './core/TemplateRenderer.js';
import { tokenService } from './services/TokenService.js';
import { searchService } from './services/SearchService.js';
import { searchOrchestrator } from './services/SearchOrchestrator.js';
import { tvaCacheService } from './services/TVACacheService.js';
import { scanService } from './services/ScanService.js';
import { indexService } from './services/IndexService.js';
import { storageService } from './services/StorageService.js';
import { uiManager } from './ui/UIManager.js';
import { TokenReplacerApp } from './app/TokenReplacerApp.js';

export { TokenReplacerApp };

export const tokenReplacerApp = new TokenReplacerApp({
  services: {
    fuseLoader,
    templateRenderer,
    tokenService,
    searchService,
    searchOrchestrator,
    tvaCacheService,
    scanService,
    indexService,
    storageService,
    uiManager,
  },
});

// Macro access. Not frozen: the instance owns live run state.
window.TokenReplacerFA = /** @type {any} */ (tokenReplacerApp);

Hooks.once('init', async () => {
  // This banner line is rewritten by sync-version.sh — keep its shape.
  console.log(`${MODULE_ID} | Initializing Token Replacer - Forgotten Adventures v2.13.0`);
  await tokenReplacerApp.initialize();
});

Hooks.once('ready', () => tokenReplacerApp.onReady());

// @ts-expect-error fvtt-types beta does not include getSceneControlButtons hook type
Hooks.on('getSceneControlButtons', (controls) => tokenReplacerApp.addSceneControlButton(controls));

// Prevents dangling Worker references after the page goes away
window.addEventListener('beforeunload', () => tokenReplacerApp.terminate());
