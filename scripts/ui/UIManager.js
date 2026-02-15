/**
 * Token Replacer FA - UI Manager
 * Handles all dialog creation, HTML generation, and event handling
 * @module ui/UIManager
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS, MAX_DISPLAY_RESULTS } from '../core/Constants.js';
import { escapeHtml, parseFilterTerms, matchesAllTerms, renderModuleTemplate } from '../core/Utils.js';

// i18n cache to avoid repeated localization lookups
const I18N_CACHE = new Map();

// Cache statistics for debugging
const I18N_CACHE_STATS = {
  hits: 0,
  misses: 0
};

// Filter persistence key for session-only localStorage
const FILTER_CACHE_KEY = 'token-replacer-fa-filter-term';

/**
 * Get localized string
 * Caches base strings to avoid repeated game.i18n.localize() calls
 * @param {string} key - Localization key
 * @param {Object} data - Replacement data
 * @returns {string} Localized string
 */
function i18n(key, data = {}) {
  // Check cache first
  let str = I18N_CACHE.get(key);

  if (!str) {
    // Cache miss - localize and store
    str = game.i18n.localize(`TOKEN_REPLACER_FA.${key}`);
    I18N_CACHE.set(key, str);
    I18N_CACHE_STATS.misses++;
  } else {
    // Cache hit
    I18N_CACHE_STATS.hits++;
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
function logI18nCacheStats() {
  const total = I18N_CACHE_STATS.hits + I18N_CACHE_STATS.misses;
  const hitRate = total > 0 ? ((I18N_CACHE_STATS.hits / total) * 100).toFixed(1) : 0;
  console.log(`${MODULE_ID} | UIManager i18n cache stats: ${I18N_CACHE.size} entries, ${I18N_CACHE_STATS.hits} hits, ${I18N_CACHE_STATS.misses} misses (${hitRate}% hit rate)`);
}

/**
 * Save filter term to localStorage for session persistence
 * @param {string} filterTerm - Filter term to save
 */
function saveFilterTerm(filterTerm) {
  try {
    if (filterTerm && filterTerm.trim().length > 0) {
      localStorage.setItem(FILTER_CACHE_KEY, filterTerm);
    } else {
      localStorage.removeItem(FILTER_CACHE_KEY);
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to save filter term:`, error);
  }
}

/**
 * Load filter term from localStorage
 * @returns {string} Saved filter term or empty string
 */
function loadFilterTerm() {
  try {
    return localStorage.getItem(FILTER_CACHE_KEY) || '';
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to load filter term:`, error);
    return '';
  }
}

/**
 * Clear filter term from localStorage
 */
function clearFilterTerm() {
  try {
    localStorage.removeItem(FILTER_CACHE_KEY);
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to clear filter term:`, error);
  }
}

/**
 * TokenReplacerDialog - ApplicationV2-based dialog for Token Replacer FA
 * Replaces deprecated V1 Dialog API with modern ApplicationV2
 * Compatible with Foundry VTT v12-v13
 */
class TokenReplacerDialog extends foundry.applications.api.ApplicationV2 {
  /**
   * @param {Object} options - Dialog options
   * @param {string} options.content - HTML content for the dialog
   * @param {Function} options.onClose - Callback when dialog closes
   */
  constructor(options = {}) {
    super(options);
    this._dialogContent = options.content || '';
    this._onCloseCallback = options.onClose;
  }

  static DEFAULT_OPTIONS = {
    id: 'token-replacer-fa-dialog',
    classes: ['token-replacer-fa-dialog'],
    window: {
      title: 'Token Replacer FA',
      resizable: true,
      minimizable: false
    },
    position: {
      width: 500,
      height: 'auto'
    }
  };

  /**
   * Prepare rendering context data
   * @param {Object} options - Render options
   * @returns {Promise<Object>} Context data for template
   */
  async _prepareContext(options) {
    return { content: this._dialogContent };
  }

  /**
   * Render the dialog content as an HTMLElement
   * ApplicationV2 requires _renderHTML to return DOM elements, not strings
   * @param {Object} context - Rendering context
   * @param {Object} options - Rendering options
   * @returns {Promise<HTMLElement>} Rendered DOM element
   */
  async _renderHTML(context, options) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('dialog-content');
    wrapper.innerHTML = context.content;
    return wrapper;
  }

  /**
   * Replace the dialog content in the DOM
   * Required by ApplicationV2 to handle both initial render and re-renders
   * @param {HTMLElement} result - New content from _renderHTML
   * @param {HTMLElement} content - The application's content element
   * @param {Object} options - Rendering options
   */
  _replaceHTML(result, content, options) {
    const existing = content.querySelector('.dialog-content');
    if (existing) {
      existing.replaceWith(result);
    } else {
      content.appendChild(result);
    }
  }

  /**
   * Actions performed when the dialog is closed
   * @param {Object} options - Close options
   */
  async _onClose(options) {
    await super._onClose(options);
    this._onCloseCallback?.();
  }

  /**
   * Update dialog content directly via DOM manipulation
   * Avoids full re-render cycle for better performance during frequent updates
   * @param {string} html - New HTML content
   */
  updateContent(html) {
    this._dialogContent = html;
    if (!this.rendered) return;
    const el = this.element?.querySelector('.dialog-content');
    if (el) {
      el.innerHTML = html;
    }
  }

  /**
   * Get the dialog's root element
   * @returns {HTMLElement|null} The dialog element
   */
  getDialogElement() {
    return this.element;
  }

  /**
   * Check if dialog is currently rendered and open
   * @returns {boolean} True if dialog is rendered
   */
  isOpen() {
    return this.rendered;
  }
}

/**
 * UIManager class for handling all UI operations
 */
export class UIManager {
  constructor() {
    this.mainDialog = null;
    this.cancelCallback = null;
  }

  /**
   * Create scan progress HTML
   * @param {string} currentDir - Current directory being scanned
   * @param {number} dirsScanned - Number of directories scanned
   * @param {number} imagesFound - Number of images found
   * @param {number} filesInDir - Files in current directory
   * @param {number} subDirs - Subdirectories count
   * @param {string} currentFile - Current file being processed
   * @returns {Promise<string>} HTML string
   */
  async createScanProgressHTML(currentDir, dirsScanned, imagesFound, filesInDir, subDirs, currentFile = null) {
    const shortDir = currentDir.length > 50
      ? '...' + currentDir.substring(currentDir.length - 47)
      : currentDir;

    return await renderModuleTemplate(
      `modules/${MODULE_ID}/templates/scan-progress.hbs`,
      {
        currentDir,
        shortDir,
        dirsScanned,
        imagesFound,
        filesInDir,
        subDirs,
        currentFile,
        showDirInfo: filesInDir > 0
      }
    );
  }

  /**
   * Create parallel search progress HTML
   * @param {number} completed - Completed searches
   * @param {number} total - Total searches
   * @param {number} uniqueTypes - Unique creature types
   * @param {number} totalTokens - Total tokens
   * @param {string[]} currentBatch - Currently searching batch
   * @returns {Promise<string>} HTML string
   */
  async createParallelSearchHTML(completed, total, uniqueTypes, totalTokens, currentBatch = []) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return await renderModuleTemplate(
      `modules/${MODULE_ID}/templates/parallel-search.hbs`,
      {
        percent,
        completed,
        total,
        uniqueTypes,
        totalTokens,
        currentBatch,
        hasBatch: currentBatch.length > 0
      }
    );
  }

  /**
   * Create match selection HTML
   * @param {Object} creatureInfo - Creature information
   * @param {Array} matches - Match results
   * @param {number} tokenCount - Number of tokens
   * @returns {Promise<string>} HTML string
   */
  async createMatchSelectionHTML(creatureInfo, matches, tokenCount = 1) {
    const showMultiSelect = tokenCount > 1;
    const totalCount = matches.length;

    // Cap displayed results to prevent UI freeze (12K+ results = DOM + image loading storm)
    const displayMatches = matches.length > MAX_DISPLAY_RESULTS
      ? matches.slice(0, MAX_DISPLAY_RESULTS)
      : matches;
    const isCapped = matches.length > MAX_DISPLAY_RESULTS;

    // Transform matches array with computed fields
    const transformedMatches = displayMatches.map((match, idx) => {
      const scoreDisplay = match.score !== undefined
        ? `${Math.round((1 - match.score) * 100)}%`
        : (match.source || '');
      return {
        index: idx,
        path: match.path,
        name: match.name,
        nameLower: match.name.toLowerCase(),
        scoreDisplay,
        isFirst: idx === 0
      };
    });

    // Restore filter term from localStorage for session persistence
    const savedFilterTerm = loadFilterTerm();

    return await renderModuleTemplate(
      `modules/${MODULE_ID}/templates/match-selection.hbs`,
      {
        currentImage: creatureInfo.currentImage,
        actorName: creatureInfo.actorName,
        type: creatureInfo.type || 'Unknown',
        subtype: creatureInfo.subtype || '',
        tokenCount,
        showTokenCount: tokenCount > 1,
        showMultiSelect,
        totalCount,
        displayCount: displayMatches.length,
        isCapped,
        matches: transformedMatches,
        skipLabel: i18n('dialog.skip'),
        savedFilterTerm
      }
    );
  }

  /**
   * Create no-match HTML with category browser
   * @param {Object} creatureInfo - Creature information
   * @param {number} tokenCount - Number of tokens
   * @returns {Promise<string>} HTML string
   */
  async createNoMatchHTML(creatureInfo, tokenCount = 1) {
    const showMultiSelect = tokenCount > 1;

    // Transform creature types array with display names
    const creatureTypes = Object.keys(CREATURE_TYPE_MAPPINGS).sort().map(type => ({
      displayName: type.charAt(0).toUpperCase() + type.slice(1)
    }));

    // Restore filter term from localStorage for session persistence
    const savedFilterTerm = loadFilterTerm();

    return await renderModuleTemplate(
      `modules/${MODULE_ID}/templates/no-match.hbs`,
      {
        currentImage: creatureInfo.currentImage,
        actorName: creatureInfo.actorName,
        type: creatureInfo.type || 'Unknown',
        subtype: creatureInfo.subtype || '',
        tokenCount,
        showTokenCount: tokenCount > 1,
        showMultiSelect,
        noMatchMessage: i18n('dialog.noMatch', { name: creatureInfo.actorName }),
        browseByTypeLabel: i18n('dialog.browseByType'),
        searchCategoryLabel: i18n('dialog.searchCategory'),
        typeValue: creatureInfo.type || '',
        creatureTypes,
        skipLabel: i18n('dialog.skip'),
        savedFilterTerm
      }
    );
  }

  /**
   * Create search progress HTML
   * @param {string} categoryType - Category being searched
   * @param {Object} progress - Progress information
   * @returns {Promise<string>} HTML string
   */
  async createSearchProgressHTML(categoryType, progress) {
    const { current, total, term, resultsFound } = progress;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    return await renderModuleTemplate(
      `modules/${MODULE_ID}/templates/search-progress.hbs`,
      {
        categoryType,
        percent,
        current,
        total,
        term: term || '',
        resultsFound
      }
    );
  }

  /**
   * Create progress HTML with results
   * @param {number} current - Current progress
   * @param {number} total - Total items
   * @param {string} status - Status message
   * @param {Array} results - Results array
   * @returns {Promise<string>} HTML string
   */
  async createProgressHTML(current, total, status, results) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    // Transform results array with icon classes
    const transformedResults = results.map(r => ({
      name: r.name,
      match: r.match || null,
      status: r.status,
      iconClass: r.status === 'success' ? 'fa-check' :
                 r.status === 'failed' ? 'fa-times' : 'fa-forward'
    }));

    return await renderModuleTemplate(
      `modules/${MODULE_ID}/templates/progress.hbs`,
      {
        percent,
        current,
        total,
        status,
        successCount,
        failedCount,
        skippedCount,
        hasResults: results.length > 0,
        results: transformedResults
      }
    );
  }

  /**
   * Create TVA cache loading HTML
   * @param {boolean} refreshing - Whether refreshing cache
   * @param {string} customMessage - Optional custom status message
   * @returns {Promise<string>} HTML string
   */
  async createTVACacheHTML(refreshing = false, customMessage = null) {
    const templatePath = `modules/${MODULE_ID}/templates/tva-cache.hbs`;
    const statusMessage = customMessage || 'Using Token Variant Art cache...';
    return await renderModuleTemplate(templatePath, {
      refreshing,
      statusMessage
    });
  }

  /**
   * Create error HTML
   * @param {Object|string} errorData - Error object or message string
   * @param {string} errorData.errorType - Error type (e.g., "error", "warning")
   * @param {string} errorData.message - Error message
   * @param {string} [errorData.details] - Technical details (optional)
   * @param {string[]} [errorData.recoverySuggestions] - Recovery suggestions array (optional)
   * @returns {Promise<string>} HTML string
   */
  async createErrorHTML(errorData) {
    const templatePath = `modules/${MODULE_ID}/templates/error.hbs`;

    // Support backward compatibility: accept string or object
    const data = typeof errorData === 'string'
      ? { errorType: 'error', message: errorData }
      : errorData;

    return await renderModuleTemplate(templatePath, {
      errorType: data.errorType || 'error',
      message: data.message,
      details: data.details,
      recoverySuggestions: data.recoverySuggestions
    });
  }

  /**
   * Setup match selection event handlers
   * @param {HTMLElement} dialogElement - Dialog element
   * @returns {Promise<Object|null>} Selection result
   */
  setupMatchSelectionHandlers(dialogElement) {
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

      const updateSelectionCount = () => {
        const selectedCount = container.querySelectorAll('.match-option.selected').length;
        const countEl = container.querySelector('.selection-count');
        if (countEl) {
          countEl.textContent = `${selectedCount} selected`;
        }
      };

      // Setup search filter
      const searchInput = container.querySelector('.search-filter-input');
      const searchClearBtn = container.querySelector('.search-clear-btn');
      const visibleCountEl = container.querySelector('.visible-count');
      if (searchInput) {
        let debounceTimer = null;

        // Toggle clear button visibility based on input value
        const toggleClearButton = () => {
          if (searchClearBtn) {
            if (searchInput.value.trim().length > 0) {
              searchClearBtn.classList.add('visible');
            } else {
              searchClearBtn.classList.remove('visible');
            }
          }
        };

        // Initial state - show clear button and apply filter if restored from localStorage
        toggleClearButton();
        if (searchInput.value.trim().length > 0) {
          // Trigger filter logic for restored filter term
          searchInput.dispatchEvent(new Event('input'));
        }

        searchInput.addEventListener('input', () => {
          toggleClearButton();

          // Save filter term to localStorage for session persistence
          saveFilterTerm(searchInput.value);

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

            const visibleSelected = container.querySelectorAll('.match-option:not([style*="display: none"]).selected');
            if (visibleSelected.length === 0) {
              const firstVisible = container.querySelector('.match-option:not([style*="display: none"])');
              if (firstVisible) firstVisible.classList.add('selected');
            }
            updateSelectionCount();
          }, 150);
        });

        // Clear button click handler
        if (searchClearBtn) {
          searchClearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
          });
        }
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
          }
        });

        option.addEventListener('dblclick', () => {
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
    });
  }

  /**
   * Setup no-match handlers
   * @param {HTMLElement} dialogElement - Dialog element
   * @param {Object} creatureInfo - Creature information
   * @param {Array} localIndex - Local image index
   * @param {number} tokenCount - Token count
   * @param {Function} searchByCategory - Search function
   * @returns {Promise<Object|null>} Selection result
   */
  setupNoMatchHandlers(dialogElement, creatureInfo, localIndex, tokenCount, searchByCategory) {
    return new Promise((resolve) => {
      const container = dialogElement.querySelector('.dialog-content');
      if (!container) {
        resolve(null);
        return;
      }

      let assignmentMode = 'sequential';
      const multiSelectEnabled = tokenCount > 1;

      const typeInput = container.querySelector('.category-type-input');
      const searchBtn = container.querySelector('.search-category-btn');
      const resultsContainer = container.querySelector('.category-results');
      const matchGrid = container.querySelector('.token-replacer-fa-match-select');
      const loadingEl = container.querySelector('.category-results-loading');
      const selectBtn = container.querySelector('.select-btn');
      const skipBtn = container.querySelector('.skip-btn');
      const modeToggle = container.querySelector('.token-replacer-fa-mode-toggle');
      const selectionInfo = container.querySelector('.token-replacer-fa-selection-info');

      const updateSelectionCount = () => {
        const selectedCount = container.querySelectorAll('.match-option.selected').length;
        const countEl = container.querySelector('.selection-count');
        if (countEl) {
          countEl.textContent = `${selectedCount} selected`;
        }
        if (selectBtn) {
          selectBtn.disabled = selectedCount === 0;
        }
      };

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

      const displayResults = (results) => {
        if (loadingEl) loadingEl.style.display = 'none';

        const categoryFilter = container.querySelector('.category-filter');
        const categoryVisibleCount = container.querySelector('.category-visible-count');
        const categoryTotalCount = container.querySelector('.category-total-count');
        const categorySearchInput = container.querySelector('.category-search-filter-input');

        if (results.length === 0) {
          if (categoryFilter) categoryFilter.style.display = 'none';
          if (matchGrid) matchGrid.innerHTML = `
            <div class="no-results-message">
              <i class="fas fa-folder-open"></i>
              <span>${i18n('dialog.noResultsInCategory')}</span>
            </div>
          `;
          return;
        }

        // Cap displayed results to prevent UI freeze
        const displayItems = results.length > MAX_DISPLAY_RESULTS
          ? results.slice(0, MAX_DISPLAY_RESULTS)
          : results;

        if (categoryFilter) {
          categoryFilter.style.display = 'block';
          if (categoryVisibleCount) categoryVisibleCount.textContent = displayItems.length;
          if (categoryTotalCount) categoryTotalCount.textContent = results.length;
          if (categorySearchInput) categorySearchInput.value = '';
        }

        if (!matchGrid) return;
        matchGrid.innerHTML = displayItems.map((match, idx) => {
          const safeMatchName = escapeHtml(match.name);
          const safePath = escapeHtml(match.path);
          const scoreDisplay = match.score !== undefined
            ? `${Math.round((1 - match.score) * 100)}%`
            : escapeHtml(match.source || '');
          return `
            <div class="match-option" data-index="${idx}" data-path="${safePath}" data-name="${safeMatchName.toLowerCase()}">
              <div class="skeleton-loader skeleton-72">
                <img src="${safePath}" alt="${safeMatchName}" loading="lazy" onerror="this.src='icons/svg/mystery-man.svg'" onload="this.parentElement.classList.add('loaded')">
              </div>
              <div class="match-name">${safeMatchName}</div>
              <div class="match-score">${scoreDisplay}</div>
              <div class="match-check"><i class="fas fa-check"></i></div>
            </div>
          `;
        }).join('');

        if (multiSelectEnabled) {
          if (modeToggle) modeToggle.style.display = 'flex';
          if (selectionInfo) selectionInfo.style.display = 'block';
          setupModeButtons();
        }

        setupMatchOptions();
        updateSelectionCount();

        // Setup category filter with AND logic
        if (categorySearchInput) {
          const categoryClearBtn = container.querySelector('.category-filter .search-clear-btn');
          let debounceTimer = null;

          // Toggle clear button visibility based on input value
          const toggleClearButton = () => {
            if (categoryClearBtn) {
              if (categorySearchInput.value.trim().length > 0) {
                categoryClearBtn.classList.add('visible');
              } else {
                categoryClearBtn.classList.remove('visible');
              }
            }
          };

          // Initial state - show clear button and apply filter if restored from localStorage
          toggleClearButton();
          if (categorySearchInput.value.trim().length > 0) {
            // Trigger filter logic for restored filter term
            categorySearchInput.dispatchEvent(new Event('input'));
          }

          categorySearchInput.addEventListener('input', () => {
            toggleClearButton();

            // Save filter term to localStorage for session persistence
            saveFilterTerm(categorySearchInput.value);

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

              const visibleSelected = matchGrid.querySelectorAll('.match-option:not([style*="display: none"]).selected');
              if (visibleSelected.length === 0) {
                const firstVisible = matchGrid.querySelector('.match-option:not([style*="display: none"])');
                if (firstVisible) firstVisible.classList.add('selected');
              }
              updateSelectionCount();
            }, 150);
          });

          // Clear button click handler
          if (categoryClearBtn) {
            categoryClearBtn.addEventListener('click', () => {
              categorySearchInput.value = '';
              categorySearchInput.dispatchEvent(new Event('input'));
              categorySearchInput.focus();
            });
          }
        }
      };

      // Handle search button click
      if (searchBtn) {
        searchBtn.addEventListener('click', async () => {
          const searchTerm = typeInput?.value?.trim().toLowerCase();
          if (!searchTerm) {
            ui.notifications.warn(i18n('dialog.selectTypeFirst'));
            return;
          }

          // Check if it matches a known creature type, otherwise use as direct search
          const creatureTypes = Object.keys(CREATURE_TYPE_MAPPINGS);
          const selectedType = creatureTypes.find(t => t === searchTerm) || searchTerm;

          if (resultsContainer) resultsContainer.style.display = 'block';
          if (loadingEl) {
            loadingEl.style.display = 'block';
            loadingEl.innerHTML = await this.createSearchProgressHTML(selectedType, {
              current: 0, total: 1, term: 'initializing...', resultsFound: 0
            });
          }
          if (matchGrid) matchGrid.innerHTML = '';
          if (selectBtn) selectBtn.disabled = true;

          const results = await searchByCategory(selectedType, localIndex, null, async (progress) => {
            if (loadingEl) loadingEl.innerHTML = await this.createSearchProgressHTML(selectedType, progress);
          });
          displayResults(results);
        });
      }

      // Handle Enter key in search input
      if (typeInput) {
        typeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            searchBtn?.click();
          }
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
   * Create main dialog
   * @param {string} initialContent - Initial content
   * @param {Function} onClose - Close callback
   * @returns {TokenReplacerDialog} TokenReplacerDialog instance
   */
  createMainDialog(initialContent, onClose) {
    // Close existing dialog if still in DOM (prevents duplicate ID conflicts in ApplicationV2)
    if (this.mainDialog) {
      try {
        if (this.mainDialog.rendered) {
          this.mainDialog.close();
        }
      } catch (e) {
        console.warn('token-replacer-fa | Failed to close existing dialog:', e);
      }
      this.mainDialog = null;
    }

    this.mainDialog = new TokenReplacerDialog({
      content: initialContent,
      onClose: () => {
        // Clear filter term on dialog close (session-only persistence)
        clearFilterTerm();
        onClose?.();
        this.mainDialog = null;
      },
      window: {
        title: i18n('dialog.title'),
        resizable: true,
        positioned: true,
        minimizable: false
      },
      position: {
        width: 500,
        height: 'auto'
      }
    });
    return this.mainDialog;
  }

  /**
   * Set cancel callback for ongoing operations
   * @param {Function|null} callback - Cancel callback function
   */
  setCancelCallback(callback) {
    this.cancelCallback = callback;
  }

  /**
   * Update main dialog content
   * @param {string} content - New content
   */
  updateDialogContent(content) {
    if (!this.mainDialog) return;

    try {
      this.mainDialog.updateContent(content);
      this._wireCancelButton();
    } catch (e) {
      // Dialog might be in transition
    }
  }

  /**
   * Wire up cancel button event listener
   * @private
   */
  _wireCancelButton() {
    if (!this.mainDialog) return;

    const dialogEl = this.mainDialog.getDialogElement();
    if (!dialogEl) return;

    const cancelBtn = dialogEl.querySelector('.cancel-btn[data-action="cancel"]');
    if (!cancelBtn) return;

    // Remove existing listener to avoid duplicates
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.replaceWith(newCancelBtn);

    // Add new listener
    newCancelBtn.addEventListener('click', async () => {
      if (this.cancelCallback) {
        console.log(`${MODULE_ID} | Cancel button clicked`);
        newCancelBtn.disabled = true;
        newCancelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelling...';

        try {
          await this.cancelCallback();
          this.updateDialogContent(await this.createErrorHTML('Operation cancelled by user'));
        } catch (e) {
          console.error(`${MODULE_ID} | Error during cancellation:`, e);
          this.updateDialogContent(await this.createErrorHTML('Error cancelling operation'));
        }

        this.cancelCallback = null;
      }
    });
  }

  /**
   * Get main dialog element
   * @returns {HTMLElement|null} Dialog element
   */
  getDialogElement() {
    return this.mainDialog?.getDialogElement() || null;
  }

  /**
   * Check if dialog is open
   * @returns {boolean} True if dialog is open
   */
  isDialogOpen() {
    return this.mainDialog?.isOpen() || false;
  }

  /**
   * Close main dialog
   */
  async closeDialog() {
    if (this.mainDialog) {
      try {
        await this.mainDialog.close();
      } catch (e) {
        // Dialog might already be closed
      }
      this.mainDialog = null;
    }
    // Clear filter term on dialog close (session-only persistence)
    clearFilterTerm();
  }
}

// Export singleton instance and utility functions
export const uiManager = new UIManager();
export { logI18nCacheStats };
