/**
 * Token Replacer - Forgotten Adventures
 * Main entry point - orchestrates all modules
 * @module main
 * @version 2.10.0
 */

import { MODULE_ID } from './core/Constants.js';
import { loadFuse, yieldToMain } from './core/Utils.js';
import { TokenService } from './services/TokenService.js';
import { searchService } from './services/SearchService.js';
import { tvaCacheService } from './services/TVACacheService.js';
import { scanService } from './services/ScanService.js';
import { indexService } from './services/IndexService.js';
import { uiManager, logI18nCacheStats as logUIManagerI18nCacheStats } from './ui/UIManager.js';

/**
 * TokenReplacerApp class - Main application controller
 * Manages module state and orchestrates token replacement workflow
 */
export class TokenReplacerApp {
  constructor() {
    this.isProcessing = false;
    // i18n cache to avoid repeated localization lookups
    this.i18nCache = new Map();
    // Cache statistics for debugging
    this.i18nCacheStats = {
      hits: 0,
      misses: 0
    };
  }

  /**
   * Get localized string
   * Caches base strings to avoid repeated game.i18n.localize() calls
   * @param {string} key - Localization key (without namespace prefix)
   * @param {Object} data - Replacement data for placeholders
   * @returns {string} Localized string
   */
  i18n(key, data = {}) {
    // Check cache first
    let str = this.i18nCache.get(key);

    if (!str) {
      // Cache miss - localize and store
      str = game.i18n.localize(`TOKEN_REPLACER_FA.${key}`);
      this.i18nCache.set(key, str);
      this.i18nCacheStats.misses++;
    } else {
      // Cache hit
      this.i18nCacheStats.hits++;
    }

    // Apply placeholder replacements
    for (const [k, v] of Object.entries(data)) {
      str = str.replace(`{${k}}`, v);
    }
    return str;
  }

  /**
   * Log i18n cache statistics
   */
  logI18nCacheStats() {
    const total = this.i18nCacheStats.hits + this.i18nCacheStats.misses;
    const hitRate = total > 0 ? ((this.i18nCacheStats.hits / total) * 100).toFixed(1) : 0;
    console.log(`${MODULE_ID} | i18n cache stats: ${this.i18nCache.size} entries, ${this.i18nCacheStats.hits} hits, ${this.i18nCacheStats.misses} misses (${hitRate}% hit rate)`);
  }

  /**
   * Create structured error object with localized message
   * @param {string} errorType - Error type key (e.g., 'tva_missing', 'cache_load_failed')
   * @param {string} details - Technical error details
   * @param {Array<string>} recoverySuggestions - Array of recovery suggestion keys
   * @returns {Object} Structured error object
   */
  _createError(errorType, details, recoverySuggestions = []) {
    return {
      errorType,
      message: this.i18n(`errors.${errorType}`),
      details,
      recoverySuggestions: recoverySuggestions.map(key => this.i18n(`recovery.${key}`))
    };
  }

  /**
   * Log debug message if debug mode is enabled
   * @param {...any} args - Arguments to log
   */
  _debugLog(...args) {
    if (this.getSetting('debugMode')) {
      console.log(`${MODULE_ID} |`, ...args);
    }
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

    game.settings.register(MODULE_ID, 'debugMode', {
      name: 'TOKEN_REPLACER_FA.settings.debugMode.name',
      hint: 'TOKEN_REPLACER_FA.settings.debugMode.hint',
      scope: 'world',
      config: true,
      type: Boolean,
      default: false
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
    this._debugLog('Starting token replacement process');

    let dialog = null;

    try {
      searchService.clearCache();

      // Load Fuse.js
      this._debugLog('Loading Fuse.js library');
      const Fuse = await loadFuse();
      if (!Fuse) {
        const error = this._createError(
          'fuse_load_failed',
          'Fuse.js library failed to load',
          ['reload_module', 'check_network']
        );
        throw error;
      }
      this._debugLog('Fuse.js loaded successfully');

      // Check for active scene
      if (!canvas?.scene) {
        const error = this._createError(
          'no_tokens_selected',
          'No active scene found',
          ['check_console']
        );
        ui.notifications.warn(this.i18n('notifications.noScene'));
        throw error;
      }
      this._debugLog('Active scene found:', canvas.scene.name);

      // Get NPC tokens
      const npcTokens = TokenService.getSceneNPCTokens();
      if (npcTokens.length === 0) {
        ui.notifications.info(this.i18n('notifications.noTokens'));
        this._debugLog('No NPC tokens found on scene');
        return; // Not an error, just nothing to do
      }
      this._debugLog('Found', npcTokens.length, 'NPC tokens');

      ui.notifications.info(this.i18n('notifications.started'));

      // Create main dialog
      dialog = uiManager.createMainDialog(
        await uiManager.createScanProgressHTML('Initializing...', 0, 0, 0, 0),
        () => {
          this._debugLog('Dialog closed by user');
          this.isProcessing = false;
        }
      );
      dialog.render();
      this._debugLog('Dialog rendered, starting token index build');
      await yieldToMain(100);

      // Initialize search service (basic setup)
      this._debugLog('Initializing search service');
      searchService.init();

      // PHASE 1: Build token index
      const useTVACache = this.getSetting('useTVACache');
      const refreshTVACache = this.getSetting('refreshTVACache');
      let localIndex = [];

      if (this.hasTVA && useTVACache) {
        this._debugLog('Using TVA cache');
        uiManager.updateDialogContent(await uiManager.createTVACacheHTML(false));
        await yieldToMain(100);

        // If refresh requested, do it FIRST before loading our cache
        if (refreshTVACache && this.tvaAPI?.cacheImages) {
          this._debugLog('Refreshing TVA cache');
          uiManager.updateDialogContent(await uiManager.createTVACacheHTML(true));
          await yieldToMain(50);
          try {
            await this.tvaAPI.cacheImages();
            this._debugLog('TVA cache refreshed successfully');
          } catch (e) {
            console.warn(`${MODULE_ID} | Failed to refresh TVA cache:`, e);
            this._debugLog('TVA cache refresh failed, continuing with existing cache');
          }
          await yieldToMain(100);
        }

        // NOW load TVA cache directly (after any refresh is complete)
        uiManager.updateDialogContent(await uiManager.createTVACacheHTML(false, 'Loading TVA cache...'));
        this._debugLog('Loading TVA cache');
        const cacheLoaded = await tvaCacheService.loadTVACache();
        if (cacheLoaded) {
          const stats = tvaCacheService.getTVACacheStats();
          this._debugLog('TVA direct cache ready:', stats.totalImages, 'images');
        } else {
          console.warn(`${MODULE_ID} | Failed to load TVA cache directly, will use API fallback`);
          this._debugLog('TVA cache load failed, using API fallback');
        }
        await yieldToMain(100);
      } else {
        this._debugLog('Building local token index');
        localIndex = await scanService.buildLocalTokenIndex();
        this._debugLog('Local index built:', localIndex.length, 'images');
      }

      // Check for search sources
      if (!this.hasTVA && localIndex.length === 0) {
        const error = this._createError(
          'tva_missing',
          'No search sources available (TVA not active and local index empty)',
          ['install_tva']
        );
        const errorHTML = await uiManager.createErrorHTML(error);
        uiManager.updateDialogContent(errorHTML);
        throw error;
      }

      // Group tokens by creature type
      const creatureGroups = TokenService.groupTokensByCreature(npcTokens);
      const uniqueCreatures = creatureGroups.size;

      this._debugLog('Found', uniqueCreatures, 'unique creature types among', npcTokens.length, 'tokens');

      // PHASE 2: Parallel search
      this._debugLog('Starting parallel search for', uniqueCreatures, 'creature types');
      uiManager.updateDialogContent(
        await uiManager.createParallelSearchHTML(0, uniqueCreatures, uniqueCreatures, npcTokens.length, [])
      );
      await yieldToMain(50);

      const searchResults = await searchService.parallelSearchCreatures(creatureGroups, localIndex, async (info) => {
        if (info.type === 'batch' && uiManager.isDialogOpen()) {
          uiManager.updateDialogContent(
            await uiManager.createParallelSearchHTML(info.completed, info.total, uniqueCreatures, npcTokens.length, info.currentBatch)
          );
        }
      });

      this._debugLog('Parallel search completed, found matches for', searchResults.size, 'creature types');

      // PHASE 3: Process tokens
      this._debugLog('Starting token replacement phase');
      const results = [];
      const autoReplace = this.getSetting('autoReplace');
      const confirmReplace = this.getSetting('confirmReplace');
      const threshold = this.getSetting('fuzzyThreshold');
      this._debugLog('Settings: autoReplace =', autoReplace, ', confirmReplace =', confirmReplace, ', threshold =', threshold);

    const updateProgress = async (current, total, status, result = null) => {
      if (result) results.push(result);
      uiManager.updateDialogContent(await uiManager.createProgressHTML(current, total, status, results));
    };

    await updateProgress(0, npcTokens.length, this.i18n('dialog.replacing'), null);
    await yieldToMain(50);

    let tokenIndex = 0;
    let cancelled = false;

    for (const [key, data] of searchResults) {
      if (cancelled || !uiManager.isDialogOpen()) break;

      const { matches, tokens, creatureInfo } = data;

      // No matches - show category browser
      if (matches.length === 0) {
        uiManager.updateDialogContent(await uiManager.createNoMatchHTML(creatureInfo, tokens.length));
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
            await updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), {
              name: `${creatureInfo.actorName} (${token.name})`,
              status: success ? 'success' : 'failed',
              match: matchName
            });

            pathIndex++;
          }
        } else {
          for (const token of tokens) {
            tokenIndex++;
            await updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.skipped'), {
              name: `${creatureInfo.actorName} (${token.name})`,
              status: 'skipped'
            });
          }
        }

        await updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), null);
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
        uiManager.updateDialogContent(await uiManager.createMatchSelectionHTML(creatureInfo, matches, tokens.length));
        await yieldToMain(50);

        const dialogEl = uiManager.getDialogElement();
        if (dialogEl) {
          const selectionResult = await uiManager.setupMatchSelectionHandlers(dialogEl);

          if (selectionResult?.paths) {
            selectedPaths = selectionResult.paths;
            assignmentMode = selectionResult.mode || 'sequential';
          }
        }

        await updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), null);
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
          await updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.replacing'), {
            name: `${creatureInfo.actorName} (${token.name})`,
            status: success ? 'success' : 'failed',
            match: matchName
          });

          pathIndex++;
        } else {
          await updateProgress(tokenIndex, npcTokens.length, this.i18n('dialog.skipped'), {
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

        await updateProgress(npcTokens.length, npcTokens.length, this.i18n('dialog.complete'), null);

        ui.notifications.info(this.i18n('notifications.complete', { count: successCount }));

        if (failedCount > 0) {
          this._debugLog(`${failedCount} tokens had no matching art found`);
        }
      }

      this._debugLog('Token replacement process completed successfully');

    } catch (error) {
      // Handle errors gracefully with user-friendly messages
      console.error(`${MODULE_ID} | Error during token replacement:`, error);

      let errorDisplay;

      // Check if error is already a structured error object from services
      if (error.errorType && error.message && error.recoverySuggestions) {
        this._debugLog('Caught structured error:', error.errorType, error.details);
        errorDisplay = error;
      } else {
        // Create structured error for unexpected errors
        this._debugLog('Caught unexpected error:', error.message);

        // Determine error type based on error message patterns
        let errorType = 'unknown';
        let recoverySuggestions = ['check_console', 'reload_module', 'contact_support'];

        if (error.message?.includes('TVA') || error.message?.includes('token-variants')) {
          errorType = 'tva_missing';
          recoverySuggestions = ['install_tva', 'check_console'];
        } else if (error.message?.includes('cache')) {
          errorType = 'cache_load_failed';
          recoverySuggestions = ['rebuild_cache', 'reload_module'];
        } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
          errorType = 'network_error';
          recoverySuggestions = ['check_network', 'check_file_access'];
        } else if (error.message?.includes('Fuse')) {
          errorType = 'fuse_load_failed';
          recoverySuggestions = ['reload_module', 'check_network'];
        }

        errorDisplay = this._createError(
          errorType,
          error.stack || error.message || String(error),
          recoverySuggestions
        );
      }

      // Display error in dialog if it's open, otherwise use notification
      if (uiManager.isDialogOpen()) {
        const errorHTML = await uiManager.createErrorHTML(errorDisplay);
        uiManager.updateDialogContent(errorHTML);
        this._debugLog('Error displayed in dialog');
      } else {
        // Fallback to notification if dialog isn't available
        ui.notifications.error(
          this.i18n('notifications.processingError', { error: errorDisplay.message })
        );
        this._debugLog('Error displayed via notification');
      }

    } finally {
      // Always reset processing flag, even on errors
      this.isProcessing = false;
      this._debugLog('Token replacement process ended, isProcessing reset to false');
    }
  }
}

// Create singleton instance
export const tokenReplacerApp = new TokenReplacerApp();

// Backward compatibility - expose on window
window.TokenReplacerFA = tokenReplacerApp;

/**
 * Module initialization
 */
Hooks.once('init', async () => {
  console.log(`${MODULE_ID} | Initializing Token Replacer - Forgotten Adventures v2.10.0`);

  // Preload Handlebars templates
  await loadTemplates([
    'modules/token-replacer-fa/templates/error.hbs',
    'modules/token-replacer-fa/templates/tva-cache.hbs',
    'modules/token-replacer-fa/templates/scan-progress.hbs',
    'modules/token-replacer-fa/templates/search-progress.hbs',
    'modules/token-replacer-fa/templates/parallel-search.hbs',
    'modules/token-replacer-fa/templates/progress.hbs',
    'modules/token-replacer-fa/templates/match-selection.hbs',
    'modules/token-replacer-fa/templates/no-match.hbs'
  ]);

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

  // Log i18n cache statistics after initialization
  tokenReplacerApp.logI18nCacheStats();
  logUIManagerI18nCacheStats();
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
