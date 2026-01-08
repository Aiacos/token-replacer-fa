/**
 * Token Replacer - Forgotten Adventures
 * Automatically replaces NPC token art with matching tokens from
 * Forgotten Adventures and The Forge Bazaar using fuzzy search.
 */

const MODULE_ID = 'token-replacer-fa';

// Fuse.js CDN URL for fuzzy search
const FUSE_CDN = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.mjs';

/**
 * Module configuration and state
 */
const TokenReplacerFA = {
  Fuse: null,
  tokenArtCache: null,
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
 * Load Fuse.js dynamically
 */
async function loadFuse() {
  if (TokenReplacerFA.Fuse) return TokenReplacerFA.Fuse;

  try {
    const module = await import(FUSE_CDN);
    TokenReplacerFA.Fuse = module.default;
    console.log(`${MODULE_ID} | Fuse.js loaded successfully`);
    return TokenReplacerFA.Fuse;
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to load Fuse.js:`, error);
    ui.notifications.error('Failed to load fuzzy search library');
    return null;
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Register module settings
 * Note: Using string keys - Foundry handles localization via lang files
 */
function registerSettings() {
  game.settings.register(MODULE_ID, 'fuzzyThreshold', {
    name: 'TOKEN_REPLACER_FA.settings.fuzzyThreshold.name',
    hint: 'TOKEN_REPLACER_FA.settings.fuzzyThreshold.hint',
    scope: 'world',
    config: true,
    type: Number,
    range: {
      min: 0,
      max: 1,
      step: 0.1
    },
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

  // Additional search paths (user configurable)
  game.settings.register(MODULE_ID, 'additionalPaths', {
    name: 'TOKEN_REPLACER_FA.settings.additionalPaths.name',
    hint: 'TOKEN_REPLACER_FA.settings.additionalPaths.hint',
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  // Hidden setting to cache discovered FA Nexus paths
  game.settings.register(MODULE_ID, 'faNexusPaths', {
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });
}

/**
 * Extract creature information from a token
 */
function extractCreatureInfo(token) {
  const actor = token.actor;
  if (!actor) return null;

  const info = {
    tokenId: token.id,
    tokenName: token.name,
    actorName: actor.name,
    actorId: actor.id,
    currentImage: token.document?.texture?.src || token.texture?.src,
    type: null,
    subtype: null,
    race: null,
    searchTerms: []
  };

  // Get creature type from dnd5e system
  if (actor.system?.details?.type) {
    const typeData = actor.system.details.type;
    info.type = typeData.value || null;
    info.subtype = typeData.subtype || null;
    info.custom = typeData.custom || null;
  }

  // Get race if available (for some actors)
  if (actor.system?.details?.race) {
    const race = actor.system.details.race;
    info.race = typeof race === 'string' ? race : race?.name || null;
  }

  // Build search terms array (prioritized)
  const terms = [];

  // Primary: Actor name (most specific)
  if (info.actorName) {
    terms.push(info.actorName.toLowerCase());
  }

  // Secondary: Token name if different from actor
  if (info.tokenName && info.tokenName.toLowerCase() !== info.actorName?.toLowerCase()) {
    terms.push(info.tokenName.toLowerCase());
  }

  // Tertiary: Creature type + subtype
  if (info.type) {
    terms.push(info.type.toLowerCase());
    if (info.subtype) {
      terms.push(`${info.type} ${info.subtype}`.toLowerCase());
      terms.push(info.subtype.toLowerCase());
    }
  }

  // Custom type if available
  if (info.custom) {
    terms.push(info.custom.toLowerCase());
  }

  // Race if available
  if (info.race) {
    terms.push(info.race.toLowerCase());
  }

  info.searchTerms = [...new Set(terms)]; // Remove duplicates

  return info;
}

/**
 * Get all NPC tokens on the current scene
 */
function getSceneNPCTokens() {
  if (!canvas?.tokens?.placeables) {
    return [];
  }

  return canvas.tokens.placeables.filter(token => {
    const actor = token.actor;
    if (!actor) return false;

    // Check if it's an NPC type actor
    return actor.type === 'npc';
  });
}

/**
 * Discover token art paths (FA Nexus and other sources)
 */
async function discoverTokenPaths() {
  const paths = [];

  // Common FA Nexus paths to check
  const possiblePaths = [
    'modules/fa-nexus/tokens',
    'modules/fa-nexus/assets/tokens',
    'modules/fa-nexus/assets',
    'modules/FA-Nexus/tokens',
    'modules/forgotten-adventures/tokens',
    'tokens',
    'assets/tokens',
    'Token'
  ];

  for (const path of possiblePaths) {
    try {
      const result = await FilePicker.browse('data', path);
      if (result?.files?.length > 0 || result?.dirs?.length > 0) {
        paths.push(path);
        console.log(`${MODULE_ID} | Found token path: ${path}`);
      }
    } catch (e) {
      // Path doesn't exist, skip
    }
  }

  // Check user data folder for FA content or token folders
  try {
    const rootResult = await FilePicker.browse('data', '.');
    if (rootResult?.dirs) {
      for (const dir of rootResult.dirs) {
        const dirLower = dir.toLowerCase();
        if (dirLower.includes('forgotten') ||
            dirLower.includes('fa-') ||
            dirLower.includes('token') ||
            dirLower.includes('assets')) {
          if (!paths.includes(dir)) {
            paths.push(dir);
            console.log(`${MODULE_ID} | Found user data path: ${dir}`);
          }
        }
      }
    }
  } catch (e) {
    // Cannot browse root
  }

  // Add user-configured additional paths
  try {
    const additionalPathsSetting = game.settings.get(MODULE_ID, 'additionalPaths');
    if (additionalPathsSetting) {
      const additionalPaths = additionalPathsSetting.split(',').map(p => p.trim()).filter(p => p);
      for (const path of additionalPaths) {
        try {
          const result = await FilePicker.browse('data', path);
          if (result?.files?.length > 0 || result?.dirs?.length > 0) {
            if (!paths.includes(path)) {
              paths.push(path);
              console.log(`${MODULE_ID} | Found additional path: ${path}`);
            }
          }
        } catch (e) {
          console.warn(`${MODULE_ID} | Additional path not accessible: ${path}`);
        }
      }
    }
  } catch (e) {
    // Setting not available yet
  }

  return paths;
}

/**
 * Recursively scan directory for image files with progress reporting
 */
async function scanDirectoryForImages(path, depth = 0, maxDepth = 5, progressCallback = null) {
  if (depth > maxDepth) return [];

  const images = [];
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

  try {
    const result = await FilePicker.browse('data', path);

    // Report current directory being scanned
    if (progressCallback) {
      progressCallback({
        type: 'directory',
        path: path,
        depth: depth,
        fileCount: result?.files?.length || 0,
        dirCount: result?.dirs?.length || 0
      });
    }

    // Add image files
    if (result?.files) {
      for (const file of result.files) {
        const ext = file.substring(file.lastIndexOf('.')).toLowerCase();
        if (imageExtensions.includes(ext)) {
          // Extract name from file path
          const fileName = file.split('/').pop();
          const name = fileName.substring(0, fileName.lastIndexOf('.'))
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          images.push({
            path: file,
            name: name,
            fileName: fileName
          });

          // Report file found
          if (progressCallback) {
            progressCallback({
              type: 'file',
              path: file,
              fileName: fileName,
              totalFound: images.length
            });
          }
        }
      }
    }

    // Recursively scan subdirectories
    if (result?.dirs) {
      for (const dir of result.dirs) {
        const subImages = await scanDirectoryForImages(dir, depth + 1, maxDepth, progressCallback);
        images.push(...subImages);
      }
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | Could not scan directory: ${path}`);
    if (progressCallback) {
      progressCallback({
        type: 'error',
        path: path,
        error: e.message
      });
    }
  }

  return images;
}

/**
 * Build token art index from local directories with progress dialog
 */
async function buildLocalTokenIndex(progressDialog = null) {
  console.log(`${MODULE_ID} | Building local token index...`);

  const paths = await discoverTokenPaths();
  if (paths.length === 0) {
    console.log(`${MODULE_ID} | No token paths found`);
    return [];
  }

  const allImages = [];
  const seenPaths = new Set();
  let totalImagesFound = 0;
  let currentDirectory = '';
  let directoriesScanned = 0;

  // Progress callback to update dialog
  const progressCallback = (info) => {
    if (info.type === 'directory') {
      currentDirectory = info.path;
      directoriesScanned++;

      if (progressDialog) {
        const content = createScanProgressHTML(
          currentDirectory,
          directoriesScanned,
          totalImagesFound,
          info.fileCount,
          info.dirCount
        );
        progressDialog.data.content = content;
        progressDialog.render(true);
      }
    } else if (info.type === 'file') {
      totalImagesFound++;

      // Update every 10 files to avoid too many re-renders
      if (progressDialog && totalImagesFound % 10 === 0) {
        const content = createScanProgressHTML(
          currentDirectory,
          directoriesScanned,
          totalImagesFound,
          0,
          0,
          info.fileName
        );
        progressDialog.data.content = content;
        progressDialog.render(true);
      }
    }
  };

  for (const path of paths) {
    const images = await scanDirectoryForImages(path, 0, 5, progressCallback);
    for (const img of images) {
      // Avoid duplicates from overlapping paths
      if (!seenPaths.has(img.path)) {
        seenPaths.add(img.path);
        allImages.push(img);
      }
    }
  }

  console.log(`${MODULE_ID} | Found ${allImages.length} images in local directories`);
  return allImages;
}

/**
 * Create HTML for scan progress dialog
 */
function createScanProgressHTML(currentDir, dirsScanned, imagesFound, filesInDir, subDirs, currentFile = null) {
  const safeDir = escapeHtml(currentDir);
  const safeFile = currentFile ? escapeHtml(currentFile) : '';

  // Shorten the directory path for display
  const shortDir = currentDir.length > 50
    ? '...' + currentDir.substring(currentDir.length - 47)
    : currentDir;
  const safeShortDir = escapeHtml(shortDir);

  return `
    <div class="token-replacer-fa-scan-progress">
      <div class="scan-status">
        <i class="fas fa-search fa-spin"></i>
        <span>Scanning token artwork...</span>
      </div>

      <div class="scan-stats">
        <div class="stat-item">
          <div class="stat-value">${dirsScanned}</div>
          <div class="stat-label">Directories</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${imagesFound}</div>
          <div class="stat-label">Images Found</div>
        </div>
      </div>

      <div class="scan-current">
        <div class="current-label">Current directory:</div>
        <div class="current-path" title="${safeDir}">${safeShortDir}</div>
        ${currentFile ? `
          <div class="current-file">
            <i class="fas fa-image"></i> ${safeFile}
          </div>
        ` : ''}
      </div>

      ${filesInDir > 0 ? `
        <div class="dir-info">
          <span><i class="fas fa-file-image"></i> ${filesInDir} files</span>
          <span><i class="fas fa-folder"></i> ${subDirs} subdirectories</span>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Search using Token Variant Art API
 */
async function searchTVA(searchTerm) {
  const api = TokenReplacerFA.tvaAPI;
  if (!api) return [];

  try {
    const results = await api.doImageSearch(searchTerm, {
      searchType: 'Portrait',
      simpleResults: true
    });

    if (!results || results.size === 0) return [];

    // Convert Map to array
    return Array.from(results.entries()).map(([path, data]) => ({
      path: path,
      name: data?.name || path.split('/').pop().replace(/\.[^/.]+$/, ''),
      source: 'tva'
    }));
  } catch (error) {
    console.warn(`${MODULE_ID} | TVA search error:`, error);
    return [];
  }
}

/**
 * Search local index with fuzzy matching
 */
async function searchLocalIndex(searchTerms, index) {
  if (!index || index.length === 0) return [];

  const Fuse = TokenReplacerFA.Fuse;
  if (!Fuse) return [];

  const threshold = TokenReplacerFA.getSetting('fuzzyThreshold');

  const fuse = new Fuse(index, {
    keys: [
      { name: 'name', weight: 2 },
      { name: 'fileName', weight: 1 }
    ],
    threshold: threshold,
    includeScore: true,
    minMatchCharLength: 2,
    ignoreLocation: true,
    findAllMatches: true
  });

  const allResults = [];

  for (const term of searchTerms) {
    const results = fuse.search(term);
    for (const result of results) {
      // Avoid duplicates, but update score if better match found
      const existing = allResults.find(r => r.path === result.item.path);
      if (!existing) {
        allResults.push({
          ...result.item,
          score: result.score,
          matchedTerm: term,
          source: 'local'
        });
      } else if (result.score < existing.score) {
        existing.score = result.score;
        existing.matchedTerm = term;
      }
    }
  }

  // Sort by score (lower is better in Fuse.js)
  allResults.sort((a, b) => (a.score || 0) - (b.score || 0));

  return allResults.slice(0, 20); // Return top 20 matches
}

/**
 * Combined search across all sources
 */
async function searchTokenArt(creatureInfo, localIndex) {
  const searchTerms = creatureInfo.searchTerms;
  if (searchTerms.length === 0) return [];

  const priority = TokenReplacerFA.getSetting('searchPriority');
  const results = [];

  // Search local index (FA Nexus and other local sources)
  if (priority === 'faNexus' || priority === 'both') {
    const localResults = await searchLocalIndex(searchTerms, localIndex);
    results.push(...localResults);
  }

  // Search Token Variant Art (Forge Bazaar)
  if ((priority === 'forgeBazaar' || priority === 'both') && TokenReplacerFA.hasTVA) {
    // Search TVA for each term, prioritizing actor name
    for (const term of searchTerms) {
      const tvaResults = await searchTVA(term);
      for (const result of tvaResults) {
        if (!results.find(r => r.path === result.path)) {
          results.push(result);
        }
      }
      // If we found good results with the first term (actor name), stop
      if (tvaResults.length >= 5 && term === searchTerms[0]) {
        break;
      }
    }
  }

  // Sort based on priority preference
  if (priority === 'faNexus') {
    results.sort((a, b) => {
      if (a.source === 'local' && b.source !== 'local') return -1;
      if (a.source !== 'local' && b.source === 'local') return 1;
      return (a.score || 0.5) - (b.score || 0.5);
    });
  } else if (priority === 'forgeBazaar') {
    results.sort((a, b) => {
      if (a.source === 'tva' && b.source !== 'tva') return -1;
      if (a.source !== 'tva' && b.source === 'tva') return 1;
      return (a.score || 0.5) - (b.score || 0.5);
    });
  } else {
    // 'both' - sort by score only
    results.sort((a, b) => (a.score || 0.5) - (b.score || 0.5));
  }

  return results;
}

/**
 * Replace token image
 */
async function replaceTokenImage(token, imagePath) {
  try {
    await token.document.update({
      'texture.src': imagePath
    });
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to update token:`, error);
    return false;
  }
}

/**
 * Show match selection dialog
 */
async function showMatchSelectionDialog(creatureInfo, matches) {
  return new Promise((resolve) => {
    // Escape all user-provided content to prevent XSS
    const safeName = escapeHtml(creatureInfo.actorName);
    const safeType = escapeHtml(creatureInfo.type || 'Unknown');
    const safeSubtype = creatureInfo.subtype ? `(${escapeHtml(creatureInfo.subtype)})` : '';

    const content = `
      <div class="token-replacer-fa-token-preview">
        <img src="${escapeHtml(creatureInfo.currentImage)}" alt="${safeName}">
        <div class="token-info">
          <div class="token-name">${safeName}</div>
          <div class="token-type">${safeType} ${safeSubtype}</div>
        </div>
      </div>
      <div class="token-replacer-fa-match-select">
        ${matches.slice(0, 12).map((match, idx) => {
          const safeMatchName = escapeHtml(match.name);
          const safePath = escapeHtml(match.path);
          const scoreDisplay = match.score !== undefined
            ? `${Math.round((1 - match.score) * 100)}%`
            : escapeHtml(match.source || '');
          return `
            <div class="match-option" data-index="${idx}" data-path="${safePath}">
              <img src="${safePath}" alt="${safeMatchName}" onerror="this.src='icons/svg/mystery-man.svg'">
              <div class="match-name">${safeMatchName}</div>
              <div class="match-score">${scoreDisplay}</div>
            </div>
          `;
        }).join('')}
      </div>
      <p style="font-size: 11px; color: #888; margin-top: 10px;">
        Double-click to select, or use buttons below.
      </p>
    `;

    let dialogInstance = null;

    dialogInstance = new Dialog({
      title: TokenReplacerFA.i18n('dialog.selectMatch'),
      content: content,
      buttons: {
        select: {
          icon: '<i class="fas fa-check"></i>',
          label: 'Select',
          callback: (html) => {
            const selected = html.find('.match-option.selected');
            if (selected.length > 0) {
              resolve(selected.data('path'));
            } else {
              resolve(null);
            }
          }
        },
        skip: {
          icon: '<i class="fas fa-forward"></i>',
          label: TokenReplacerFA.i18n('dialog.skip'),
          callback: () => resolve(null)
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: TokenReplacerFA.i18n('dialog.cancel'),
          callback: () => resolve('cancel')
        }
      },
      default: 'select',
      render: (html) => {
        // Use vanilla JS for event handling (more reliable than jQuery)
        const options = html[0].querySelectorAll('.match-option');
        options.forEach(option => {
          option.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
          });

          option.addEventListener('dblclick', () => {
            const path = option.dataset.path;
            dialogInstance.close();
            resolve(path);
          });
        });

        // Select first option by default
        if (options.length > 0) {
          options[0].classList.add('selected');
        }
      },
      close: () => resolve(null)
    }, {
      classes: ['token-replacer-fa-dialog'],
      width: 520,
      height: 'auto'
    });

    dialogInstance.render(true);
  });
}

/**
 * Create progress HTML with escaped content
 */
function createProgressHTML(current, total, status, results) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;
  const safeStatus = escapeHtml(status);

  let html = `
    <div class="token-replacer-fa-progress">
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
      <div class="progress-text">${current} / ${total} - ${safeStatus}</div>
    </div>
  `;

  if (current >= total && total > 0) {
    html += `
      <div class="token-replacer-fa-summary">
        <div class="summary-item success">
          <div class="count">${successCount}</div>
          <div class="label">Replaced</div>
        </div>
        <div class="summary-item failed">
          <div class="count">${failedCount}</div>
          <div class="label">No Match</div>
        </div>
        <div class="summary-item skipped">
          <div class="count">${skippedCount}</div>
          <div class="label">Skipped</div>
        </div>
      </div>
      <div class="token-replacer-fa-results">
        ${results.map(r => {
          const safeName = escapeHtml(r.name);
          const safeMatch = r.match ? escapeHtml(r.match) : '';
          const iconClass = r.status === 'success' ? 'fa-check' :
                           r.status === 'failed' ? 'fa-times' : 'fa-forward';
          return `
            <div class="result-item ${r.status}">
              <div class="result-icon ${r.status}">
                <i class="fas ${iconClass}"></i>
              </div>
              <div class="result-name">${safeName}</div>
              ${safeMatch ? `<div class="result-match">${safeMatch}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return html;
}

/**
 * Main replacement process
 */
async function processTokenReplacement() {
  if (TokenReplacerFA.isProcessing) {
    ui.notifications.warn('Token replacement already in progress');
    return;
  }

  TokenReplacerFA.isProcessing = true;

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
  const npcTokens = getSceneNPCTokens();
  if (npcTokens.length === 0) {
    ui.notifications.info(TokenReplacerFA.i18n('notifications.noTokens'));
    TokenReplacerFA.isProcessing = false;
    return;
  }

  ui.notifications.info(TokenReplacerFA.i18n('notifications.started'));

  // Create scan progress dialog
  let scanDialog = new Dialog({
    title: TokenReplacerFA.i18n('dialog.title'),
    content: createScanProgressHTML('Initializing...', 0, 0, 0, 0),
    buttons: {
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: TokenReplacerFA.i18n('dialog.cancel'),
        callback: () => {
          TokenReplacerFA.isProcessing = false;
        }
      }
    },
    close: () => {}
  }, {
    classes: ['token-replacer-fa-dialog'],
    width: 450
  });
  scanDialog.render(true);

  // Build local token index (FA Nexus and other local sources) with progress
  const localIndex = await buildLocalTokenIndex(scanDialog);

  // Close scan dialog
  scanDialog.close();

  // Check if we have any search sources available
  if (!TokenReplacerFA.hasTVA && localIndex.length === 0) {
    ui.notifications.warn(TokenReplacerFA.i18n('notifications.missingDeps'));
    TokenReplacerFA.isProcessing = false;
    return;
  }

  const results = [];
  const autoReplace = TokenReplacerFA.getSetting('autoReplace');
  const confirmReplace = TokenReplacerFA.getSetting('confirmReplace');
  const threshold = TokenReplacerFA.getSetting('fuzzyThreshold');

  // Create progress dialog for token replacement
  let progressDialog = null;
  let progressContent = '';

  const updateProgress = (current, total, status, result = null) => {
    if (result) results.push(result);
    progressContent = createProgressHTML(current, total, status, results);

    if (progressDialog) {
      progressDialog.data.content = progressContent;
      progressDialog.render(true);
    }
  };

  // Show token replacement progress dialog
  progressDialog = new Dialog({
    title: TokenReplacerFA.i18n('dialog.title'),
    content: createProgressHTML(0, npcTokens.length, TokenReplacerFA.i18n('dialog.scanning'), []),
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: 'Close',
        callback: () => {}
      }
    },
    close: () => {}
  }, {
    classes: ['token-replacer-fa-dialog'],
    width: 450
  });
  progressDialog.render(true);

  // Process each token
  for (let i = 0; i < npcTokens.length; i++) {
    const token = npcTokens[i];
    const creatureInfo = extractCreatureInfo(token);

    if (!creatureInfo) {
      updateProgress(i + 1, npcTokens.length, 'Skipped (no actor)', {
        name: token.name,
        status: 'skipped'
      });
      continue;
    }

    updateProgress(i, npcTokens.length,
      TokenReplacerFA.i18n('dialog.searching', { name: creatureInfo.actorName }), null);

    // Search for matching art
    const matches = await searchTokenArt(creatureInfo, localIndex);

    if (matches.length === 0) {
      updateProgress(i + 1, npcTokens.length,
        TokenReplacerFA.i18n('dialog.noMatch', { name: creatureInfo.actorName }), {
        name: creatureInfo.actorName,
        status: 'failed'
      });
      continue;
    }

    // Get best match
    const bestMatch = matches[0];
    const matchScore = bestMatch.score !== undefined ? (1 - bestMatch.score) : 0.8;

    // Decide whether to auto-replace or ask
    let selectedPath = null;

    if (autoReplace && matchScore >= (1 - threshold)) {
      // High confidence match, auto-replace
      selectedPath = bestMatch.path;
    } else if (confirmReplace) {
      // Show selection dialog
      progressDialog.close();
      selectedPath = await showMatchSelectionDialog(creatureInfo, matches);

      if (selectedPath === 'cancel') {
        // User cancelled the entire operation
        TokenReplacerFA.isProcessing = false;
        return;
      }

      // Re-render progress dialog
      progressDialog = new Dialog({
        title: TokenReplacerFA.i18n('dialog.title'),
        content: progressContent,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Close'
          }
        }
      }, {
        classes: ['token-replacer-fa-dialog'],
        width: 450
      });
      progressDialog.render(true);
    } else {
      // No confirmation, use best match
      selectedPath = bestMatch.path;
    }

    if (selectedPath) {
      // Replace the token
      const success = await replaceTokenImage(token, selectedPath);
      updateProgress(i + 1, npcTokens.length,
        TokenReplacerFA.i18n('dialog.replacing'), {
        name: creatureInfo.actorName,
        status: success ? 'success' : 'failed',
        match: bestMatch.name
      });
    } else {
      // Skipped
      updateProgress(i + 1, npcTokens.length, 'Skipped', {
        name: creatureInfo.actorName,
        status: 'skipped'
      });
    }
  }

  // Final update
  const successCount = results.filter(r => r.status === 'success').length;
  updateProgress(npcTokens.length, npcTokens.length,
    TokenReplacerFA.i18n('dialog.complete'), null);

  ui.notifications.info(
    TokenReplacerFA.i18n('notifications.complete', { count: successCount })
  );

  TokenReplacerFA.isProcessing = false;
}

/**
 * Module initialization
 */
Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing Token Replacer - Forgotten Adventures`);
  registerSettings();
});

Hooks.once('ready', async () => {
  console.log(`${MODULE_ID} | Module ready`);

  // Preload Fuse.js
  await loadFuse();

  // Log available integrations
  console.log(`${MODULE_ID} | Token Variant Art available: ${TokenReplacerFA.hasTVA}`);
  console.log(`${MODULE_ID} | FA Nexus available: ${TokenReplacerFA.hasFANexus}`);
});

/**
 * Add button to scene controls
 */
Hooks.on('getSceneControlButtons', (controls) => {
  // Only show for GM
  if (!game.user.isGM) return;

  // Add button to token controls
  // Handle both v12 (array) and v13 (object) formats
  if (Array.isArray(controls)) {
    // Foundry v12 format
    const tokenControls = controls.find(c => c.name === 'token');
    if (tokenControls) {
      tokenControls.tools.push({
        name: 'tokenReplacerFA',
        title: game.i18n.localize('TOKEN_REPLACER_FA.button.title'),
        icon: 'fas fa-wand-magic-sparkles',
        button: true,
        visible: true,
        onClick: () => {
          processTokenReplacement();
        }
      });
    }
  } else {
    // Foundry v13 format
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
      onClick: () => {
        processTokenReplacement();
      }
    };
  }
});

// Export for debugging
window.TokenReplacerFA = TokenReplacerFA;
