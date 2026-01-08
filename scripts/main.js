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
 * D&D 5e creature types mapped to common FA folder names
 * FA folders often use capitalized singular forms
 */
const CREATURE_TYPE_MAPPINGS = {
  'aberration': ['aberration', 'aberrations', 'mind flayer', 'beholder'],
  'beast': ['beast', 'beasts', 'animal', 'animals'],
  'celestial': ['celestial', 'celestials', 'angel', 'angels'],
  'construct': ['construct', 'constructs', 'golem', 'golems', 'robot'],
  'dragon': ['dragon', 'dragons', 'drake', 'drakes', 'wyrm'],
  'elemental': ['elemental', 'elementals', 'genie', 'genies'],
  'fey': ['fey', 'fairy', 'fairies', 'sprite', 'pixie'],
  'fiend': ['fiend', 'fiends', 'demon', 'demons', 'devil', 'devils'],
  'giant': ['giant', 'giants', 'ogre', 'ogres', 'troll', 'trolls'],
  'humanoid': ['humanoid', 'humanoids', 'human', 'npc', 'goblin', 'orc', 'elf', 'dwarf'],
  'monstrosity': ['monstrosity', 'monstrosities', 'monster', 'monsters'],
  'ooze': ['ooze', 'oozes', 'slime', 'slimes'],
  'plant': ['plant', 'plants', 'fungus', 'fungi'],
  'undead': ['undead', 'zombie', 'zombies', 'skeleton', 'skeletons', 'ghost', 'ghosts', 'vampire', 'lich']
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
    if (!results) return [];

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
    // Handle Map results
    else if (results instanceof Map || (results && typeof results.entries === 'function')) {
      for (const [key, data] of results.entries()) {
        // With simpleResults: false, the key is typically the path and data is metadata
        let imagePath = null;

        // Key is the path string
        if (typeof key === 'string' && key.length > 0 && (key.includes('/') || key.includes('.'))) {
          imagePath = key;
        }
        // Key is an object containing path
        else if (typeof key === 'object' && key !== null) {
          imagePath = key.path || key.src || key.img || key.route || key.thumb;
        }

        // If key didn't have path, check data
        if (!imagePath) {
          imagePath = extractPathFromTVAResult(data);
        }

        // Also check if data itself is a string path
        if (!imagePath && typeof data === 'string' && (data.includes('/') || data.includes('.'))) {
          imagePath = data;
        }

        const name = extractNameFromTVAResult(data, imagePath) || extractNameFromTVAResult(key, imagePath);

        if (imagePath) {
          searchResults.push({
            path: imagePath,
            name: name,
            source: 'tva'
          });
        } else {
          console.warn(`${MODULE_ID} | TVA: Could not extract path - key:`, key, 'data:', data);
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

    console.log(`${MODULE_ID} | TVA search for "${searchTerm}" found ${searchResults.length} valid results`);
    return searchResults;
  } catch (error) {
    console.warn(`${MODULE_ID} | TVA search error:`, error);
    return [];
  }
}

/**
 * Extract image path from a TVA result item
 */
function extractPathFromTVAResult(item) {
  if (!item) return null;

  // String path directly
  if (typeof item === 'string' && (item.includes('/') || item.includes('.') || item.startsWith('http'))) {
    return item;
  }

  // Object with path properties
  if (typeof item === 'object') {
    // Common property names for image paths
    const pathProps = ['path', 'src', 'img', 'image', 'route', 'thumb', 'thumbnail', 'url', 'uri'];
    for (const prop of pathProps) {
      if (item[prop] && typeof item[prop] === 'string') {
        return item[prop];
      }
    }

    // Check nested properties
    if (item.data && typeof item.data === 'object') {
      for (const prop of pathProps) {
        if (item.data[prop] && typeof item.data[prop] === 'string') {
          return item.data[prop];
        }
      }
    }
  }

  return null;
}

/**
 * Extract name from a TVA result item
 */
function extractNameFromTVAResult(item, imagePath) {
  if (!item) {
    // Try to extract from path
    if (imagePath && typeof imagePath === 'string' && imagePath.includes('/')) {
      return imagePath.split('/').pop().replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    }
    return 'Unknown';
  }

  // Object with name properties
  if (typeof item === 'object') {
    const nameProps = ['name', 'label', 'title', 'displayName', 'filename'];
    for (const prop of nameProps) {
      if (item[prop] && typeof item[prop] === 'string') {
        return item[prop];
      }
    }
  }

  // Extract from path
  if (imagePath && typeof imagePath === 'string' && imagePath.includes('/')) {
    return imagePath.split('/').pop().replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
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
  const results = [];

  // Search local index (FA Nexus and other local sources)
  // Optimized: passes creature type for category-based filtering
  if (priority === 'faNexus' || priority === 'both') {
    const localResults = await searchLocalIndex(searchTerms, localIndex, creatureInfo.type);
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

  // Filter out any results with invalid paths before sorting
  const validResults = results.filter(r => {
    if (!r.path || typeof r.path !== 'string') return false;
    // Path must contain '/' or '.' or start with http to be valid
    return r.path.includes('/') || r.path.includes('.') || r.path.startsWith('http');
  });

  if (validResults.length !== results.length) {
    console.log(`${MODULE_ID} | Filtered out ${results.length - validResults.length} invalid results`);
  }

  // Sort based on priority preference
  if (priority === 'faNexus') {
    validResults.sort((a, b) => {
      if (a.source === 'local' && b.source !== 'local') return -1;
      if (a.source !== 'local' && b.source === 'local') return 1;
      return (a.score || 0.5) - (b.score || 0.5);
    });
  } else if (priority === 'forgeBazaar') {
    validResults.sort((a, b) => {
      if (a.source === 'tva' && b.source !== 'tva') return -1;
      if (a.source !== 'tva' && b.source === 'tva') return 1;
      return (a.score || 0.5) - (b.score || 0.5);
    });
  } else {
    // 'both' - sort by score only
    validResults.sort((a, b) => (a.score || 0.5) - (b.score || 0.5));
  }

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
      height: 'auto',
      resizable: true
    });

    dialogInstance.render(true);
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
 * Main replacement process with parallel search optimization
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
    width: 450,
    height: 'auto',
    resizable: true
  });
  scanDialog.render(true);
  await yieldToMain(50); // Let dialog render

  // Build local token index (FA Nexus and other local sources) with progress
  const localIndex = await buildLocalTokenIndex(scanDialog);

  // Close scan dialog safely
  await closeDialogSafely(scanDialog);
  scanDialog = null;

  // Check if we have any search sources available
  if (!TokenReplacerFA.hasTVA && localIndex.length === 0) {
    ui.notifications.warn(TokenReplacerFA.i18n('notifications.missingDeps'));
    TokenReplacerFA.isProcessing = false;
    return;
  }

  // Group tokens by creature type for optimization
  const creatureGroups = groupTokensByCreature(npcTokens);
  const uniqueCreatures = creatureGroups.size;

  console.log(`${MODULE_ID} | Found ${uniqueCreatures} unique creature types among ${npcTokens.length} tokens`);

  // Show parallel search dialog if multiple unique creatures
  let searchDialog = new Dialog({
    title: TokenReplacerFA.i18n('dialog.title'),
    content: createParallelSearchHTML(0, uniqueCreatures, uniqueCreatures, npcTokens.length, []),
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
    width: 480,
    height: 'auto',
    resizable: true
  });
  searchDialog.render(true);
  await yieldToMain(50); // Let dialog render

  // Perform parallel searches for all creature types
  const searchResults = await parallelSearchCreatures(creatureGroups, localIndex, (info) => {
    if (info.type === 'batch' && searchDialog) {
      const content = createParallelSearchHTML(
        info.completed,
        info.total,
        uniqueCreatures,
        npcTokens.length,
        info.currentBatch
      );
      searchDialog.data.content = content;
      searchDialog.render(true);
    }
  });

  // Close search dialog safely
  await closeDialogSafely(searchDialog);
  searchDialog = null;

  // Now process tokens with cached search results
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
      try {
        progressDialog.data.content = progressContent;
        progressDialog.render(true);
      } catch (e) {
        // Dialog might be in transition
      }
    }
  };

  // Show token replacement progress dialog
  await yieldToMain(50); // Ensure previous dialog is fully closed

  progressDialog = new Dialog({
    title: TokenReplacerFA.i18n('dialog.title'),
    content: createProgressHTML(0, npcTokens.length, TokenReplacerFA.i18n('dialog.replacing'), []),
    buttons: {
      close: {
        icon: '<i class="fas fa-times"></i>',
        label: TokenReplacerFA.i18n('dialog.close'),
        callback: () => {}
      }
    },
    close: () => {}
  }, {
    classes: ['token-replacer-fa-dialog'],
    width: 450,
    height: 'auto',
    resizable: true
  });
  progressDialog.render(true);
  await yieldToMain(50); // Let dialog render before processing

  // Process each token using cached results
  let tokenIndex = 0;
  for (const [key, data] of searchResults) {
    const { matches, tokens, creatureInfo } = data;

    // If no matches for this creature type, mark all tokens as failed
    if (matches.length === 0) {
      for (const token of tokens) {
        tokenIndex++;
        updateProgress(tokenIndex, npcTokens.length,
          TokenReplacerFA.i18n('dialog.noMatch', { name: creatureInfo.actorName }), {
          name: creatureInfo.actorName,
          status: 'failed'
        });
      }
      continue;
    }

    // Get best match for this creature type
    const bestMatch = matches[0];
    const matchScore = bestMatch.score !== undefined ? (1 - bestMatch.score) : 0.8;

    // Determine path to use
    let selectedPath = null;

    if (autoReplace && matchScore >= (1 - threshold)) {
      // High confidence match, auto-replace all tokens of this type
      selectedPath = bestMatch.path;
    } else if (confirmReplace) {
      // Show selection dialog once for this creature type
      await closeDialogSafely(progressDialog);
      progressDialog = null;

      selectedPath = await showMatchSelectionDialog(creatureInfo, matches);

      if (selectedPath === 'cancel') {
        // User cancelled the entire operation
        TokenReplacerFA.isProcessing = false;
        return;
      }

      // Re-create progress dialog
      progressDialog = new Dialog({
        title: TokenReplacerFA.i18n('dialog.title'),
        content: progressContent,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: TokenReplacerFA.i18n('dialog.close')
          }
        }
      }, {
        classes: ['token-replacer-fa-dialog'],
        width: 450,
        height: 'auto',
        resizable: true
      });
      progressDialog.render(true);
      await yieldToMain(50);
    } else {
      // No confirmation, use best match
      selectedPath = bestMatch.path;
    }

    // Apply selected path to ALL tokens of this creature type
    for (const token of tokens) {
      tokenIndex++;

      if (selectedPath) {
        // Replace the token
        const success = await replaceTokenImage(token, selectedPath);
        updateProgress(tokenIndex, npcTokens.length,
          TokenReplacerFA.i18n('dialog.replacing'), {
          name: `${creatureInfo.actorName} (${token.name})`,
          status: success ? 'success' : 'failed',
          match: bestMatch.name
        });
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
