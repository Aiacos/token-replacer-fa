/**
 * Token Replacer - Forgotten Adventures
 * Main entry point - orchestrates all modules
 * @version 2.0.0
 */

import { MODULE_ID } from './core/Constants.js';
import { loadFuse, yieldToMain } from './core/Utils.js';
import { TokenService } from './services/TokenService.js';
import { searchService } from './services/SearchService.js';
import { scanService } from './services/ScanService.js';
import { indexService } from './services/IndexService.js';
import { uiManager } from './ui/UIManager.js';

/**
 * Module configuration and state
 */
const TokenReplacerFA = {
  isProcessing: false,

  /**
   * Get localized string
   */
  i18n(key, data = {}) {
    let str = game.i18n.localize(`TOKEN_REPLACER_FA.${key}`);
    for (const [k, v] of Object.entries(data)) {
      str = str.replace(`{${k}}`, v);
    }
    return str;
  },

  /**
   * Get module setting
   */
  getSetting(key) {
    return game.settings.get(MODULE_ID, key);
  },

  /**
   * Check if Token Variant Art is available
   */
  get hasTVA() {
    return game.modules.get('token-variants')?.active ?? false;
  },

  /**
   * Check if FA Nexus is available
   */
  get hasFANexus() {
    return game.modules.get('fa-nexus')?.active ?? false;
  },

  /**
   * Get Token Variant Art API
   */
  get tvaAPI() {
    if (!this.hasTVA) return null;
    return game.modules.get('token-variants')?.api;
  }
};

/**
 * Register module settings
 */
function registerSettings() {
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
 */
async function replaceTokenImage(token, imagePath) {
  try {
    if (TokenReplacerFA.hasTVA && TokenReplacerFA.tvaAPI?.updateTokenImage) {
      await TokenReplacerFA.tvaAPI.updateTokenImage(imagePath, {
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
 * Main replacement process
 */
async function processTokenReplacement() {
  if (TokenReplacerFA.isProcessing) {
    ui.notifications.warn(TokenReplacerFA.i18n('notifications.inProgress'));
    return;
  }

  TokenReplacerFA.isProcessing = true;
  searchService.clearCache();

  // Load Fuse.js
  const Fuse = await loadFuse();
  if (!Fuse) {
    TokenReplacerFA.isProcessing = false;
    return;
  }

  // Check for active scene
  if (!canvas?.scene) {
    ui.notifications.warn(TokenReplacerFA.i18n('notifications.noScene'));
    TokenReplacerFA.isProcessing = false;
    return;
  }

  // Get NPC tokens
  const npcTokens = TokenService.getSceneNPCTokens();
  if (npcTokens.length === 0) {
    ui.notifications.info(TokenReplacerFA.i18n('notifications.noTokens'));
    TokenReplacerFA.isProcessing = false;
    return;
  }

  ui.notifications.info(TokenReplacerFA.i18n('notifications.started'));

  // Create main dialog
  const dialog = uiManager.createMainDialog(
    uiManager.createScanProgressHTML('Initializing...', 0, 0, 0, 0),
    () => { TokenReplacerFA.isProcessing = false; }
  );
  dialog.render(true);
  await yieldToMain(100);

  // Initialize search service
  searchService.init();

  // PHASE 1: Build token index
  const useTVACache = TokenReplacerFA.getSetting('useTVACache');
  const refreshTVACache = TokenReplacerFA.getSetting('refreshTVACache');
  let localIndex = [];

  if (TokenReplacerFA.hasTVA && useTVACache) {
    console.log(`${MODULE_ID} | Using TVA cache`);
    uiManager.updateDialogContent(uiManager.createTVACacheHTML(false));
    await yieldToMain(100);

    if (refreshTVACache && TokenReplacerFA.tvaAPI?.cacheImages) {
      uiManager.updateDialogContent(uiManager.createTVACacheHTML(true));
      await yieldToMain(50);
      try {
        await TokenReplacerFA.tvaAPI.cacheImages();
        console.log(`${MODULE_ID} | TVA cache refreshed`);
      } catch (e) {
        console.warn(`${MODULE_ID} | Failed to refresh TVA cache:`, e);
      }
      await yieldToMain(100);
    }
  } else {
    console.log(`${MODULE_ID} | Building local token index`);
    localIndex = await scanService.buildLocalTokenIndex();
  }

  // Check for search sources
  if (!TokenReplacerFA.hasTVA && localIndex.length === 0) {
    uiManager.updateDialogContent(
      uiManager.createErrorHTML(TokenReplacerFA.i18n('notifications.missingDeps'))
    );
    TokenReplacerFA.isProcessing = false;
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
  const autoReplace = TokenReplacerFA.getSetting('autoReplace');
  const confirmReplace = TokenReplacerFA.getSetting('confirmReplace');
  const threshold = TokenReplacerFA.getSetting('fuzzyThreshold');

  const updateProgress = (current, total, status, result = null) => {
    if (result) results.push(result);
    uiManager.updateDialogContent(uiManager.createProgressHTML(current, total, status, results));
  };

  updateProgress(0, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), null);
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

          const success = await replaceTokenImage(token, pathForToken);
          updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), {
            name: `${creatureInfo.actorName} (${token.name})`,
            status: success ? 'success' : 'failed',
            match: matchName
          });

          pathIndex++;
        }
      } else {
        for (const token of tokens) {
          tokenIndex++;
          updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.skipped'), {
            name: `${creatureInfo.actorName} (${token.name})`,
            status: 'skipped'
          });
        }
      }

      updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), null);
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

      updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), null);
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

        const success = await replaceTokenImage(token, pathForToken);
        updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), {
          name: `${creatureInfo.actorName} (${token.name})`,
          status: success ? 'success' : 'failed',
          match: matchName
        });

        pathIndex++;
      } else {
        updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.skipped'), {
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

    updateProgress(npcTokens.length, npcTokens.length, TokenReplacerFA.i18n('dialog.complete'), null);

    ui.notifications.info(TokenReplacerFA.i18n('notifications.complete', { count: successCount }));

    if (failedCount > 0) {
      console.log(`${MODULE_ID} | ${failedCount} tokens had no matching art found`);
    }
  }

  TokenReplacerFA.isProcessing = false;
}

/**
 * Module initialization
 */
Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing Token Replacer - Forgotten Adventures v2.6.0`);
  registerSettings();
});

Hooks.once('ready', async () => {
  console.log(`${MODULE_ID} | Module ready`);
  await loadFuse();
  console.log(`${MODULE_ID} | Token Variant Art available: ${TokenReplacerFA.hasTVA}`);
  console.log(`${MODULE_ID} | FA Nexus available: ${TokenReplacerFA.hasFANexus}`);

  // Build image index for fast searches (runs in background)
  if (TokenReplacerFA.hasTVA) {
    console.log(`${MODULE_ID} | Building image index in background...`);

    // Check if this will be a first-time build (no cache)
    const hasCache = localStorage.getItem('token-replacer-fa-index-cache');
    let notificationShown = false;

    // Progress callback for UI notifications during first-time build
    const onProgress = (current, total, images) => {
      const percent = Math.round((current / total) * 100);
      ui.notifications.info(
        TokenReplacerFA.i18n('notifications.indexing', { percent, images }) ||
        `Token Replacer FA: Building index... ${percent}% (${images} images)`,
        { permanent: false }
      );
    };

    // Show initial notification for first-time build
    if (!hasCache) {
      notificationShown = true;
      ui.notifications.info(
        TokenReplacerFA.i18n('notifications.indexingStart') ||
        'Token Replacer FA: First-time setup - building image index in background. This may take several minutes but only happens once.',
        { permanent: false }
      );
    }

    indexService.build(hasCache ? null : onProgress).then(success => {
      if (success) {
        const stats = indexService.getStats();
        console.log(`${MODULE_ID} | Image index ready: ${stats.imageCount} images, ${stats.keywordCount} keywords`);

        // Show completion notification if we showed the start notification
        if (notificationShown) {
          ui.notifications.info(
            TokenReplacerFA.i18n('notifications.indexingComplete', { count: stats.imageCount }) ||
            `Token Replacer FA: Index ready! ${stats.imageCount} images indexed.`,
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
        onChange: () => processTokenReplacement(),  // v13+ uses onChange
        onClick: () => processTokenReplacement()    // v12 fallback
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
      onChange: () => processTokenReplacement(),  // v13+ uses onChange
      onClick: () => processTokenReplacement()    // v12 fallback
    };
  }
});

// Export for debugging
window.TokenReplacerFA = TokenReplacerFA;
