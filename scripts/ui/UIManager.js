/**
 * Token Replacer FA - UI Manager
 * Handles all dialog creation, HTML generation, and event handling
 * @module ui/UIManager
 */

import { MODULE_ID, CREATURE_TYPE_MAPPINGS } from '../core/Constants.js';
import { escapeHtml, parseFilterTerms, matchesAllTerms, parseSubtypeTerms } from '../core/Utils.js';

/**
 * Get localized string
 * @param {string} key - Localization key
 * @param {Object} data - Replacement data
 * @returns {string} Localized string
 */
function i18n(key, data = {}) {
  let str = game.i18n.localize(`TOKEN_REPLACER_FA.${key}`);
  for (const [k, v] of Object.entries(data)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

/**
 * UIManager class for handling all UI operations
 */
export class UIManager {
  constructor() {
    this.mainDialog = null;
  }

  /**
   * Create scan progress HTML
   * @param {string} currentDir - Current directory being scanned
   * @param {number} dirsScanned - Number of directories scanned
   * @param {number} imagesFound - Number of images found
   * @param {number} filesInDir - Files in current directory
   * @param {number} subDirs - Subdirectories count
   * @param {string} currentFile - Current file being processed
   * @returns {string} HTML string
   */
  createScanProgressHTML(currentDir, dirsScanned, imagesFound, filesInDir, subDirs, currentFile = null) {
    const safeDir = escapeHtml(currentDir);
    const safeFile = currentFile ? escapeHtml(currentFile) : '';

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
   * Create parallel search progress HTML
   * @param {number} completed - Completed searches
   * @param {number} total - Total searches
   * @param {number} uniqueTypes - Unique creature types
   * @param {number} totalTokens - Total tokens
   * @param {string[]} currentBatch - Currently searching batch
   * @returns {string} HTML string
   */
  createParallelSearchHTML(completed, total, uniqueTypes, totalTokens, currentBatch = []) {
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
   * Create match selection HTML
   * @param {Object} creatureInfo - Creature information
   * @param {Array} matches - Match results
   * @param {number} tokenCount - Number of tokens
   * @returns {string} HTML string
   */
  createMatchSelectionHTML(creatureInfo, matches, tokenCount = 1) {
    const safeName = escapeHtml(creatureInfo.actorName);
    const safeType = escapeHtml(creatureInfo.type || 'Unknown');
    const safeSubtype = creatureInfo.subtype ? `(${escapeHtml(creatureInfo.subtype)})` : '';
    const showMultiSelect = tokenCount > 1;
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
        <button type="button" class="skip-btn" data-action="skip">
          <i class="fas fa-forward"></i> ${i18n('dialog.skip')}
        </button>
      </div>
    `;
  }

  /**
   * Create no-match HTML with category browser
   * @param {Object} creatureInfo - Creature information
   * @param {number} tokenCount - Number of tokens
   * @returns {string} HTML string
   */
  createNoMatchHTML(creatureInfo, tokenCount = 1) {
    const safeName = escapeHtml(creatureInfo.actorName);
    const safeType = escapeHtml(creatureInfo.type || 'Unknown');
    const safeSubtype = creatureInfo.subtype ? `(${escapeHtml(creatureInfo.subtype)})` : '';

    const creatureTypes = Object.keys(CREATURE_TYPE_MAPPINGS).sort();
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
          <span>${i18n('dialog.noMatch', { name: creatureInfo.actorName })}</span>
        </div>

        ${hasValidSubtypes ? `
        <div class="subtype-search">
          <label>${i18n('dialog.searchBySubtype')}</label>
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
          <label for="creature-type-select">${i18n('dialog.browseByType')}</label>
          <select id="creature-type-select" class="creature-type-select">
            <option value="">${i18n('dialog.selectType')}</option>
            ${creatureTypes.map(type => {
              const selected = type === creatureInfo.type?.toLowerCase() ? 'selected' : '';
              const displayName = type.charAt(0).toUpperCase() + type.slice(1);
              return `<option value="${type}" ${selected}>${displayName}</option>`;
            }).join('')}
          </select>
          <button type="button" class="search-category-btn">
            <i class="fas fa-search"></i> ${i18n('dialog.searchCategory')}
          </button>
        </div>

        <div class="category-results" style="display: none;">
          <div class="category-results-loading" style="display: none;"></div>
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
          <i class="fas fa-forward"></i> ${i18n('dialog.skip')}
        </button>
      </div>
    `;
  }

  /**
   * Create search progress HTML
   * @param {string} categoryType - Category being searched
   * @param {Object} progress - Progress information
   * @returns {string} HTML string
   */
  createSearchProgressHTML(categoryType, progress) {
    const { current, total, term, resultsFound } = progress;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const safeTerm = escapeHtml(term || '');
    const safeCategory = escapeHtml(categoryType || '');

    return `
      <div class="token-replacer-fa-search-progress">
        <div class="search-progress-header">
          <i class="fas fa-search fa-spin"></i>
          <span>Searching ${safeCategory} artwork...</span>
        </div>
        <div class="search-progress-bar-container">
          <div class="search-progress-info">
            <span class="search-term">Searching: <strong>${safeTerm}</strong></span>
            <span class="search-percent">${percent}%</span>
          </div>
          <div class="search-progress-bar">
            <div class="search-progress-fill" style="width: ${percent}%"></div>
          </div>
          <div class="search-progress-stats">
            <span>${current} / ${total} terms</span>
            <span>${resultsFound} results found</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create progress HTML with results
   * @param {number} current - Current progress
   * @param {number} total - Total items
   * @param {string} status - Status message
   * @param {Array} results - Results array
   * @returns {string} HTML string
   */
  createProgressHTML(current, total, status, results) {
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
   * Create TVA cache loading HTML
   * @param {boolean} refreshing - Whether refreshing cache
   * @returns {string} HTML string
   */
  createTVACacheHTML(refreshing = false) {
    if (refreshing) {
      return `
        <div class="token-replacer-fa-scan-progress">
          <div class="scan-status">
            <i class="fas fa-sync fa-spin"></i>
            <span>Refreshing TVA cache...</span>
          </div>
          <p style="text-align: center; color: #888; margin-top: 10px;">
            This may take a moment for large image libraries
          </p>
        </div>
      `;
    }
    return `
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
    `;
  }

  /**
   * Create error HTML
   * @param {string} message - Error message
   * @returns {string} HTML string
   */
  createErrorHTML(message) {
    return `
      <div class="token-replacer-fa-scan-progress">
        <div class="scan-status" style="color: #f87171;">
          <i class="fas fa-exclamation-triangle"></i>
          <span>${escapeHtml(message)}</span>
        </div>
        <p style="text-align: center; color: #888; margin-top: 15px;">
          Install Token Variant Art or FA Nexus module, or configure additional search paths in settings.
        </p>
      </div>
    `;
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

      const selectEl = container.querySelector('.creature-type-select');
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

        if (categoryFilter) {
          categoryFilter.style.display = 'block';
          if (categoryVisibleCount) categoryVisibleCount.textContent = results.length;
          if (categoryTotalCount) categoryTotalCount.textContent = results.length;
          if (categorySearchInput) categorySearchInput.value = '';
        }

        if (!matchGrid) return;
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

        if (multiSelectEnabled) {
          if (modeToggle) modeToggle.style.display = 'flex';
          if (selectionInfo) selectionInfo.style.display = 'block';
          setupModeButtons();
        }

        setupMatchOptions();
        updateSelectionCount();

        // Setup category filter with AND logic
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

      // Handle subtype search buttons
      const subtypeButtons = container.querySelectorAll('.subtype-search-btn');
      subtypeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
          const subtype = btn.dataset.subtype;
          if (!subtype) return;

          if (resultsContainer) resultsContainer.style.display = 'block';
          if (loadingEl) loadingEl.style.display = 'flex';
          if (matchGrid) matchGrid.innerHTML = '';
          if (selectBtn) selectBtn.disabled = true;

          const results = await searchByCategory(creatureInfo.type, localIndex, subtype);
          displayResults(results);
        });
      });

      // Handle search button click
      if (searchBtn) {
        searchBtn.addEventListener('click', async () => {
          const selectedType = selectEl?.value;
          if (!selectedType) {
            ui.notifications.warn(i18n('dialog.selectTypeFirst'));
            return;
          }

          if (resultsContainer) resultsContainer.style.display = 'block';
          if (loadingEl) {
            loadingEl.style.display = 'block';
            loadingEl.innerHTML = this.createSearchProgressHTML(selectedType, {
              current: 0, total: 1, term: 'initializing...', resultsFound: 0
            });
          }
          if (matchGrid) matchGrid.innerHTML = '';
          if (selectBtn) selectBtn.disabled = true;

          const results = await searchByCategory(selectedType, localIndex, null, (progress) => {
            if (loadingEl) loadingEl.innerHTML = this.createSearchProgressHTML(selectedType, progress);
          });
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
   * Create main dialog
   * @param {string} initialContent - Initial content
   * @param {Function} onClose - Close callback
   * @returns {Dialog} Foundry Dialog instance
   */
  createMainDialog(initialContent, onClose) {
    this.mainDialog = new Dialog({
      title: i18n('dialog.title'),
      content: initialContent,
      buttons: {},
      close: () => {
        onClose?.();
        this.mainDialog = null;
      }
    }, {
      classes: ['token-replacer-fa-dialog'],
      width: 500,
      height: 'auto',
      resizable: true
    });
    return this.mainDialog;
  }

  /**
   * Update main dialog content
   * @param {string} content - New content
   */
  updateDialogContent(content) {
    if (!this.mainDialog) return;

    try {
      this.mainDialog.data.content = content;
      const dialogElement = this.mainDialog.element?.[0];
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
   * Get main dialog element
   * @returns {HTMLElement|null} Dialog element
   */
  getDialogElement() {
    return this.mainDialog?.element?.[0] || null;
  }

  /**
   * Check if dialog is open
   * @returns {boolean} True if dialog is open
   */
  isDialogOpen() {
    return !!this.mainDialog;
  }

  /**
   * Close main dialog
   */
  closeDialog() {
    if (this.mainDialog) {
      try {
        this.mainDialog.close();
      } catch (e) {
        // Dialog might already be closed
      }
      this.mainDialog = null;
    }
  }
}

// Export singleton instance
export const uiManager = new UIManager();
