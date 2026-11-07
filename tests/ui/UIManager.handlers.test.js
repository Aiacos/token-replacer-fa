/**
 * Dialog handler regressions in UIManager.
 *
 * Both bugs left the dialog looking right while behaving wrong: a restored
 * filter showed in the input but the grid stayed unfiltered, and every category
 * search stacked one more filter listener, so each keystroke re-rendered the
 * grid once per search made so far.
 *
 * @module tests/ui/UIManager.handlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UIManager } from '../../scripts/ui/UIManager.js';
import { MatchGrid } from '../../scripts/ui/MatchGrid.js';
import { useRealTemplates, useMemoryStorage } from './helpers/real-templates.js';

const MATCHES = [
  { name: 'Goblin', path: 'tokens/goblin.webp', score: 0.1 },
  { name: 'Wolf', path: 'tokens/wolf.webp', score: 0.2 },
];

/** Paths currently shown in the grid (filtering hides tiles, it no longer removes them). */
const renderedPaths = (root) =>
  [...root.querySelectorAll('.match-option:not([hidden])')].map((el) => el.dataset.path);

beforeEach(() => {
  vi.useFakeTimers();
  // Tiles are rendered from templates/match-grid.hbs, so the grid is empty
  // under the global '<div>mock template</div>' renderer.
  useRealTemplates();
  useMemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('match selection', () => {
  it('applies a filter term restored into the input', async () => {
    document.body.innerHTML = `
      <div id="dialog"><div class="dialog-content">
        <input class="search-filter-input" value="goblin">
        <button class="search-clear-btn"></button>
        <span class="result-count"></span>
        <div class="token-replacer-fa-match-select" data-multiselect="false"></div>
        <button class="select-btn"></button><button class="skip-btn"></button>
      </div></div>`;
    const ui = new UIManager();
    await ui.createMatchSelectionHTML({ actorName: 'Goblin' }, MATCHES, 1);

    ui.setupMatchSelectionHandlers(document.getElementById('dialog'));
    await vi.advanceTimersByTimeAsync(200);

    expect(renderedPaths(document.body)).toEqual(['tokens/goblin.webp']);
  });
});

describe('no-match category search', () => {
  function setup() {
    document.body.innerHTML = `
      <div id="dialog"><div class="dialog-content">
        <input class="category-type-input" value="humanoid">
        <button class="search-category-btn"></button>
        <div class="category-results">
          <div class="category-results-loading"></div>
          <div class="category-filter">
            <input class="category-search-filter-input">
            <button class="search-clear-btn"></button>
            <span class="category-result-count"></span>
          </div>
          <div class="token-replacer-fa-match-select"></div>
        </div>
        <button class="select-btn"></button><button class="skip-btn"></button>
      </div></div>`;
    const ui = new UIManager();
    vi.spyOn(ui, 'createSearchProgressHTML').mockResolvedValue('');
    return ui;
  }

  it('re-renders the grid once per keystroke, however many searches ran', async () => {
    const ui = setup();
    const searchByCategory = vi.fn(async () => MATCHES);
    ui.setupNoMatchHandlers(
      document.getElementById('dialog'),
      { actorName: 'Goblin' },
      [],
      1,
      searchByCategory
    );
    const searchBtn = document.querySelector('.search-category-btn');
    for (let i = 0; i < 3; i++) {
      searchBtn.click();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(searchByCategory).toHaveBeenCalledTimes(3);

    const render = vi.spyOn(MatchGrid.prototype, 'filter');
    const filter = document.querySelector('.category-search-filter-input');
    filter.value = 'goblin';
    filter.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(200);

    expect(render).toHaveBeenCalledTimes(1);
    expect(renderedPaths(document.body)).toEqual(['tokens/goblin.webp']);
  });

  it('recovers the dialog when the search fails', async () => {
    const ui = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    ui.setupNoMatchHandlers(
      document.getElementById('dialog'),
      { actorName: 'Goblin' },
      [],
      1,
      vi.fn(async () => {
        throw new Error('index unavailable');
      })
    );

    document.querySelector('.search-category-btn').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector('.category-results-loading').hidden).toBe(true);
    expect(globalThis.ui.notifications.error).toHaveBeenCalled();
  });

  it('shows a localized label while the search starts', async () => {
    const ui = setup();
    ui.setupNoMatchHandlers(
      document.getElementById('dialog'),
      { actorName: 'Goblin' },
      [],
      1,
      vi.fn(async () => MATCHES)
    );

    document.querySelector('.search-category-btn').click();
    await vi.advanceTimersByTimeAsync(0);

    const [, progress] = ui.createSearchProgressHTML.mock.calls[0];
    expect(progress.term).not.toBe('initializing...');
  });
});
