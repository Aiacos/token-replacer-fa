/**
 * Token Replacer - Forgotten Adventures
 * Main entry point - orchestrates all modules
 * @module main
 * @version 2.9.0
 */

import { MODULE_ID } from './core/Constants.js';
import { loadFuse, yieldToMain } from './core/Utils.js';
import { TokenService } from './services/TokenService.js';
import { searchService } from './services/SearchService.js';
import { tvaCacheService } from './services/TVACacheService.js';
import { scanService } from './services/ScanService.js';
import { indexService } from './services/IndexService.js';
import { uiManager } from './ui/UIManager.js';

/**
 * TokenReplacerApp class - Main application controller
 * Manages module state and orchestrates token replacement workflow
 */
export class TokenReplacerApp {
  constructor() {
    this.isProcessing = false;
  }

  /**
   * Get localized string
   * @param {string} key - Localization key (without namespace prefix)
   * @param {Object} data - Replacement data for placeholders
   * @returns {string} Localized string
   */
  i18n(key, data = {}) {
    let str = game.i18n.localize(`TOKEN_REPLACER_FA.${key}`);
    for (const [k, v] of Object.entries(data)) {
      str = str.replace(`{${k}}`, v);
    }
    return str;
  }

  /**
   * Get module setting
   * @param {string} key - Setting key
   * @returns {*} Setting value
   */
  getSetting(key) {
    return game.settings.get(MODULE_ID, key);
  }

  /**
   * Check if Token Variant Art is available
   * @returns {boolean} True if TVA is active
   */
  get hasTVA() {
    return game.modules.get('token-variants')?.active ?? false;
  }

  /**
   * Check if FA Nexus is available
   * @returns {boolean} True if FA Nexus is active
   */
  get hasFANexus() {
    return game.modules.get('fa-nexus')?.active ?? false;
  }

  /**
   * Get Token Variant Art API
   * @returns {Object|null} TVA API or null if unavailable
   */
  get tvaAPI() {
    if (!this.hasTVA) return null;
    return game.modules.get('token-variants')?.api;
  }

  /**
   * Register module settings
   */
  registerSettings() {
    game.settings.register(MODULE_ID, 'fuzzyThreshold', {
      name: 'TOKEN_REPLACER_FA.settings.fuzzyThreshold.name',
      hint: 'TOKEN_REPLACER_FA.settings.fuzzyThreshold.hint',
      scope: 'world',
      config: true,
      type: Number,
      range: { min: 0, max: 1, step: 0.1 },
      default: 0.1
    });

    game.settings.register(MODULE_ID, 'searchPriority', {
      name: 'TOKEN_REPLACER_FA.settings.searchPriority.name',
      hint: 'TOKEN_REPLACER_FA.settings.searchPriority.hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        faNexus: 'TOKEN_REPLACER_FA.priority.faNexus',
        forgeBazaar: 'TOKEN_REPLACER_FA.priority.forgeBazaar',
        both: 'TOKEN_REPLACER_FA.priority.both'
      },
      default: 'both'
    });

    game.settings.register(MODULE_ID, 'autoReplace', {
      name: 'TOKEN_REPLACER_FA.settings.autoReplace.name',
      hint: 'TOKEN_REPLACER_FA.settings.autoReplace.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register(MODULE_ID, 'confirmReplace', {
      name: 'TOKEN_REPLACER_FA.settings.confirmReplace.name',
      hint: 'TOKEN_REPLACER_FA.settings.confirmReplace.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, 'fallbackFullSearch', {
      name: 'TOKEN_REPLACER_FA.settings.fallbackFullSearch.name',
      hint: 'TOKEN_REPLACER_FA.settings.fallbackFullSearch.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register(MODULE_ID, 'additionalPaths', {
      name: 'TOKEN_REPLACER_FA.settings.additionalPaths.name',
      hint: 'TOKEN_REPLACER_FA.settings.additionalPaths.hint',
      scope: 'world',
      config: true,
      type: String,
      default: ''
    });

    game.settings.register(MODULE_ID, 'useTVACache', {
      name: 'TOKEN_REPLACER_FA.settings.useTVACache.name',
      hint: 'TOKEN_REPLACER_FA.settings.useTVACache.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, 'refreshTVACache', {
      name: 'TOKEN_REPLACER_FA.settings.refreshTVACache.name',
      hint: 'TOKEN_REPLACER_FA.settings.refreshTVACache.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
    });

    game.settings.register(MODULE_ID, 'indexUpdateFrequency', {
      name: 'TOKEN_REPLACER_FA.settings.indexUpdateFrequency.name',
      hint: 'TOKEN_REPLACER_FA.settings.indexUpdateFrequency.hint',
      scope: 'world',
      config: true,
      type: String,
      choices: {
        daily: 'TOKEN_REPLACER_FA.frequency.daily',
        weekly: 'TOKEN_REPLACER_FA.frequency.weekly',
        monthly: 'TOKEN_REPLACER_FA.frequency.monthly',
        quarterly: 'TOKEN_REPLACER_FA.frequency.quarterly'
      },
      default: 'weekly'
    });
  }

  /**
   * Replace token image using TVA or direct update
   * @param {Token} token - Foundry token to update
   * @param {string} imagePath - Path to new token image
   * @returns {Promise<boolean>} True if replacement succeeded
   */
  async replaceTokenImage(token, imagePath) {
    try {
      if (this.hasTVA && this.tvaAPI?.updateTokenImage) {
        await this.tvaAPI.updateTokenImage(imagePath, {
          token: token,
          actor: token.actor,
          imgName: imagePath.split('/').pop()
        });
        return true;
      }
      return await TokenService.replaceTokenImage(token, imagePath);
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to update token:`, error);
      return false;
    }
  }

  /**
   * Main replacement process - orchestrates the entire token replacement workflow
   */
  async processTokenReplacement() {
    if (this.isProcessing) {
      ui.notifications.warn(this.i18n('notifications.inProgress'));
      return;
    }

    this.isProcessing = true;
    searchService.clearCache();

    // Load Fuse.js
    const Fuse = await loadFuse();
    if (!Fuse) {
      this.isProcessing = false;
      return;
    }

    // Check for active scene
    if (!canvas?.scene) {
      ui.notifications.warn(this.i18n('notifications.noScene'));
      this.isProcessing = false;
      return;
    }

    // Get NPC tokens
    const npcTokens = TokenService.getSceneNPCTokens();
    if (npcTokens.length === 0) {
      ui.notifications.info(this.i18n('notifications.noTokens'));
      this.isProcessing = false;
      return;
    }

    ui.notifications.info(this.i18n('notifications.started'));

    // Create main dialog
    const dialog = uiManager.createMainDialog(
      uiManager.createScanProgressHTML('Initializing...', 0, 0, 0, 0),
      () => { this.isProcessing = false; }
    );
    dialog.render(true);
    await yieldToMain(100);

    // Initialize search service (basic setup)
    searchService.init();

    // PHASE 1: Build token index
    const useTVACache = this.getSetting('useTVACache');
    const refreshTVACache = this.getSetting('refreshTVACache');
    let localIndex = [];

    if (this.hasTVA && useTVACache) {
      console.log(`${MODULE_ID} | Using TVA cache`);
      uiManager.updateDialogContent(uiManager.createTVACacheHTML(false));
      await yieldToMain(100);

      // If refresh requested, do it FIRST before loading our cache
      if (refreshTVACache && this.tvaAPI?.cacheImages) {
        uiManager.updateDialogContent(uiManager.createTVACacheHTML(true));
        await yieldToMain(50);
        try {
          await this.tvaAPI.cacheImages();
          console.log(`${MODULE_ID} | TVA cache refreshed`);
        } catch (e) {
          console.warn(`${MODULE_ID} | Failed to refresh TVA cache:`, e);
        }
        await yieldToMain(100);
      }

      // NOW load TVA cache directly (after any refresh is complete)
      uiManager.updateDialogContent(uiManager.createTVACacheHTML(false, 'Loading TVA cache...'));
      const cacheLoaded = await tvaCacheService.loadTVACache();
      if (cacheLoaded) {
        const stats = tvaCacheService.getTVACacheStats();
        console.log(`${MODULE_ID} | TVA direct cache ready: ${stats.totalImages} images`);
      } else {
        console.warn(`${MODULE_ID} | Failed to load TVA cache directly, will use API fallback`);
      }
      await yieldToMain(100);
    } else {
      console.log(`${MODULE_ID} | Building local token index`);
      localIndex = await scanService.buildLocalTokenIndex();
    }

    // Check for search sources
    if (!this.hasTVA && localIndex.length === 0) {
      uiManager.updateDialogContent(
        uiManager.createErrorHTML(this.i18n('notifications.missingDeps'))
      );
      this.isProcessing = false;
      return;
    }

    // Group tokens by creature type
    const creatureGroups = TokenService.groupTokensByCreature(npcTokens);
    const uniqueCreatures = creatureGroups.size;

    console.log(`${MODULE_ID} | Found ${uniqueCreatures} unique creature types among ${npcTokens.length} tokens`);

    // PHASE 2: Parallel search
    uiManager.updateDialogContent(
      uiManager.createParallelSearchHTML(0, uniqueCreatures, uniqueCreatures, npcTokens.length, [])
    );
    await yieldToMain(50);

    const searchResults = await searchService.parallelSearchCreatures(creatureGroups, localIndex, (info) => {
      if (info.type === 'batch' && uiManager.isDialogOpen()) {
        uiManager.updateDialogContent(
          uiManager.createParallelSearchHTML(info.completed, info.total, uniqueCreatures, npcTokens.length, info.currentBatch)
        );
      }
    });

    // PHASE 3: Process tokens
    const results = [];
    const autoReplace = this.getSetting('autoReplace');
    const confirmReplace = this.getSetting('confirmReplace');
    const threshold = this.getSetting('fuzzyThreshold');

    const updateProgress = (current, total, status, result = null) => {
      if (result) results.push(result);
      uiManager.updateDialogContent(uiManager.createProgressHTML(current, total, status, results));
    };

    updateProgress(0, npcTokens.length, this.i18n('dialog.replacing'), null);
    await yieldToMain(50);

    let tokenIndex = 0;
    let cancelled = false;

    for (const [key, data] of searchResults) {
      if (cancelled || !uiManager.isDialogOpen()) break;

      const { matches, tokens, creatureInfo } = data;

      // No matches - show category browser
      if (matches.length === 0) {
        uiManager.updateDialogContent(uiManager.createNoMatchHTML(creatureInfo, tokens.length));
        await yieldToMain(50);

        const dialogEl = uiManager.getDialogElement();
        let selectionResult = null;

        if (dialogEl) {
          selectionResult = await uiManager.setupNoMatchHandlers(
            dialogEl, creatureInfo, localIndex, tokens.length,
            (type, idx, term, cb) => searchService.searchByCategory(type, idx, term, cb)
          );
        }

        if (selectionResult?.paths?.length > 0) {
          const selectedPaths = selectionResult.paths;
          const assignmentMode = selectionResult.mode || 'sequential';
          let pathIndex = 0;

          const shuffledPaths = assignmentMode === 'random'
            ? [...selectedPaths].sort(() => Math.random() - 0.5)
            : selectedPaths;

          for (const token of tokens) {
            if (cancelled || !uiManager.isDialogOpen()) break;
            tokenIndex++;

            const pathForToken = shuffledPaths[pathIndex % shuffledPaths.length];
            const matchName = pathForToken.split('/').pop().replace(/\.[^/.]+$/, '');

            const success = await this.replaceTokenImage(token, pathForToken);
            updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), {
              name: `${creatureInfo.actorName} (${token.name})`,
              status: success ? 'success' : 'failed',
              match: matchName
            });

            pathIndex++;
          }
        } else {
          for (const token of tokens) {
            tokenIndex++;
            updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.skipped'), {
              name: `${creatureInfo.actorName} (${token.name})`,
              status: 'skipped'
            });
          }
        }

        updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), null);
        await yieldToMain(50);
        continue;
      }

      // Has matches
      const bestMatch = matches[0];
      const matchScore = bestMatch.score !== undefined ? (1 - bestMatch.score) : 0.8;

      let selectedPaths = null;
      let assignmentMode = 'sequential';

      if (autoReplace && matchScore >= (1 - threshold)) {
        selectedPaths = [bestMatch.path];
      } else if (confirmReplace) {
        uiManager.updateDialogContent(uiManager.createMatchSelectionHTML(creatureInfo, matches, tokens.length));
        await yieldToMain(50);

        const dialogEl = uiManager.getDialogElement();
        if (dialogEl) {
          const selectionResult = await uiManager.setupMatchSelectionHandlers(dialogEl);

          if (selectionResult?.paths) {
            selectedPaths = selectionResult.paths;
            assignmentMode = selectionResult.mode || 'sequential';
          }
        }

        updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), null);
        await yieldToMain(50);
      } else {
        selectedPaths = [bestMatch.path];
      }

      // Apply selected paths
      let pathIndex = 0;
      const shuffledPaths = assignmentMode === 'random' && selectedPaths
        ? [...selectedPaths].sort(() => Math.random() - 0.5)
        : selectedPaths;

      for (const token of tokens) {
        if (cancelled || !uiManager.isDialogOpen()) break;

        tokenIndex++;

        if (shuffledPaths?.length > 0) {
          const pathForToken = shuffledPaths[pathIndex % shuffledPaths.length];
          const matchName = pathForToken.split('/').pop().replace(/\.[^/.]+$/, '');

          const success = await this.replaceTokenImage(token, pathForToken);
          updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), {
            name: `${creatureInfo.actorName} (${token.name})`,
            status: success ? 'success' : 'failed',
            match: matchName
          });

          pathIndex++;
        } else {
          updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.skipped'), {
            name: `${creatureInfo.actorName} (${token.name})`,
            status: 'skipped'
          });
        }
      }
    }

    // Final update
    if (!cancelled && uiManager.isDialogOpen()) {
      const successCount = results.filter(r => r.status === 'success').length;
      const failedCount = results.filter(r => r.status === 'failed').length;

      updateProgress(npcTokens.length, npcTokens.length, this.i18n('dialog.complete'), null);

      ui.notifications.info(this.i18n('notifications.complete', { count: successCount }));

      if (failedCount > 0) {
        console.log(`${MODULE_ID} | ${failedCount} tokens had no matching art found`);
      }
    }

    this.isProcessing = false;
  }
}

// Create singleton instance
export const tokenReplacerApp = new TokenReplacerApp();

// Backward compatibility - expose on window
window.TokenReplacerFA = tokenReplacerApp;

/**
 * Module initialization
 */
Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing Token Replacer - Forgotten Adventures v2.9.0`);
  tokenReplacerApp.registerSettings();
});

Hooks.once('ready', async () => {
  console.log(`${MODULE_ID} | Module ready`);
  await loadFuse();
  console.log(`${MODULE_ID} | Token Variant Art available: ${tokenReplacerApp.hasTVA}`);
  console.log(`${MODULE_ID} | FA Nexus available: ${tokenReplacerApp.hasFANexus}`);

  // Initialize search service and load TVA cache FIRST
  if (tokenReplacerApp.hasTVA) {
    searchService.init();
    console.log(`${MODULE_ID} | Loading TVA cache directly...`);
    const cacheLoaded = await tvaCacheService.loadTVACache();
    if (cacheLoaded) {
      const stats = tvaCacheService.getTVACacheStats();
      console.log(`${MODULE_ID} | TVA direct cache ready: ${stats.totalImages} images in ${stats.categories} categories`);
    } else {
      console.warn(`${MODULE_ID} | Failed to load TVA cache directly, will use fallback methods`);
    }
  }

  // Build image index for fast searches (runs in background)
  if (tokenReplacerApp.hasTVA) {
    console.log(`${MODULE_ID} | Building image index in background...`);

    // Check if this will be a first-time build (no cache)
    const hasCache = localStorage.getItem('token-replacer-fa-index-v3');
    let notificationShown = false;

    // Progress callback for UI notifications during first-time build
    const onProgress = (current, total, images) => {
      const percent = Math.round((current / total) * 100);
      ui.notifications.info(
        tokenReplacerApp.i18n('notifications.indexing', { percent, images }) ||
        `Token Replacer FA: Building index... ${percent}% (${images} images)`,
        { permanent: false }
      );
    };

    // Show initial notification for first-time build
    if (!hasCache) {
      notificationShown = true;
      ui.notifications.info(
        tokenReplacerApp.i18n('notifications.indexingStart') ||
        'Token Replacer FA: First-time setup - building image index in background. This may take several minutes but only happens once.',
        { permanent: false }
      );
    }

    // Pass pre-loaded TVA cache to indexService for fast indexing
    const tvaCacheImages = tvaCacheService.isTVACacheLoaded ? tvaCacheService.tvaCacheImages : null;
    indexService.build(false, hasCache ? null : onProgress, tvaCacheImages).then(success => {
      if (success) {
        const stats = indexService.getStats();
        console.log(`${MODULE_ID} | Image index ready: ${stats.totalImages} images`);

        // Show completion notification if we showed the start notification
        if (notificationShown) {
          ui.notifications.info(
            tokenReplacerApp.i18n('notifications.indexingComplete', { count: stats.totalImages }) ||
            `Token Replacer FA: Index ready! ${stats.totalImages} images indexed.`,
            { permanent: false }
          );
        }
      } else {
        console.log(`${MODULE_ID} | Index build failed, will use direct API calls`);
      }
    }).catch(err => {
      console.warn(`${MODULE_ID} | Index build error:`, err);
    });
  }
});

/**
 * Add button to scene controls
 */
Hooks.on('getSceneControlButtons', (controls) => {
  if (!game.user.isGM) return;

  // Handle both v12 (array) and v13 (object) formats
  if (Array.isArray(controls)) {
    const tokenControls = controls.find(c => c.name === 'token');
    if (tokenControls) {
      tokenControls.tools.push({
        name: 'tokenReplacerFA',
        title: game.i18n.localize('TOKEN_REPLACER_FA.button.title'),
        icon: 'fas fa-wand-magic-sparkles',
        button: true,
        visible: true,
        onChange: () => tokenReplacerApp.processTokenReplacement(),  // v13+ uses onChange
        onClick: () => tokenReplacerApp.processTokenReplacement()    // v12 fallback
      });
    }
  } else {
    const tokenControls = controls.tokens;
    if (!tokenControls) return;

    const toolCount = Object.keys(tokenControls.tools || {}).length;
    tokenControls.tools.tokenReplacerFA = {
      name: 'tokenReplacerFA',
      title: game.i18n.localize('TOKEN_REPLACER_FA.button.title'),
      icon: 'fas fa-wand-magic-sparkles',
      order: toolCount + 1,
      button: true,
      visible: true,
      onChange: () => tokenReplacerApp.processTokenReplacement(),  // v13+ uses onChange
      onClick: () => tokenReplacerApp.processTokenReplacement()    // v12 fallback
    };
  }
});
