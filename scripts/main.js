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
 * Parse filter text into individual terms for AND logic filtering
 * Supports comma, space, and colon as delimiters
 * @param {string} filterText - The raw filter input text
 * @returns {string[]} Array of lowercase filter terms
 */
function parseFilterTerms(filterText) {
  if (!filterText) return [];
  return filterText
    .toLowerCase()
    .trim()
    .split(/[,\s:]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

/**
 * Check if text matches all filter terms (AND logic)
 * @param {string} text - The text to check against
 * @param {string[]} filterTerms - Array of terms that must all be present
 * @returns {boolean} True if all terms are found in text
 */
function matchesAllTerms(text, filterTerms) {
  if (!filterTerms || filterTerms.length === 0) return true;
  const textLower = (text || '').toLowerCase();
  return filterTerms.every(term => textLower.includes(term));
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

  // Fallback to full index search when no category matches
  game.settings.register(MODULE_ID, 'fallbackFullSearch', {
    name: 'TOKEN_REPLACER_FA.settings.fallbackFullSearch.name',
    hint: 'TOKEN_REPLACER_FA.settings.fallbackFullSearch.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
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

  // Use TVA cache (skip manual directory scanning)
  game.settings.register(MODULE_ID, 'useTVACache', {
    name: 'TOKEN_REPLACER_FA.settings.useTVACache.name',
    hint: 'TOKEN_REPLACER_FA.settings.useTVACache.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // Refresh TVA cache before search
  game.settings.register(MODULE_ID, 'refreshTVACache', {
    name: 'TOKEN_REPLACER_FA.settings.refreshTVACache.name',
    hint: 'TOKEN_REPLACER_FA.settings.refreshTVACache.hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
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
 * Get NPC tokens to process
 * If tokens are selected, only process selected NPC tokens
 * Otherwise, process all NPC tokens on the scene
 */
function getSceneNPCTokens() {
  if (!canvas?.tokens?.placeables) {
    return [];
  }

  // Check if there are selected tokens
  const selectedTokens = canvas.tokens.controlled;

  // If tokens are selected, filter to only NPC tokens from selection
  if (selectedTokens && selectedTokens.length > 0) {
    const selectedNPCs = selectedTokens.filter(token => {
      const actor = token.actor;
      if (!actor) return false;
      return actor.type === 'npc';
    });

    if (selectedNPCs.length > 0) {
      console.log(`${MODULE_ID} | Processing ${selectedNPCs.length} selected NPC token(s)`);
      return selectedNPCs;
    }
  }

  // No selection or no NPCs selected - process all NPC tokens on scene
  console.log(`${MODULE_ID} | Processing all NPC tokens on scene`);
  return canvas.tokens.placeables.filter(token => {
    const actor = token.actor;
    if (!actor) return false;
    return actor.type === 'npc';
  });
}

/**
 * Discover token art paths (FA Nexus and other sources)
 * Uses yielding to prevent browser freeze
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
    // Yield between each path check to prevent freezing
    await new Promise(resolve => setTimeout(resolve, 5));
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

  // Yield before checking root
  await new Promise(resolve => setTimeout(resolve, 10));

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

  // Yield before additional paths
  await new Promise(resolve => setTimeout(resolve, 5));

  // Add user-configured additional paths
  try {
    const additionalPathsSetting = game.settings.get(MODULE_ID, 'additionalPaths');
    if (additionalPathsSetting) {
      const additionalPaths = additionalPathsSetting.split(',').map(p => p.trim()).filter(p => p);
      for (const path of additionalPaths) {
        await new Promise(resolve => setTimeout(resolve, 5));
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
 * Yield to browser event loop to prevent freezing
 */
function yieldToMain(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely close a dialog and wait for it to finish
 */
async function closeDialogSafely(dialog) {
  if (!dialog) return;
  try {
    dialog.close();
    // Give the DOM time to update
    await yieldToMain(50);
  } catch (e) {
    // Dialog might already be closed
  }
}

/**
 * PRIMARY category terms - used for "Browse All [Category]"
 * These are the main folder names in Forgotten Adventures
 * Only searches for artwork actually IN that category folder
 */
const PRIMARY_CATEGORY_TERMS = {
  'aberration': ['aberration', 'aberrations'],
  'beast': ['beast', 'beasts', 'animal', 'animals'],
  'celestial': ['celestial', 'celestials'],
  'construct': ['construct', 'constructs', 'golem', 'golems'],
  'dragon': ['dragon', 'dragons'],
  'elemental': ['elemental', 'elementals'],
  'fey': ['fey', 'fairy', 'fairies'],
  'fiend': ['fiend', 'fiends', 'demon', 'demons', 'devil', 'devils'],
  'giant': ['giant', 'giants'],
  'humanoid': ['humanoid', 'humanoids'],
  'monstrosity': ['monstrosity', 'monstrosities', 'monster', 'monsters'],
  'ooze': ['ooze', 'oozes', 'slime', 'slimes'],
  'plant': ['plant', 'plants'],
  'undead': ['undead', 'zombie', 'skeleton', 'ghost', 'vampire']
};

/**
 * EXTENDED creature type mappings - used for subtype filtering and auto-detection
 * Includes races, classes, and specific creature names for filtering results
 */
const CREATURE_TYPE_MAPPINGS = {
  'aberration': ['aberration', 'aberrations', 'mind flayer', 'beholder', 'illithid', 'aboleth'],
  'beast': ['beast', 'beasts', 'animal', 'animals', 'wolf', 'bear', 'horse', 'cat', 'dog', 'bird'],
  'celestial': ['celestial', 'celestials', 'angel', 'angels', 'deva', 'planetar', 'solar'],
  'construct': ['construct', 'constructs', 'golem', 'golems', 'robot', 'automaton', 'warforged'],
  'dragon': ['dragon', 'dragons', 'drake', 'drakes', 'wyrm', 'wyvern', 'dragonborn'],
  'elemental': ['elemental', 'elementals', 'genie', 'genies', 'djinni', 'efreeti', 'fire elemental', 'water elemental'],
  'fey': ['fey', 'fairy', 'fairies', 'sprite', 'pixie', 'satyr', 'dryad', 'nymph', 'eladrin'],
  'fiend': ['fiend', 'fiends', 'demon', 'demons', 'devil', 'devils', 'succubus', 'incubus', 'imp', 'balor'],
  'giant': ['giant', 'giants', 'ogre', 'ogres', 'troll', 'trolls', 'cyclops', 'ettin', 'hill giant', 'frost giant'],
  'humanoid': ['humanoid', 'humanoids', 'human', 'npc', 'goblin', 'orc', 'elf', 'dwarf', 'halfling', 'gnome', 'tiefling', 'dragonborn', 'half-elf', 'half-orc', 'hobgoblin', 'bugbear', 'kobold', 'gnoll', 'lizardfolk', 'kenku', 'tabaxi', 'firbolg', 'goliath', 'aasimar', 'genasi', 'triton', 'yuan-ti', 'githyanki', 'githzerai', 'drow', 'duergar', 'svirfneblin', 'bandit', 'guard', 'soldier', 'knight', 'mage', 'priest', 'noble', 'commoner', 'thug', 'assassin', 'spy', 'veteran', 'cultist', 'acolyte', 'berserker', 'gladiator', 'scout', 'tribal', 'pirate', 'captain', 'wizard', 'warlock', 'cleric', 'paladin', 'ranger', 'rogue', 'fighter', 'barbarian', 'monk', 'bard', 'druid', 'sorcerer'],
  'monstrosity': ['monstrosity', 'monstrosities', 'monster', 'monsters', 'chimera', 'manticore', 'medusa', 'minotaur', 'basilisk', 'hydra', 'griffon', 'hippogriff', 'owlbear', 'roc', 'sphinx', 'kraken'],
  'ooze': ['ooze', 'oozes', 'slime', 'slimes', 'jelly', 'pudding', 'cube', 'gelatinous'],
  'plant': ['plant', 'plants', 'fungus', 'fungi', 'treant', 'shambling mound', 'myconid', 'blight'],
  'undead': ['undead', 'zombie', 'zombies', 'skeleton', 'skeletons', 'ghost', 'ghosts', 'vampire', 'lich', 'wight', 'wraith', 'specter', 'mummy', 'revenant', 'banshee', 'death knight']
};

/**
 * Check if a folder name matches a creature type
 */
function folderMatchesCreatureType(folderName, creatureType) {
  if (!folderName || !creatureType) return false;

  const folderLower = folderName.toLowerCase();
  const typeLower = creatureType.toLowerCase();

  // Direct match
  if (folderLower.includes(typeLower) || typeLower.includes(folderLower)) {
    return true;
  }

  // Check mappings
  const mappings = CREATURE_TYPE_MAPPINGS[typeLower];
  if (mappings) {
    return mappings.some(m => folderLower.includes(m) || m.includes(folderLower));
  }

  return false;
}

/**
 * Recursively scan directory for image files with progress reporting
 * Optimized to prevent browser freezing
 * Now also tracks the category (top-level folder) for each image
 */
async function scanDirectoryForImages(path, depth = 0, maxDepth = 5, progressCallback = null, category = null) {
  if (depth > maxDepth) return [];

  const images = [];
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];

  try {
    // Yield BEFORE the FilePicker call to keep browser responsive
    await yieldToMain(5);

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

    // Add image files in batches to prevent blocking
    if (result?.files) {
      let batchCount = 0;
      for (const file of result.files) {
        const ext = file.substring(file.lastIndexOf('.')).toLowerCase();
        if (imageExtensions.includes(ext)) {
          const fileName = file.split('/').pop();
          const name = fileName.substring(0, fileName.lastIndexOf('.'))
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          images.push({
            path: file,
            name: name,
            fileName: fileName,
            category: category || path.split('/').pop() // Track category
          });

          batchCount++;

          // Yield every 50 files to prevent blocking
          if (batchCount % 50 === 0) {
            await yieldToMain(1);
          }
        }
      }

      // Report batch of files found (not individual files)
      if (progressCallback && batchCount > 0) {
        progressCallback({
          type: 'files_batch',
          count: batchCount,
          totalFound: images.length
        });
      }
    }

    // Process subdirectories with yielding
    if (result?.dirs && result.dirs.length > 0) {
      for (const dir of result.dirs) {
        // Yield between each subdirectory
        await yieldToMain(5);
        // For depth 0, the subdirectory name becomes the category
        const subCategory = depth === 0 ? dir.split('/').pop() : category;
        const subImages = await scanDirectoryForImages(dir, depth + 1, maxDepth, progressCallback, subCategory);
        images.push(...subImages);
      }
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | Could not scan directory: ${path}`);
  }

  return images;
}

/**
 * Build token art index from local directories with progress dialog
 */
async function buildLocalTokenIndex(progressDialog = null) {
  console.log(`${MODULE_ID} | Building local token index...`);

  // Initial UI update before starting
  if (progressDialog) {
    const content = createScanProgressHTML('Discovering paths...', 0, 0, 0, 0);
    progressDialog.data.content = content;
    progressDialog.render(true);
    await yieldToMain(50);
  }

  const paths = await discoverTokenPaths();
  if (paths.length === 0) {
    console.log(`${MODULE_ID} | No token paths found`);
    return [];
  }

  // Update UI with discovered paths
  if (progressDialog) {
    const content = createScanProgressHTML(`Found ${paths.length} paths to scan`, 0, 0, 0, 0);
    progressDialog.data.content = content;
    progressDialog.render(true);
    await yieldToMain(50);
  }

  const allImages = [];
  const seenPaths = new Set();
  let totalImagesFound = 0;
  let currentDirectory = '';
  let directoriesScanned = 0;
  let lastUIUpdate = Date.now();
  const UI_UPDATE_INTERVAL = 150; // Update UI max every 150ms
  let isFirstUpdate = true;

  // Progress callback to update dialog (throttled, but first update is immediate)
  const progressCallback = (info) => {
    const now = Date.now();

    if (info.type === 'directory') {
      currentDirectory = info.path;
      directoriesScanned++;
    } else if (info.type === 'files_batch') {
      totalImagesFound += info.count;
    }

    // First update is immediate, then throttle
    const shouldUpdate = isFirstUpdate || (now - lastUIUpdate > UI_UPDATE_INTERVAL);

    if (progressDialog && shouldUpdate) {
      isFirstUpdate = false;
      lastUIUpdate = now;
      try {
        const content = createScanProgressHTML(
          currentDirectory,
          directoriesScanned,
          totalImagesFound,
          info.fileCount || 0,
          info.dirCount || 0
        );
        progressDialog.data.content = content;
        progressDialog.render(true);
      } catch (e) {
        // Dialog might be closing
      }
    }
  };

  for (const path of paths) {
    // Yield to event loop between top-level paths
    await yieldToMain(20);

    const images = await scanDirectoryForImages(path, 0, 5, progressCallback);
    for (const img of images) {
      // Avoid duplicates from overlapping paths
      if (!seenPaths.has(img.path)) {
        seenPaths.add(img.path);
        allImages.push(img);
      }
    }

    // Force UI update after each top-level path
    if (progressDialog) {
      try {
        const content = createScanProgressHTML(
          currentDirectory,
          directoriesScanned,
          allImages.length,
          0,
          0
        );
        progressDialog.data.content = content;
        progressDialog.render(true);
      } catch (e) {
        // Dialog might be closing
      }
      await yieldToMain(20);
    }
  }

  // Final UI update
  if (progressDialog) {
    try {
      const content = createScanProgressHTML(
        'Scan complete',
        directoriesScanned,
        allImages.length,
        0,
        0
      );
      progressDialog.data.content = content;
      progressDialog.render(true);
    } catch (e) {
      // Dialog might be closing
    }
    await yieldToMain(100);
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
 * Get ALL images from TVA cache for folder-based filtering
 * Returns array of {path, name, source} objects
 */
async function getAllTVAImages() {
  const api = TokenReplacerFA.tvaAPI;
  if (!api) return [];

  try {
    // Method 1: Try to access TVA's internal caches directly
    const tvaModule = game.modules.get('token-variants');
    if (tvaModule?.api?.caches) {
      const allImages = [];
      const caches = tvaModule.api.caches;

      // TVA caches is typically a Map or object with cached search results
      if (caches instanceof Map) {
        for (const [key, value] of caches.entries()) {
          if (Array.isArray(value)) {
            for (const item of value) {
              const path = extractPathFromTVAResult(item);
              if (path) {
                allImages.push({
                  path: path,
                  name: extractNameFromTVAResult(item, path),
                  source: 'tva'
                });
              }
            }
          }
        }
      } else if (typeof caches === 'object') {
        for (const [key, value] of Object.entries(caches)) {
          if (Array.isArray(value)) {
            for (const item of value) {
              const path = extractPathFromTVAResult(item);
              if (path) {
                allImages.push({
                  path: path,
                  name: extractNameFromTVAResult(item, path),
                  source: 'tva'
                });
              }
            }
          }
        }
      }

      if (allImages.length > 0) {
        console.log(`${MODULE_ID} | Got ${allImages.length} images from TVA caches`);
        return allImages;
      }
    }

    // Method 2: Do a broad search with wildcard/empty to get many results
    // Try searching with "*" which some APIs treat as wildcard
    console.log(`${MODULE_ID} | Trying broad TVA search...`);
    const broadResults = await api.doImageSearch('*', {
      searchType: 'Portrait',
      simpleResults: false
    });

    if (broadResults) {
      const allImages = [];

      if (Array.isArray(broadResults)) {
        for (const item of broadResults) {
          const path = extractPathFromTVAResult(item);
          if (path) {
            allImages.push({
              path: path,
              name: extractNameFromTVAResult(item, path),
              source: 'tva'
            });
          }
        }
      } else if (broadResults instanceof Map) {
        for (const [key, value] of broadResults.entries()) {
          if (Array.isArray(value)) {
            for (const item of value) {
              const path = extractPathFromTVAResult(item);
              if (path) {
                allImages.push({
                  path: path,
                  name: extractNameFromTVAResult(item, path),
                  source: 'tva'
                });
              }
            }
          }
        }
      }

      if (allImages.length > 0) {
        console.log(`${MODULE_ID} | Got ${allImages.length} images from broad TVA search`);
        return allImages;
      }
    }

    return [];
  } catch (error) {
    console.error(`${MODULE_ID} | Error getting all TVA images:`, error);
    return [];
  }
}

/**
 * Filter images by folder path
 * Returns images that are inside the specified category folder
 */
function filterByFolderPath(images, categoryType) {
  if (!images || !categoryType) return [];

  const categoryLower = categoryType.toLowerCase();
  const categoryTerms = PRIMARY_CATEGORY_TERMS[categoryLower] || [categoryLower];

  console.log(`${MODULE_ID} | Filtering ${images.length} images for folder: ${categoryType}`);

  const filtered = images.filter(img => {
    if (!img.path) return false;
    const pathLower = img.path.toLowerCase();

    // Check if path contains category folder
    // Match patterns like: /Humanoid/, /humanoid/, Humanoid/, etc.
    for (const term of categoryTerms) {
      const termLower = term.toLowerCase();
      // Check for folder patterns
      if (pathLower.includes(`/${termLower}/`) ||
          pathLower.includes(`/${termLower}s/`) ||
          pathLower.startsWith(`${termLower}/`) ||
          pathLower.startsWith(`${termLower}s/`) ||
          pathLower.includes(`\\${termLower}\\`) ||
          pathLower.includes(`\\${termLower}s\\`)) {
        return true;
      }
    }
    return false;
  });

  console.log(`${MODULE_ID} | Filtered to ${filtered.length} images in ${categoryType} folder`);
  return filtered;
}

/**
 * Search using Token Variant Art API
 */
async function searchTVA(searchTerm) {
  const api = TokenReplacerFA.tvaAPI;
  if (!api) return [];

  try {
    // Use full results (not simpleResults) to get proper path information
    const results = await api.doImageSearch(searchTerm, {
      searchType: 'Portrait',
      simpleResults: false
    });

    // Handle empty results
    if (!results) {
      return [];
    }

    const searchResults = [];

    // Handle array results (common TVA format)
    if (Array.isArray(results)) {
      for (const item of results) {
        const imagePath = extractPathFromTVAResult(item);
        const name = extractNameFromTVAResult(item, imagePath);

        if (imagePath) {
          searchResults.push({
            path: imagePath,
            name: name,
            source: 'tva'
          });
        }
      }
    }
    // Handle Map results - TVA returns Map where key is search term, value is array of results
    else if (results instanceof Map || (results && typeof results.entries === 'function')) {
      for (const [key, data] of results.entries()) {
        // Data is typically an Array of image results
        if (Array.isArray(data)) {
          for (const item of data) {
            const imagePath = extractPathFromTVAResult(item);
            const name = extractNameFromTVAResult(item, imagePath);

            if (imagePath) {
              searchResults.push({
                path: imagePath,
                name: name,
                source: 'tva'
              });
            } else if (data.length <= 5) {
              // Only log failures for small result sets to avoid spam
              console.warn(`${MODULE_ID} | Failed to extract path from TVA item:`, item);
            }
          }
        }
        // Data might be a single result object
        else if (data && typeof data === 'object') {
          const imagePath = extractPathFromTVAResult(data);
          const name = extractNameFromTVAResult(data, imagePath);

          if (imagePath) {
            searchResults.push({
              path: imagePath,
              name: name,
              source: 'tva'
            });
          }
        }
        // Key itself might be the path (older TVA format)
        else if (typeof key === 'string' && key.length > 0 && (key.includes('/') || key.includes('.'))) {
          searchResults.push({
            path: key,
            name: extractNameFromTVAResult(data, key),
            source: 'tva'
          });
        }
      }
    }
    // Handle object with paths property (another possible format)
    else if (results && typeof results === 'object') {
      // Check for paths array property
      const pathsArray = results.paths || results.images || results.results || results.data;
      if (Array.isArray(pathsArray)) {
        for (const item of pathsArray) {
          const imagePath = typeof item === 'string' ? item : extractPathFromTVAResult(item);
          const name = extractNameFromTVAResult(item, imagePath);

          if (imagePath) {
            searchResults.push({
              path: imagePath,
              name: name,
              source: 'tva'
            });
          }
        }
      }
    }

    return searchResults;
  } catch (error) {
    console.error(`${MODULE_ID} | TVA search error for "${searchTerm}":`, error);
    return [];
  }
}

/**
 * Extract image path from a TVA result item
 * TVA returns results in various formats:
 * - String: direct path
 * - Tuple: [path, configObject] - common format
 * - Object: { path, src, route, etc. }
 */
function extractPathFromTVAResult(item) {
  if (!item) return null;

  // String path directly
  if (typeof item === 'string') {
    if (item.includes('/') || item.includes('.') || item.startsWith('http') || item.startsWith('forge://')) {
      return item;
    }
    return null;
  }

  // TUPLE FORMAT: [path, config] - very common in TVA results!
  // TVA often returns results as arrays where first element is the path
  if (Array.isArray(item)) {
    if (item.length >= 1) {
      const firstElement = item[0];
      // First element is the path string
      if (typeof firstElement === 'string') {
        return firstElement;
      }
      // First element might be an object with path
      if (typeof firstElement === 'object' && firstElement !== null) {
        const pathFromFirst = extractPathFromObject(firstElement);
        if (pathFromFirst) return pathFromFirst;
      }
    }
    return null;
  }

  // Object with path properties
  if (typeof item === 'object') {
    return extractPathFromObject(item);
  }

  return null;
}

/**
 * Extract path from a plain object (helper for extractPathFromTVAResult)
 */
function extractPathFromObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

  // Common property names for image paths (in order of preference)
  const pathProps = ['path', 'route', 'src', 'img', 'image', 'thumb', 'thumbnail', 'url', 'uri'];

  for (const prop of pathProps) {
    const value = obj[prop];
    if (value && typeof value === 'string') {
      // Validate it looks like a path
      if (value.includes('/') || value.includes('.') || value.startsWith('http') || value.startsWith('forge://')) {
        return value;
      }
    }
  }

  // Check nested data property
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    for (const prop of pathProps) {
      const value = obj.data[prop];
      if (value && typeof value === 'string') {
        if (value.includes('/') || value.includes('.') || value.startsWith('http') || value.startsWith('forge://')) {
          return value;
        }
      }
    }
  }

  return null;
}

/**
 * Extract name from a TVA result item
 * Handles tuple format [path, config] and object format
 */
function extractNameFromTVAResult(item, imagePath) {
  // Helper to extract name from object
  const extractNameFromObject = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const nameProps = ['name', 'label', 'title', 'displayName', 'filename'];
    for (const prop of nameProps) {
      if (obj[prop] && typeof obj[prop] === 'string') {
        return obj[prop];
      }
    }
    return null;
  };

  // Helper to extract name from path
  const extractNameFromPath = (path) => {
    if (!path || typeof path !== 'string') return null;
    if (path.includes('/')) {
      return path.split('/').pop().replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }
    return path.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  };

  // Handle tuple format [path, config]
  if (Array.isArray(item)) {
    // Try config object (second element) first
    if (item.length >= 2 && typeof item[1] === 'object') {
      const nameFromConfig = extractNameFromObject(item[1]);
      if (nameFromConfig) return nameFromConfig;
    }
    // Try first element if it's an object
    if (item.length >= 1 && typeof item[0] === 'object') {
      const nameFromFirst = extractNameFromObject(item[0]);
      if (nameFromFirst) return nameFromFirst;
    }
    // Fall back to extracting from path
    if (imagePath) {
      return extractNameFromPath(imagePath) || 'Unknown';
    }
    return 'Unknown';
  }

  // Handle object format
  if (item && typeof item === 'object') {
    const nameFromObj = extractNameFromObject(item);
    if (nameFromObj) return nameFromObj;
  }

  // Fall back to extracting from path
  if (imagePath) {
    return extractNameFromPath(imagePath) || 'Unknown';
  }

  return 'Unknown';
}

/**
 * Search local index with fuzzy matching
 * Optimized: First filters by creature type/category, then searches by name
 */
async function searchLocalIndex(searchTerms, index, creatureType = null) {
  if (!index || index.length === 0) return [];

  const Fuse = TokenReplacerFA.Fuse;
  if (!Fuse) return [];

  const threshold = TokenReplacerFA.getSetting('fuzzyThreshold');

  // OPTIMIZATION: First filter by creature type category if available
  let filteredIndex = index;
  if (creatureType) {
    const categoryMatches = index.filter(img =>
      img.category && folderMatchesCreatureType(img.category, creatureType)
    );

    // If we found category matches, search those first
    if (categoryMatches.length > 0) {
      console.log(`${MODULE_ID} | Optimized search: Found ${categoryMatches.length} images in ${creatureType} category`);
      filteredIndex = categoryMatches;
    }
  }

  const fuse = new Fuse(filteredIndex, {
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

  // If no results in filtered category, optionally fall back to full index search
  const fallbackEnabled = TokenReplacerFA.getSetting('fallbackFullSearch');
  if (allResults.length === 0 && filteredIndex !== index && index.length > 0 && fallbackEnabled) {
    console.log(`${MODULE_ID} | No matches in category, searching full index (fallback enabled)...`);
    const fullFuse = new Fuse(index, {
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

    for (const term of searchTerms) {
      const results = fullFuse.search(term);
      for (const result of results) {
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
  }

  // Sort by score (lower is better in Fuse.js)
  allResults.sort((a, b) => (a.score || 0) - (b.score || 0));

  return allResults.slice(0, 20); // Return top 20 matches
}

/**
 * Search result cache for avoiding duplicate searches
 */
const searchCache = new Map();

/**
 * Generate cache key from creature info
 */
function getCreatureCacheKey(creatureInfo) {
  // Use actor name + type as cache key
  return `${creatureInfo.actorName?.toLowerCase() || ''}_${creatureInfo.type || ''}_${creatureInfo.subtype || ''}`;
}

/**
 * Clear search cache
 */
function clearSearchCache() {
  searchCache.clear();
}

/**
 * Combined search across all sources with caching
 * INTELLIGENT AUTO-DETECTION: When subtype is generic (e.g., "any race"),
 * automatically includes category-based results alongside name-based matches
 */
async function searchTokenArt(creatureInfo, localIndex, useCache = true) {
  const searchTerms = creatureInfo.searchTerms;
  if (searchTerms.length === 0) return [];

  // Check cache first
  const cacheKey = getCreatureCacheKey(creatureInfo);
  if (useCache && searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }

  const priority = TokenReplacerFA.getSetting('searchPriority');
  const useTVACache = TokenReplacerFA.getSetting('useTVACache');
  const results = [];

  // If using TVA cache mode, prioritize TVA for all searches
  const useTVAForAll = TokenReplacerFA.hasTVA && useTVACache;

  // Search local index (FA Nexus and other local sources)
  // Only if we have a local index built (not in TVA cache mode)
  if (localIndex.length > 0 && (priority === 'faNexus' || priority === 'both')) {
    const localResults = await searchLocalIndex(searchTerms, localIndex, creatureInfo.type);
    results.push(...localResults);
  }

  // Search Token Variant Art
  // In TVA cache mode, always use TVA regardless of priority setting
  if (TokenReplacerFA.hasTVA && (useTVAForAll || priority === 'forgeBazaar' || priority === 'both')) {
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

  // INTELLIGENT AUTO-DETECTION for subtypes
  // Case 1: Generic subtype ("any race", "any") → use searchByCategory for all category results
  // Case 2: Specific subtypes ("Monk, Human, Elf") → search ONLY those specific terms
  const isGenericSubtype = hasGenericSubtype(creatureInfo.subtype);
  const subtypeTerms = parseSubtypeTerms(creatureInfo.subtype);

  if (subtypeTerms.length > 0 && !isGenericSubtype && creatureInfo.type) {
    // Case 2: Specific subtypes with category - AND logic
    // e.g., "Humanoid (Dwarf, Monk)" → (Humanoid) AND (Dwarf) AND (Monk)
    console.log(`${MODULE_ID} | Auto-detection: Category "${creatureInfo.type}" with subtypes (${subtypeTerms.join(', ')})`);
    console.log(`${MODULE_ID} | Logic: (${creatureInfo.type}) AND (${subtypeTerms.join(' AND ')})`);

    // First, get all results from the category
    const categoryResults = await searchByCategory(creatureInfo.type, localIndex);
    console.log(`${MODULE_ID} | Category "${creatureInfo.type}" returned ${categoryResults.length} results`);

    // Then filter by subtype terms (must match ALL terms - AND logic)
    const filteredResults = categoryResults.filter(result => {
      const nameLower = (result.name || '').toLowerCase();
      const pathLower = (result.path || '').toLowerCase();
      const combinedText = nameLower + ' ' + pathLower;
      // Check if name or path contains ALL of the subtype terms (AND logic)
      return subtypeTerms.every(term => combinedText.includes(term));
    });

    console.log(`${MODULE_ID} | After subtype filter: ${filteredResults.length} results match (${subtypeTerms.join(' AND ')})`);

    for (const result of filteredResults) {
      if (!results.find(r => r.path === result.path)) {
        results.push({
          ...result,
          score: result.score ?? 0.4,
          fromSubtype: true
        });
      }
    }

    console.log(`${MODULE_ID} | Subtype search complete, found ${results.length} total results`);
  } else if (isGenericSubtype && creatureInfo.type) {
    // Case 1: Generic subtype - use searchByCategory for comprehensive results
    console.log(`${MODULE_ID} | Auto-detection: Generic subtype ("${creatureInfo.subtype || 'none'}"), using searchByCategory for ${creatureInfo.type}`);

    const categoryResults = await searchByCategory(creatureInfo.type, localIndex);
    console.log(`${MODULE_ID} | searchByCategory returned ${categoryResults.length} results`);

    for (const result of categoryResults) {
      if (!results.find(r => r.path === result.path)) {
        results.push({
          ...result,
          score: result.score ?? 0.6,
          fromCategory: true
        });
      }
    }

    // Also add ALL local index category matches
    if (localIndex && localIndex.length > 0) {
      const categoryMatches = localIndex.filter(img =>
        img.category && folderMatchesCreatureType(img.category, creatureInfo.type)
      );
      for (const match of categoryMatches) {
        if (!results.find(r => r.path === match.path)) {
          results.push({
            ...match,
            source: 'local',
            score: match.score ?? 0.6,
            fromCategory: true
          });
        }
      }
    }
  }

  // Filter out any results with invalid paths before sorting
  const validResults = results.filter(r => {
    if (!r.path || typeof r.path !== 'string') return false;
    // Path must contain '/' or '.' or start with http to be valid
    return r.path.includes('/') || r.path.includes('.') || r.path.startsWith('http');
  });

  if (validResults.length !== results.length) {
    console.log(`${MODULE_ID} | Filtered out ${results.length - validResults.length} invalid results`);
  }

  // Sort: name-based matches first, then subtype matches, then category matches
  // Within each group, sort by score
  validResults.sort((a, b) => {
    // Priority: name matches > subtype matches > category matches
    const aIsSubtype = a.fromSubtype === true;
    const bIsSubtype = b.fromSubtype === true;
    const aIsCategory = a.fromCategory === true;
    const bIsCategory = b.fromCategory === true;
    const aIsName = !aIsSubtype && !aIsCategory;
    const bIsName = !bIsSubtype && !bIsCategory;

    // Name matches come first
    if (aIsName && !bIsName) return -1;
    if (!aIsName && bIsName) return 1;

    // Then subtype matches
    if (aIsSubtype && bIsCategory) return -1;
    if (aIsCategory && bIsSubtype) return 1;

    // Then apply priority preference within the group
    if (priority === 'faNexus') {
      if (a.source === 'local' && b.source !== 'local') return -1;
      if (a.source !== 'local' && b.source === 'local') return 1;
    } else if (priority === 'forgeBazaar') {
      if (a.source === 'tva' && b.source !== 'tva') return -1;
      if (a.source !== 'tva' && b.source === 'tva') return 1;
    }

    // Finally sort by score (lower is better)
    return (a.score || 0.5) - (b.score || 0.5);
  });

  // Store in cache
  if (useCache) {
    searchCache.set(cacheKey, validResults);
  }

  return validResults;
}

/**
 * Group tokens by creature type for batch processing
 */
function groupTokensByCreature(tokens) {
  const groups = new Map();

  for (const token of tokens) {
    const creatureInfo = extractCreatureInfo(token);
    if (!creatureInfo) continue;

    const key = getCreatureCacheKey(creatureInfo);

    if (!groups.has(key)) {
      groups.set(key, {
        creatureInfo: creatureInfo,
        tokens: [],
        searchTerms: creatureInfo.searchTerms
      });
    }

    groups.get(key).tokens.push(token);
  }

  return groups;
}

/**
 * Perform parallel searches for multiple creature groups
 * Uses Promise.all for concurrent execution
 */
async function parallelSearchCreatures(groups, localIndex, progressCallback = null) {
  const groupArray = Array.from(groups.entries());
  const totalGroups = groupArray.length;
  const results = new Map();

  // Determine concurrency level (max parallel searches)
  const MAX_CONCURRENT = 4;

  // Process in batches
  for (let i = 0; i < groupArray.length; i += MAX_CONCURRENT) {
    const batch = groupArray.slice(i, i + MAX_CONCURRENT);

    // Report progress
    if (progressCallback) {
      const completed = Math.min(i, groupArray.length);
      progressCallback({
        type: 'batch',
        completed: completed,
        total: totalGroups,
        currentBatch: batch.map(([key, group]) => group.creatureInfo.actorName)
      });
    }

    // Execute batch in parallel
    const batchPromises = batch.map(async ([key, group]) => {
      const searchResults = await searchTokenArt(group.creatureInfo, localIndex, true);
      return { key, searchResults, group };
    });

    const batchResults = await Promise.all(batchPromises);

    // Store results
    for (const { key, searchResults, group } of batchResults) {
      results.set(key, {
        matches: searchResults,
        tokens: group.tokens,
        creatureInfo: group.creatureInfo
      });
    }
  }

  return results;
}

/**
 * Create HTML for parallel search progress
 */
function createParallelSearchHTML(completed, total, uniqueTypes, totalTokens, currentBatch = []) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const safeBatch = currentBatch.map(name => escapeHtml(name));

  return `
    <div class="token-replacer-fa-scan-progress">
      <div class="scan-status">
        <i class="fas fa-bolt"></i>
        <span>Parallel Search in Progress...</span>
      </div>

      <div class="scan-stats">
        <div class="stat-item">
          <div class="stat-value">${uniqueTypes}</div>
          <div class="stat-label">Unique Creatures</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${totalTokens}</div>
          <div class="stat-label">Total Tokens</div>
        </div>
      </div>

      <div class="token-replacer-fa-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
        <div class="progress-text">${completed} / ${total} creature types searched</div>
      </div>

      ${currentBatch.length > 0 ? `
        <div class="scan-current">
          <div class="current-label">Currently searching (parallel):</div>
          <div class="parallel-batch">
            ${safeBatch.map(name => `
              <span class="batch-item">
                <i class="fas fa-search fa-spin"></i> ${name}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="optimization-info">
        <i class="fas fa-info-circle"></i>
        <span>Identical creatures share search results for faster processing</span>
      </div>
    </div>
  `;
}

/**
 * Replace token image
 * Uses TVA's updateTokenImage() when available to apply custom configurations
 */
async function replaceTokenImage(token, imagePath) {
  try {
    // Use TVA's updateTokenImage if available - applies custom configs (scale, lighting, effects)
    if (TokenReplacerFA.hasTVA && TokenReplacerFA.tvaAPI?.updateTokenImage) {
      await TokenReplacerFA.tvaAPI.updateTokenImage(imagePath, {
        token: token,
        actor: token.actor,
        imgName: imagePath.split('/').pop()
      });
      return true;
    }

    // Fallback to direct update
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
 * Create match selection HTML (for embedding in main dialog)
 * Supports multi-select for variations with sequential/random assignment
 */
function createMatchSelectionHTML(creatureInfo, matches, tokenCount = 1, hideBrowseButton = false) {
  const safeName = escapeHtml(creatureInfo.actorName);
  const safeType = escapeHtml(creatureInfo.type || 'Unknown');
  const safeSubtype = creatureInfo.subtype ? `(${escapeHtml(creatureInfo.subtype)})` : '';
  const showMultiSelect = tokenCount > 1;
  const creatureTypeDisplay = creatureInfo.type ? creatureInfo.type.charAt(0).toUpperCase() + creatureInfo.type.slice(1) : '';
  const totalCount = matches.length;

  return `
    <div class="token-replacer-fa-token-preview">
      <img src="${escapeHtml(creatureInfo.currentImage)}" alt="${safeName}">
      <div class="token-info">
        <div class="token-name">${safeName}</div>
        <div class="token-type">${safeType} ${safeSubtype}</div>
        ${tokenCount > 1 ? `<div class="token-count">${tokenCount} tokens</div>` : ''}
      </div>
    </div>

    <div class="token-replacer-fa-search-filter">
      <div class="search-input-wrapper">
        <i class="fas fa-search"></i>
        <input type="text" class="search-filter-input" placeholder="Filter (e.g., dwarf monk)..." autocomplete="off">
      </div>
      <div class="result-count">Showing <span class="visible-count">${totalCount}</span> of <span class="total-count">${totalCount}</span> results</div>
    </div>

    ${showMultiSelect ? `
    <div class="token-replacer-fa-mode-toggle">
      <span class="mode-label">Variant assignment:</span>
      <div class="mode-buttons">
        <button type="button" class="mode-btn active" data-mode="sequential">
          <i class="fas fa-arrow-right"></i> Sequential
        </button>
        <button type="button" class="mode-btn" data-mode="random">
          <i class="fas fa-random"></i> Random
        </button>
      </div>
      <span class="mode-hint">Click to select multiple variants</span>
    </div>
    ` : ''}

    <div class="token-replacer-fa-match-select" data-multiselect="${showMultiSelect}" data-total="${totalCount}">
      ${matches.map((match, idx) => {
        const safeMatchName = escapeHtml(match.name);
        const safePath = escapeHtml(match.path);
        const scoreDisplay = match.score !== undefined
          ? `${Math.round((1 - match.score) * 100)}%`
          : escapeHtml(match.source || '');
        return `
          <div class="match-option${idx === 0 ? ' selected' : ''}" data-index="${idx}" data-path="${safePath}" data-name="${safeMatchName.toLowerCase()}">
            <img src="${safePath}" alt="${safeMatchName}" onerror="this.src='icons/svg/mystery-man.svg'">
            <div class="match-name">${safeMatchName}</div>
            <div class="match-score">${scoreDisplay}</div>
            <div class="match-check"><i class="fas fa-check"></i></div>
          </div>
        `;
      }).join('')}
    </div>

    ${showMultiSelect ? `
    <div class="token-replacer-fa-selection-info">
      <span class="selection-count">1 selected</span>
    </div>
    ` : ''}

    <div class="token-replacer-fa-selection-buttons">
      <button type="button" class="select-btn" data-action="select">
        <i class="fas fa-check"></i> Apply
      </button>
      ${creatureInfo.type && !hideBrowseButton ? `
      <button type="button" class="browse-category-btn" data-action="browse" data-type="${escapeHtml(creatureInfo.type)}">
        <i class="fas fa-folder-open"></i> ${TokenReplacerFA.i18n('dialog.browseAll')} ${creatureTypeDisplay}
      </button>
      ` : ''}
      <button type="button" class="skip-btn" data-action="skip">
        <i class="fas fa-forward"></i> ${TokenReplacerFA.i18n('dialog.skip')}
      </button>
    </div>
  `;
}

/**
 * Parse subtype string to extract individual terms
 * Filters out generic terms like "any", "any-race", etc.
 */
function parseSubtypeTerms(subtype) {
  if (!subtype) return [];

  // Generic terms to ignore
  const genericTerms = ['any', 'any-race', 'any race', 'anyrace', 'various', 'none', 'unknown'];

  // Split by comma, semicolon, or "and"
  const parts = subtype.split(/[,;]|\s+and\s+/i)
    .map(p => p.trim().toLowerCase())
    .filter(p => p.length > 0);

  // Filter out generic terms
  const validTerms = parts.filter(term => {
    const termLower = term.toLowerCase();
    return !genericTerms.some(g => termLower.includes(g));
  });

  return validTerms;
}

/**
 * Check if a subtype is purely generic (e.g., "any race", "any", "various")
 * Used for intelligent automatic detection of when to include category results
 * Returns true ONLY if the subtype contains ONLY generic terms (no specific races/classes)
 */
function hasGenericSubtype(subtype) {
  if (!subtype) return true; // No subtype = treat as generic

  const genericTerms = ['any', 'any-race', 'any race', 'anyrace', 'various', 'none', 'unknown'];
  const subtypeLower = subtype.toLowerCase().trim();

  // Check if the entire subtype is just a generic term
  if (genericTerms.some(g => subtypeLower === g)) {
    return true;
  }

  // Check if subtype contains ONLY generic terms (no specific values)
  // Split by comma, semicolon, or "and"
  const parts = subtypeLower.split(/[,;]|\s+and\s+/i)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // If ALL parts are generic, it's generic
  // If ANY part is specific (not in genericTerms), it's NOT generic
  const allGeneric = parts.every(part =>
    genericTerms.some(g => part.includes(g))
  );

  return allGeneric;
}

/**
 * Create HTML for no-match scenario with creature type dropdown
 * Allows user to browse by category when fuzzy search fails
 * Also shows quick search buttons for subtypes (e.g., Dwarf, Monk)
 */
function createNoMatchHTML(creatureInfo, tokenCount = 1) {
  const safeName = escapeHtml(creatureInfo.actorName);
  const safeType = escapeHtml(creatureInfo.type || 'Unknown');
  const safeSubtype = creatureInfo.subtype ? `(${escapeHtml(creatureInfo.subtype)})` : '';

  // Build creature type options from CREATURE_TYPE_MAPPINGS
  const creatureTypes = Object.keys(CREATURE_TYPE_MAPPINGS).sort();

  // Parse subtypes for quick search buttons
  const subtypeTerms = parseSubtypeTerms(creatureInfo.subtype);
  const hasValidSubtypes = subtypeTerms.length > 0;

  return `
    <div class="token-replacer-fa-token-preview">
      <img src="${escapeHtml(creatureInfo.currentImage)}" alt="${safeName}">
      <div class="token-info">
        <div class="token-name">${safeName}</div>
        <div class="token-type">${safeType} ${safeSubtype}</div>
        ${tokenCount > 1 ? `<div class="token-count">${tokenCount} tokens</div>` : ''}
      </div>
    </div>

    <div class="token-replacer-fa-no-match">
      <div class="no-match-message">
        <i class="fas fa-search-minus"></i>
        <span>${TokenReplacerFA.i18n('dialog.noMatch', { name: creatureInfo.actorName })}</span>
      </div>

      ${hasValidSubtypes ? `
      <div class="subtype-search">
        <label>${TokenReplacerFA.i18n('dialog.searchBySubtype')}</label>
        <div class="subtype-buttons">
          ${subtypeTerms.map(term => {
            const displayName = term.charAt(0).toUpperCase() + term.slice(1);
            return `<button type="button" class="subtype-search-btn" data-subtype="${escapeHtml(term)}">
              <i class="fas fa-search"></i> ${escapeHtml(displayName)}
            </button>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <div class="category-search">
        <label for="creature-type-select">${TokenReplacerFA.i18n('dialog.browseByType')}</label>
        <select id="creature-type-select" class="creature-type-select">
          <option value="">${TokenReplacerFA.i18n('dialog.selectType')}</option>
          ${creatureTypes.map(type => {
            const selected = type === creatureInfo.type?.toLowerCase() ? 'selected' : '';
            const displayName = type.charAt(0).toUpperCase() + type.slice(1);
            return `<option value="${type}" ${selected}>${displayName}</option>`;
          }).join('')}
        </select>
        <button type="button" class="search-category-btn">
          <i class="fas fa-search"></i> ${TokenReplacerFA.i18n('dialog.searchCategory')}
        </button>
      </div>

      <div class="category-results" style="display: none;">
        <div class="category-results-loading" style="display: none;">
          <i class="fas fa-spinner fa-spin"></i>
          <span>${TokenReplacerFA.i18n('dialog.searching', { name: '' })}</span>
        </div>
        <div class="token-replacer-fa-search-filter category-filter" style="display: none;">
          <div class="search-input-wrapper">
            <i class="fas fa-search"></i>
            <input type="text" class="category-search-filter-input" placeholder="Filter (e.g., dwarf monk)..." autocomplete="off">
          </div>
          <div class="result-count">Showing <span class="category-visible-count">0</span> of <span class="category-total-count">0</span> results</div>
        </div>
        <div class="token-replacer-fa-match-select" data-multiselect="${tokenCount > 1}">
        </div>
      </div>
    </div>

    ${tokenCount > 1 ? `
    <div class="token-replacer-fa-mode-toggle" style="display: none;">
      <span class="mode-label">Variant assignment:</span>
      <div class="mode-buttons">
        <button type="button" class="mode-btn active" data-mode="sequential">
          <i class="fas fa-arrow-right"></i> Sequential
        </button>
        <button type="button" class="mode-btn" data-mode="random">
          <i class="fas fa-random"></i> Random
        </button>
      </div>
    </div>
    <div class="token-replacer-fa-selection-info" style="display: none;">
      <span class="selection-count">0 selected</span>
    </div>
    ` : ''}

    <div class="token-replacer-fa-selection-buttons">
      <button type="button" class="select-btn" data-action="select" disabled>
        <i class="fas fa-check"></i> Apply
      </button>
      <button type="button" class="skip-btn" data-action="skip">
        <i class="fas fa-forward"></i> ${TokenReplacerFA.i18n('dialog.skip')}
      </button>
    </div>
  `;
}

/**
 * Search for images by creature type category or direct term
 * Returns results from TVA filtered by category folder names
 * @param {string} categoryType - The creature type category (e.g., "humanoid")
 * @param {Array} localIndex - Local image index
 * @param {string} directSearchTerm - Optional direct search term (e.g., "dwarf", "monk")
 */
async function searchByCategory(categoryType, localIndex, directSearchTerm = null) {
  console.log(`${MODULE_ID} | searchByCategory START - type: ${categoryType}, directSearch: ${directSearchTerm}`);
  const results = [];

  // If we have a direct search term (subtype), search for that first
  if (directSearchTerm) {

    if (TokenReplacerFA.hasTVA) {
      const tvaResults = await searchTVA(directSearchTerm);
      for (const result of tvaResults) {
        if (!results.find(r => r.path === result.path)) {
          results.push(result);
        }
      }
    }

    // Also search local index for the term
    if (localIndex && localIndex.length > 0) {
      const termLower = directSearchTerm.toLowerCase();
      const localMatches = localIndex.filter(img =>
        img.name?.toLowerCase().includes(termLower) ||
        img.fileName?.toLowerCase().includes(termLower) ||
        img.category?.toLowerCase().includes(termLower)
      );
      for (const match of localMatches) {
        if (!results.find(r => r.path === match.path)) {
          results.push({
            ...match,
            source: 'local'
          });
        }
      }
    }

    // If we found results with direct term, return them
    if (results.length > 0) {
      return results.slice(0, 50);
    }
    // Otherwise, fall through to category search
  }

  // Category-based search - search ALL related terms for comprehensive results
  // "Browse All Humanoid" needs to find elf, dwarf, wizard, etc.
  console.log(`${MODULE_ID} | Starting comprehensive search for category: ${categoryType}`);

  if (TokenReplacerFA.hasTVA) {
    // Use full CREATURE_TYPE_MAPPINGS to get all related artwork
    const categoryTerms = CREATURE_TYPE_MAPPINGS[categoryType?.toLowerCase()];

    if (categoryTerms) {
      console.log(`${MODULE_ID} | Searching ${categoryTerms.length} terms for ${categoryType}`);

      let searchCount = 0;
      for (const term of categoryTerms) {
        searchCount++;
        // Log progress every 10 terms
        if (searchCount % 10 === 0 || searchCount === categoryTerms.length) {
          console.log(`${MODULE_ID} | Search progress: ${searchCount}/${categoryTerms.length} terms`);
        }

        const tvaResults = await searchTVA(term);
        for (const result of tvaResults) {
          if (!results.find(r => r.path === result.path)) {
            results.push(result);
          }
        }

        // Yield to main thread periodically to keep UI responsive
        if (searchCount % 5 === 0) {
          await yieldToMain(10);
        }
      }
    } else {
      // Fallback to primary terms if no mapping exists
      const primaryTerms = PRIMARY_CATEGORY_TERMS[categoryType?.toLowerCase()];
      if (primaryTerms) {
        console.log(`${MODULE_ID} | No full mapping, using ${primaryTerms.length} primary terms`);
        for (const term of primaryTerms) {
          const tvaResults = await searchTVA(term);
          for (const result of tvaResults) {
            if (!results.find(r => r.path === result.path)) {
              results.push(result);
            }
          }
        }
      }
    }
    console.log(`${MODULE_ID} | TVA search complete, total unique results: ${results.length}`);
  } else {
    console.log(`${MODULE_ID} | TVA not available for category search`);
  }

  // Also search local index by category
  if (localIndex && localIndex.length > 0) {
    const categoryMatches = localIndex.filter(img =>
      img.category && folderMatchesCreatureType(img.category, categoryType)
    );
    for (const match of categoryMatches) {
      if (!results.find(r => r.path === match.path)) {
        results.push({
          ...match,
          source: 'local'
        });
      }
    }
  }

  // Return all results (no limit)
  console.log(`${MODULE_ID} | searchByCategory END - found ${results.length} results for ${categoryType}`);
  return results;
}

/**
 * Setup no-match handlers for category browsing
 * Returns a Promise that resolves with selected paths or null
 */
function setupNoMatchHandlers(dialogElement, creatureInfo, localIndex, tokenCount) {
  return new Promise((resolve) => {
    const container = dialogElement.querySelector('.dialog-content');
    if (!container) {
      resolve(null);
      return;
    }

    let assignmentMode = 'sequential';
    const multiSelectEnabled = tokenCount > 1;

    const selectEl = container.querySelector('.creature-type-select');
    const searchBtn = container.querySelector('.search-category-btn');
    const resultsContainer = container.querySelector('.category-results');
    const matchGrid = container.querySelector('.token-replacer-fa-match-select');
    const loadingEl = container.querySelector('.category-results-loading');
    const selectBtn = container.querySelector('.select-btn');
    const skipBtn = container.querySelector('.skip-btn');
    const modeToggle = container.querySelector('.token-replacer-fa-mode-toggle');
    const selectionInfo = container.querySelector('.token-replacer-fa-selection-info');

    // Update selection count display
    const updateSelectionCount = () => {
      const selectedCount = container.querySelectorAll('.match-option.selected').length;
      const countEl = container.querySelector('.selection-count');
      if (countEl) {
        countEl.textContent = `${selectedCount} selected`;
      }
      // Enable/disable select button
      if (selectBtn) {
        selectBtn.disabled = selectedCount === 0;
      }
    };

    // Handle mode toggle buttons
    const setupModeButtons = () => {
      const modeButtons = container.querySelectorAll('.mode-btn');
      modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          modeButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          assignmentMode = btn.dataset.mode;
        });
      });
    };

    // Setup match option click handlers
    const setupMatchOptions = () => {
      const options = container.querySelectorAll('.match-option');
      options.forEach(option => {
        option.addEventListener('click', () => {
          if (multiSelectEnabled) {
            option.classList.toggle('selected');
            const selectedCount = container.querySelectorAll('.match-option.selected').length;
            if (selectedCount === 0) {
              option.classList.add('selected');
            }
            updateSelectionCount();
          } else {
            options.forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            updateSelectionCount();
          }
        });

        option.addEventListener('dblclick', () => {
          resolve({
            paths: [option.dataset.path],
            mode: 'sequential'
          });
        });
      });
    };

    // Helper function to display search results
    const displayResults = (results) => {
      loadingEl.style.display = 'none';

      // Get filter elements
      const categoryFilter = container.querySelector('.category-filter');
      const categoryVisibleCount = container.querySelector('.category-visible-count');
      const categoryTotalCount = container.querySelector('.category-total-count');
      const categorySearchInput = container.querySelector('.category-search-filter-input');

      if (results.length === 0) {
        if (categoryFilter) categoryFilter.style.display = 'none';
        matchGrid.innerHTML = `
          <div class="no-results-message">
            <i class="fas fa-folder-open"></i>
            <span>${TokenReplacerFA.i18n('dialog.noResultsInCategory')}</span>
          </div>
        `;
        return;
      }

      // Show filter and update counts
      if (categoryFilter) {
        categoryFilter.style.display = 'block';
        if (categoryVisibleCount) categoryVisibleCount.textContent = results.length;
        if (categoryTotalCount) categoryTotalCount.textContent = results.length;
        if (categorySearchInput) categorySearchInput.value = '';
      }

      // Show results
      matchGrid.innerHTML = results.map((match, idx) => {
        const safeMatchName = escapeHtml(match.name);
        const safePath = escapeHtml(match.path);
        const scoreDisplay = match.score !== undefined
          ? `${Math.round((1 - match.score) * 100)}%`
          : escapeHtml(match.source || '');
        return `
          <div class="match-option" data-index="${idx}" data-path="${safePath}" data-name="${safeMatchName.toLowerCase()}">
            <img src="${safePath}" alt="${safeMatchName}" onerror="this.src='icons/svg/mystery-man.svg'">
            <div class="match-name">${safeMatchName}</div>
            <div class="match-score">${scoreDisplay}</div>
            <div class="match-check"><i class="fas fa-check"></i></div>
          </div>
        `;
      }).join('');

      // Show mode toggle and selection info for multi-select
      if (multiSelectEnabled) {
        if (modeToggle) modeToggle.style.display = 'flex';
        if (selectionInfo) selectionInfo.style.display = 'block';
        setupModeButtons();
      }

      // Setup click handlers for new options
      setupMatchOptions();
      updateSelectionCount();

      // Setup category search filter with AND logic (comma, space, colon delimiters)
      if (categorySearchInput) {
        let debounceTimer = null;
        categorySearchInput.addEventListener('input', () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const filterTerms = parseFilterTerms(categorySearchInput.value);
            const allOptions = matchGrid.querySelectorAll('.match-option');
            let visibleCount = 0;

            allOptions.forEach(option => {
              const name = option.dataset.name || '';
              const path = option.dataset.path || '';
              const matches = matchesAllTerms(name + ' ' + path, filterTerms);

              if (matches) {
                option.style.display = '';
                visibleCount++;
              } else {
                option.style.display = 'none';
                option.classList.remove('selected');
              }
            });

            if (categoryVisibleCount) categoryVisibleCount.textContent = visibleCount;

            // Ensure at least one is selected
            const visibleSelected = matchGrid.querySelectorAll('.match-option:not([style*="display: none"]).selected');
            if (visibleSelected.length === 0) {
              const firstVisible = matchGrid.querySelector('.match-option:not([style*="display: none"])');
              if (firstVisible) firstVisible.classList.add('selected');
            }
            updateSelectionCount();
          }, 150);
        });
      }
    };

    // Handle subtype search buttons (e.g., "Dwarf", "Monk")
    const subtypeButtons = container.querySelectorAll('.subtype-search-btn');
    subtypeButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const subtype = btn.dataset.subtype;
        if (!subtype) return;

        // Show loading
        resultsContainer.style.display = 'block';
        loadingEl.style.display = 'flex';
        matchGrid.innerHTML = '';
        selectBtn.disabled = true;

        // Search by subtype (with fallback to creature type category)
        const results = await searchByCategory(creatureInfo.type, localIndex, subtype);

        displayResults(results);
      });
    });

    // Handle search button click (category dropdown)
    if (searchBtn) {
      searchBtn.addEventListener('click', async () => {
        const selectedType = selectEl?.value;
        if (!selectedType) {
          ui.notifications.warn(TokenReplacerFA.i18n('dialog.selectTypeFirst'));
          return;
        }

        // Show loading
        resultsContainer.style.display = 'block';
        loadingEl.style.display = 'flex';
        matchGrid.innerHTML = '';
        selectBtn.disabled = true;

        // Search by category
        const results = await searchByCategory(selectedType, localIndex);
        displayResults(results);
      });
    }

    // Handle select button
    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        const selectedOptions = container.querySelectorAll('.match-option.selected');
        const paths = Array.from(selectedOptions).map(opt => opt.dataset.path);
        if (paths.length > 0) {
          resolve({ paths, mode: assignmentMode });
        } else {
          resolve(null);
        }
      });
    }

    // Handle skip button
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        resolve(null);
      });
    }
  });
}

/**
 * Setup match selection event handlers
 * Returns a Promise that resolves with:
 * - { paths: [array of paths], mode: 'sequential'|'random' }
 * - null (skip)
 * - 'cancel'
 */
function setupMatchSelectionHandlers(dialogElement) {
  return new Promise((resolve) => {
    const container = dialogElement.querySelector('.dialog-content');
    if (!container) {
      console.warn(`${MODULE_ID} | No dialog-content found`);
      resolve(null);
      return;
    }

    let assignmentMode = 'sequential';
    const matchGrid = container.querySelector('.token-replacer-fa-match-select');
    const multiSelectEnabled = matchGrid?.dataset.multiselect === 'true';

    // Update selection count display
    const updateSelectionCount = () => {
      const selectedCount = container.querySelectorAll('.match-option.selected').length;
      const countEl = container.querySelector('.selection-count');
      if (countEl) {
        countEl.textContent = `${selectedCount} selected`;
      }
    };

    // Setup search filter with AND logic (comma, space, colon delimiters)
    const searchInput = container.querySelector('.search-filter-input');
    const visibleCountEl = container.querySelector('.visible-count');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const filterTerms = parseFilterTerms(searchInput.value);
          const allOptions = container.querySelectorAll('.match-option');
          let visibleCount = 0;

          allOptions.forEach(option => {
            const name = option.dataset.name || '';
            const path = option.dataset.path || '';
            const matches = matchesAllTerms(name + ' ' + path, filterTerms);

            if (matches) {
              option.style.display = '';
              visibleCount++;
            } else {
              option.style.display = 'none';
              option.classList.remove('selected');
            }
          });

          if (visibleCountEl) visibleCountEl.textContent = visibleCount;

          // Ensure at least one visible option is selected
          const visibleSelected = container.querySelectorAll('.match-option:not([style*="display: none"]).selected');
          if (visibleSelected.length === 0) {
            const firstVisible = container.querySelector('.match-option:not([style*="display: none"])');
            if (firstVisible) firstVisible.classList.add('selected');
          }
          updateSelectionCount();
        }, 150);
      });
    }

    // Handle mode toggle buttons
    const modeButtons = container.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        assignmentMode = btn.dataset.mode;
      });
    });

    // Handle match option clicks
    const options = container.querySelectorAll('.match-option');
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        if (multiSelectEnabled) {
          // Multi-select mode: toggle selection
          option.classList.toggle('selected');
          // Ensure at least one is selected
          const selectedCount = container.querySelectorAll('.match-option.selected').length;
          if (selectedCount === 0) {
            option.classList.add('selected');
          }
          updateSelectionCount();
        } else {
          // Single-select mode
          options.forEach(o => o.classList.remove('selected'));
          option.classList.add('selected');
        }
      });

      option.addEventListener('dblclick', () => {
        // Double-click always selects just this one and confirms
        resolve({
          paths: [option.dataset.path],
          mode: 'sequential'
        });
      });
    });

    // Handle button clicks
    const selectBtn = container.querySelector('.select-btn');
    const skipBtn = container.querySelector('.skip-btn');

    if (selectBtn) {
      selectBtn.addEventListener('click', () => {
        const selectedOptions = container.querySelectorAll('.match-option.selected');
        const paths = Array.from(selectedOptions).map(opt => opt.dataset.path);
        if (paths.length > 0) {
          resolve({ paths, mode: assignmentMode });
        } else {
          resolve(null);
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        resolve(null);
      });
    }

    // Handle browse category button
    const browseBtn = container.querySelector('.browse-category-btn');
    console.log(`${MODULE_ID} | Browse button found:`, browseBtn ? 'YES' : 'NO');
    if (browseBtn) {
      console.log(`${MODULE_ID} | Browse button data-type:`, browseBtn.dataset.type);
      browseBtn.addEventListener('click', () => {
        const creatureType = browseBtn.dataset.type;
        console.log(`${MODULE_ID} | Browse button clicked, type: ${creatureType}`);
        resolve({ action: 'browse', type: creatureType });
      });
    }
  });
}

/**
 * Create progress HTML with escaped content
 * Shows real-time results as tokens are processed
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

  // Always show summary counts (live updating)
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
  `;

  // Always show results list (scrollable, shows real-time updates)
  if (results.length > 0) {
    html += `
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
              ${safeMatch ? `<div class="result-match">→ ${safeMatch}</div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  return html;
}

/**
 * Main dialog instance - single dialog used throughout the process
 */
let mainDialog = null;

/**
 * Update main dialog content without closing it
 */
function updateMainDialogContent(content) {
  if (!mainDialog) return;

  try {
    // Update the content in dialog data
    mainDialog.data.content = content;

    // Find the content element and update it directly
    const dialogElement = mainDialog.element?.[0];
    if (dialogElement) {
      const contentEl = dialogElement.querySelector('.dialog-content');
      if (contentEl) {
        contentEl.innerHTML = content;
      }
    }
  } catch (e) {
    // Dialog might be in transition
  }
}

/**
 * Main replacement process with parallel search optimization
 * Uses a SINGLE dialog throughout the entire process
 */
async function processTokenReplacement() {
  if (TokenReplacerFA.isProcessing) {
    ui.notifications.warn(TokenReplacerFA.i18n('notifications.inProgress'));
    return;
  }

  TokenReplacerFA.isProcessing = true;

  // Clear search cache at start
  clearSearchCache();

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

  // Create the SINGLE main dialog that will be used throughout
  mainDialog = new Dialog({
    title: TokenReplacerFA.i18n('dialog.title'),
    content: createScanProgressHTML('Initializing...', 0, 0, 0, 0),
    buttons: {},
    close: () => {
      TokenReplacerFA.isProcessing = false;
      mainDialog = null;
    }
  }, {
    classes: ['token-replacer-fa-dialog'],
    width: 500,
    height: 'auto',
    resizable: true
  });
  mainDialog.render(true);
  await yieldToMain(100);

  // PHASE 1: Build token index
  // Optimization: Skip manual scanning if TVA is available and useTVACache is enabled
  const useTVACache = TokenReplacerFA.getSetting('useTVACache');
  const refreshTVACache = TokenReplacerFA.getSetting('refreshTVACache');
  let localIndex = [];

  if (TokenReplacerFA.hasTVA && useTVACache) {
    // Use TVA's cache - much faster!
    console.log(`${MODULE_ID} | Using TVA cache (skipping manual directory scan)`);

    updateMainDialogContent(`
      <div class="token-replacer-fa-scan-progress">
        <div class="scan-status">
          <i class="fas fa-bolt"></i>
          <span>Using Token Variant Art cache...</span>
        </div>
        <div class="optimization-info">
          <i class="fas fa-info-circle"></i>
          <span>Leveraging TVA's pre-built image index for faster search</span>
        </div>
      </div>
    `);
    await yieldToMain(100);

    // Optionally refresh TVA cache before search
    if (refreshTVACache && TokenReplacerFA.tvaAPI?.cacheImages) {
      updateMainDialogContent(`
        <div class="token-replacer-fa-scan-progress">
          <div class="scan-status">
            <i class="fas fa-sync fa-spin"></i>
            <span>Refreshing TVA cache...</span>
          </div>
          <p style="text-align: center; color: #888; margin-top: 10px;">
            This may take a moment for large image libraries
          </p>
        </div>
      `);
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
    // Fallback: Build local token index with progress (manual scanning)
    console.log(`${MODULE_ID} | Building local token index (TVA cache not available or disabled)`);
    localIndex = await buildLocalTokenIndex(mainDialog);
  }

  // Check if we have any search sources available
  if (!TokenReplacerFA.hasTVA && localIndex.length === 0) {
    updateMainDialogContent(`
      <div class="token-replacer-fa-scan-progress">
        <div class="scan-status" style="color: #f87171;">
          <i class="fas fa-exclamation-triangle"></i>
          <span>${TokenReplacerFA.i18n('notifications.missingDeps')}</span>
        </div>
        <p style="text-align: center; color: #888; margin-top: 15px;">
          Install Token Variant Art or FA Nexus module, or configure additional search paths in settings.
        </p>
      </div>
    `);
    return;
  }

  // Group tokens by creature type for optimization
  const creatureGroups = groupTokensByCreature(npcTokens);
  const uniqueCreatures = creatureGroups.size;

  console.log(`${MODULE_ID} | Found ${uniqueCreatures} unique creature types among ${npcTokens.length} tokens`);

  // PHASE 2: Parallel search - update the same dialog
  updateMainDialogContent(createParallelSearchHTML(0, uniqueCreatures, uniqueCreatures, npcTokens.length, []));
  await yieldToMain(50);

  // Perform parallel searches for all creature types
  const searchResults = await parallelSearchCreatures(creatureGroups, localIndex, (info) => {
    if (info.type === 'batch' && mainDialog) {
      updateMainDialogContent(createParallelSearchHTML(
        info.completed,
        info.total,
        uniqueCreatures,
        npcTokens.length,
        info.currentBatch
      ));
    }
  });

  // PHASE 3: Process tokens with cached search results
  const results = [];
  const autoReplace = TokenReplacerFA.getSetting('autoReplace');
  const confirmReplace = TokenReplacerFA.getSetting('confirmReplace');
  const threshold = TokenReplacerFA.getSetting('fuzzyThreshold');

  const updateProgress = (current, total, status, result = null) => {
    if (result) results.push(result);
    const content = createProgressHTML(current, total, status, results);
    updateMainDialogContent(content);
  };

  // Show initial progress
  updateProgress(0, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), null);
  await yieldToMain(50);

  // Process each token using cached results
  let tokenIndex = 0;
  let cancelled = false;

  for (const [key, data] of searchResults) {
    if (cancelled || !mainDialog) break;

    const { matches, tokens, creatureInfo } = data;

    // If no matches for this creature type, show category browser UI
    if (matches.length === 0) {
      // Show no-match UI with category dropdown
      updateMainDialogContent(createNoMatchHTML(creatureInfo, tokens.length));
      await yieldToMain(50);

      // Wait for user to browse by category or skip
      const dialogEl = mainDialog?.element?.[0];
      let selectionResult = null;

      if (dialogEl) {
        selectionResult = await setupNoMatchHandlers(dialogEl, creatureInfo, localIndex, tokens.length);
      }

      // Process the selection result
      if (selectionResult && selectionResult.paths && selectionResult.paths.length > 0) {
        // User selected artwork from category browser
        const selectedPaths = selectionResult.paths;
        const assignmentMode = selectionResult.mode || 'sequential';
        let pathIndex = 0;

        const shuffledPaths = assignmentMode === 'random'
          ? [...selectedPaths].sort(() => Math.random() - 0.5)
          : selectedPaths;

        for (const token of tokens) {
          if (cancelled || !mainDialog) break;
          tokenIndex++;

          const pathForToken = shuffledPaths[pathIndex % shuffledPaths.length];
          const matchName = pathForToken.split('/').pop().replace(/\.[^/.]+$/, '');

          const success = await replaceTokenImage(token, pathForToken);
          updateProgress(tokenIndex, npcTokens.length,
            TokenReplacerFA.i18n('dialog.replacing'), {
            name: `${creatureInfo.actorName} (${token.name})`,
            status: success ? 'success' : 'failed',
            match: matchName
          });

          pathIndex++;
        }
      } else {
        // User skipped - mark all as skipped
        for (const token of tokens) {
          tokenIndex++;
          updateProgress(tokenIndex, npcTokens.length,
            TokenReplacerFA.i18n('dialog.skipped'), {
            name: `${creatureInfo.actorName} (${token.name})`,
            status: 'skipped'
          });
        }
      }

      // Restore progress view
      updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), null);
      await yieldToMain(50);
      continue;
    }

    // Get best match for this creature type
    const bestMatch = matches[0];
    const matchScore = bestMatch.score !== undefined ? (1 - bestMatch.score) : 0.8;

    // Determine paths to use (can be multiple for variations)
    let selectedPaths = null;
    let assignmentMode = 'sequential';

    if (autoReplace && matchScore >= (1 - threshold)) {
      // High confidence match, auto-replace all tokens of this type
      selectedPaths = [bestMatch.path];
    } else if (confirmReplace) {
      // Check if results are primarily from category (generic subtype like "Any race")
      const isCategoryResults = matches.length > 50 && matches.some(m => m.fromCategory);
      // Check if results are from specific subtypes (like "Dwarf, Monk")
      const isSubtypeResults = matches.some(m => m.fromSubtype);
      // Hide Browse All button when showing category/subtype results (already filtered)
      const hideBrowseAll = isCategoryResults || isSubtypeResults;

      // Show selection UI in the SAME dialog (pass token count for multi-select)
      updateMainDialogContent(createMatchSelectionHTML(
        creatureInfo,
        matches,
        tokens.length,
        hideBrowseAll
      ));
      await yieldToMain(50);

      // Wait for user selection
      const dialogEl = mainDialog?.element?.[0];
      if (dialogEl) {
        let selectionResult = await setupMatchSelectionHandlers(dialogEl);

        if (selectionResult === 'cancel') {
          cancelled = true;
          break;
        }

        // Handle "Browse All [Category]" button click
        if (selectionResult && selectionResult.action === 'browse') {
          const browseType = selectionResult.type;
          console.log(`${MODULE_ID} | Browse All clicked for: ${browseType}`);

          // Show loading message
          updateMainDialogContent(`
            <div class="token-replacer-fa-scan-progress">
              <div class="scan-status">
                <i class="fas fa-search fa-spin"></i>
                <span>Searching all ${browseType} artwork...</span>
              </div>
            </div>
          `);
          await yieldToMain(50);

          // Search by category
          const categoryResults = await searchByCategory(browseType, localIndex);
          console.log(`${MODULE_ID} | Browse All found ${categoryResults.length} results for ${browseType}`);

          if (categoryResults.length > 0) {
            // Show category results in the same dialog (hide Browse All to avoid recursion)
            updateMainDialogContent(createMatchSelectionHTML(
              creatureInfo,
              categoryResults,
              tokens.length,
              true // hideBrowseButton - already showing all category results
            ));
            await yieldToMain(50);

            // Wait for selection from category results
            const categoryDialogEl = mainDialog?.element?.[0];
            if (categoryDialogEl) {
              selectionResult = await setupMatchSelectionHandlers(categoryDialogEl);
            }
          } else {
            // No results found - show message and let user skip
            updateMainDialogContent(`
              <div class="token-replacer-fa-no-match">
                <div class="no-match-message">
                  <i class="fas fa-search-minus"></i>
                  <span>No artwork found for ${browseType}</span>
                </div>
              </div>
              <div class="token-replacer-fa-selection-buttons">
                <button type="button" class="skip-btn" data-action="skip">
                  <i class="fas fa-forward"></i> ${TokenReplacerFA.i18n('dialog.skip')}
                </button>
              </div>
            `);
            await yieldToMain(50);

            // Wait for skip
            const skipDialogEl = mainDialog?.element?.[0];
            if (skipDialogEl) {
              const skipBtn = skipDialogEl.querySelector('.skip-btn');
              if (skipBtn) {
                await new Promise(resolve => {
                  skipBtn.addEventListener('click', () => resolve());
                });
              }
            }
            selectionResult = null;
          }
        }

        if (selectionResult && selectionResult.paths) {
          selectedPaths = selectionResult.paths;
          assignmentMode = selectionResult.mode || 'sequential';
        }
      }

      // Restore progress view
      updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), null);
      await yieldToMain(50);
    } else {
      // No confirmation, use best match
      selectedPaths = [bestMatch.path];
    }

    // Apply selected paths to tokens of this creature type
    // Use sequential or random assignment based on user choice
    let pathIndex = 0;
    const shuffledPaths = assignmentMode === 'random' && selectedPaths
      ? [...selectedPaths].sort(() => Math.random() - 0.5)
      : selectedPaths;

    for (const token of tokens) {
      if (cancelled || !mainDialog) break;

      tokenIndex++;

      if (shuffledPaths && shuffledPaths.length > 0) {
        // Get path for this token (cycle through if multiple)
        const pathForToken = shuffledPaths[pathIndex % shuffledPaths.length];
        const matchName = pathForToken.split('/').pop().replace(/\.[^/.]+$/, '');

        // Replace the token
        const success = await replaceTokenImage(token, pathForToken);
        updateProgress(tokenIndex, npcTokens.length,
          TokenReplacerFA.i18n('dialog.replacing'), {
          name: `${creatureInfo.actorName} (${token.name})`,
          status: success ? 'success' : 'failed',
          match: matchName
        });

        pathIndex++;
      } else {
        // Skipped
        updateProgress(tokenIndex, npcTokens.length, TokenReplacerFA.i18n('dialog.skipped'), {
          name: `${creatureInfo.actorName} (${token.name})`,
          status: 'skipped'
        });
      }
    }
  }

  // Final update
  if (!cancelled && mainDialog) {
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    updateProgress(npcTokens.length, npcTokens.length,
      TokenReplacerFA.i18n('dialog.complete'), null);

    ui.notifications.info(
      TokenReplacerFA.i18n('notifications.complete', { count: successCount })
    );

    // Log summary if there were issues
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
