/**
 * What a user can do with the dialogs, driven through UIManager's public API
 * and rendered from the real templates.
 *
 * Each block pins an audit finding: tiles that a keyboard could not reach, a
 * selection that every keystroke in the filter threw away, an Apply button that
 * silently skipped when nothing was selected, focus dropped from Cancel on every
 * progress tick.
 *
 * @module tests/ui/UIManager.behaviour
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UIManager } from '../../scripts/ui/UIManager.js';
import { useRealTemplates, useMemoryStorage, englishFor } from './helpers/real-templates.js';

const GOBLIN = { name: 'Goblin', path: 'tokens/goblin.webp', score: 0.1 };
const WOLF = { name: 'Wolf', path: 'tokens/wolf.webp', score: 0.2 };
const CREATURE = { actorName: 'Goblin Boss', type: 'humanoid', currentImage: 'a.webp' };

const tile = (path) => document.querySelector(`.match-option[data-path="${path}"]`);
const selectBtn = () => document.querySelector('.select-btn');
const filterInput = () => document.querySelector('.search-filter-input');

/** Mount rendered dialog content the way TokenReplacerDialog does. */
function mount(html) {
  document.body.innerHTML = `<div id="dialog"><div class="dialog-content">${html}</div></div>`;
  return document.getElementById('dialog');
}

async function typeFilter(text) {
  filterInput().value = text;
  filterInput().dispatchEvent(new Event('input'));
  await vi.advanceTimersByTimeAsync(200);
}

/**
 * Open the match selection dialog and wait for the grid to render.
 * The pending selection is wrapped: returned bare, `await` would wait for it.
 */
async function openMatchSelection(ui, matches, tokenCount = 1) {
  const dialog = mount(await ui.createMatchSelectionHTML(CREATURE, matches, tokenCount));
  const selection = ui.setupMatchSelectionHandlers(dialog);
  await vi.advanceTimersByTimeAsync(0);
  return { selection };
}

beforeEach(() => {
  vi.useFakeTimers();
  useRealTemplates();
  useMemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('match grid', () => {
  it('renders every match as a toggle button, the first one pressed', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN, WOLF]);

    expect(tile(GOBLIN.path).tagName).toBe('BUTTON');
    expect(tile(GOBLIN.path).getAttribute('type')).toBe('button');
    expect(tile(GOBLIN.path).getAttribute('aria-pressed')).toBe('true');
    expect(tile(WOLF.path).getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the selection while the filter hides the selected match', async () => {
    const ui = new UIManager();
    const { selection } = await openMatchSelection(ui, [GOBLIN, WOLF], 2);

    tile(WOLF.path).click();
    await typeFilter('goblin');
    await typeFilter('');

    expect(tile(WOLF.path).getAttribute('aria-pressed')).toBe('true');
    selectBtn().click();
    await expect(selection).resolves.toEqual({
      paths: [GOBLIN.path, WOLF.path],
      mode: 'sequential',
    });
  });

  it('hides filtered-out tiles instead of rebuilding them', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN, WOLF]);
    const goblin = tile(GOBLIN.path);
    const wolf = tile(WOLF.path);

    await typeFilter('goblin');

    expect(tile(GOBLIN.path)).toBe(goblin);
    expect(wolf.isConnected).toBe(true);
    expect(wolf.hidden).toBe(true);
  });

  it('disables Apply while nothing is selected', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN, WOLF], 2);

    tile(GOBLIN.path).click();

    expect(tile(GOBLIN.path).getAttribute('aria-pressed')).toBe('false');
    expect(selectBtn().disabled).toBe(true);
    expect(document.querySelector('.selection-count').textContent).toBe('0 selected');
  });

  it('uses the singular for exactly one selected match', async () => {
    // Italian has no plural-neutral form: "1 selezionati" is wrong, so one
    // selection gets its own string rather than a {count} in the plural one.
    await openMatchSelection(new UIManager(), [GOBLIN, WOLF], 2);

    expect(document.querySelector('.selection-count').textContent).toBe(
      englishFor('TOKEN_REPLACER_FA.ui.selectedCountOne')
    );
    tile(WOLF.path).click();
    expect(document.querySelector('.selection-count').textContent).toBe('2 selected');
  });

  it('says so when the filter matches nothing', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN, WOLF]);

    await typeFilter('zzz');

    const empty = document.querySelector('.match-grid-empty');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent.trim()).toBe(englishFor('TOKEN_REPLACER_FA.ui.noFilterResults'));
  });

  it('applies the whole selection in the chosen mode on double-click in multi-select', async () => {
    const ui = new UIManager();
    const { selection } = await openMatchSelection(ui, [GOBLIN, WOLF], 2);

    tile(WOLF.path).click();
    document.querySelector('.mode-btn[data-mode="random"]').click();
    tile(GOBLIN.path).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    await expect(selection).resolves.toEqual({
      paths: [GOBLIN.path, WOLF.path],
      mode: 'random',
    });
  });

  it('applies the double-clicked match in single select', async () => {
    const ui = new UIManager();
    const { selection } = await openMatchSelection(ui, [GOBLIN, WOLF]);

    tile(WOLF.path).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    await expect(selection).resolves.toEqual({ paths: [WOLF.path], mode: 'sequential' });
  });

  it('applies the choice to every remaining creature, in the chosen mode', async () => {
    const ui = new UIManager();
    const { selection } = await openMatchSelection(ui, [GOBLIN, WOLF], 2);

    tile(WOLF.path).click();
    document.querySelector('.mode-btn[data-mode="random"]').click();
    document.querySelector('.apply-all-btn').click();

    await expect(selection).resolves.toEqual({
      paths: [GOBLIN.path, WOLF.path],
      mode: 'random',
      applyToRemaining: true,
    });
  });

  it('keeps a plain Apply free of the apply-to-remaining flag', async () => {
    const ui = new UIManager();
    const { selection } = await openMatchSelection(ui, [GOBLIN]);

    selectBtn().click();

    const result = await selection;
    expect(result.applyToRemaining).toBeUndefined();
  });

  it('disables apply-to-remaining exactly while Apply is disabled', async () => {
    const ui = new UIManager();
    const { selection } = await openMatchSelection(ui, [GOBLIN, WOLF], 2);
    const applyAll = document.querySelector('.apply-all-btn');
    const settled = vi.fn();
    selection.then(settled);
    expect(applyAll.disabled).toBe(false);

    tile(GOBLIN.path).click();
    expect(applyAll.disabled).toBe(true);
    applyAll.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();

    tile(WOLF.path).click();
    expect(applyAll.disabled).toBe(false);
  });

  it('explains what apply-to-remaining does, in the user language', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN]);
    const applyAll = document.querySelector('.apply-all-btn');

    expect(applyAll.getAttribute('type')).toBe('button');
    expect(applyAll.textContent.trim()).toBe(englishFor('TOKEN_REPLACER_FA.ui.applyToRemaining'));
    expect(applyAll.title).toBe(englishFor('TOKEN_REPLACER_FA.ui.applyToRemainingHint'));
    expect(applyAll.title).not.toContain('TOKEN_REPLACER_FA');
  });

  it('renders a large result set page by page and keeps the count current', async () => {
    const matches = Array.from({ length: 450 }, (_, i) => ({
      name: `Goblin ${i}`,
      path: `tokens/goblin-${i}.webp`,
      score: 0.1,
    }));
    const ui = new UIManager();
    const dialog = mount(await ui.createMatchSelectionHTML(CREATURE, matches, 1));
    ui.setupMatchSelectionHandlers(dialog);
    const count = () => document.querySelector('.result-count').textContent;
    const tiles = () => document.querySelectorAll('.match-option').length;

    // The first page, before any timer runs: jsdom has no IntersectionObserver,
    // so the rest comes in chunks between yields.
    await vi.waitFor(() => expect(tiles()).toBe(200));
    expect(count()).toBe('Showing 200 of 450 matches');

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(tiles()).toBe(450);
    expect(count()).toBe('Showing 450 of 450 matches');
  });

  it('tells the user the filter takes wildcards', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN]);

    expect(filterInput().title).toBe(englishFor('TOKEN_REPLACER_FA.ui.filterHint'));
    expect(filterInput().placeholder).toContain('*');
  });

  it('filters with wildcards', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN, WOLF]);

    await typeFilter('w?lf');

    expect(tile(GOBLIN.path).hidden).toBe(true);
    expect(tile(WOLF.path).hidden).toBe(false);
  });

  it('exposes the assignment mode as pressed toggle buttons', async () => {
    await openMatchSelection(new UIManager(), [GOBLIN, WOLF], 2);
    const random = document.querySelector('.mode-btn[data-mode="random"]');

    random.click();

    expect(random.getAttribute('aria-pressed')).toBe('true');
    expect(
      document.querySelector('.mode-btn[data-mode="sequential"]').getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('labels a score-less match with its localized source', async () => {
    await openMatchSelection(new UIManager(), [{ name: 'Orc', path: 'o.webp', source: 'tva' }]);

    expect(tile('o.webp').querySelector('.match-score').textContent).toBe(
      englishFor('TOKEN_REPLACER_FA.ui.source.tva')
    );
  });

  it('names an unknown creature type in the user language', async () => {
    const html = await new UIManager().createMatchSelectionHTML(
      { ...CREATURE, type: null },
      [GOBLIN],
      1
    );
    mount(html);

    expect(document.querySelector('.token-type').textContent.trim()).toBe(
      englishFor('TOKEN_REPLACER_FA.ui.unknownType')
    );
  });
});

describe('dialog lifecycle', () => {
  it('resolves Skip with null, once', async () => {
    const ui = new UIManager();
    const { selection } = await openMatchSelection(ui, [GOBLIN]);
    const settled = vi.fn();
    selection.then(settled);

    document.querySelector('.skip-btn').click();
    selectBtn().click();
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(null);
  });

  it('resolves a pending selection with null when the dialog closes', async () => {
    const ui = new UIManager();
    await ui.createMainDialog('<div></div>');
    const { selection } = await openMatchSelection(ui, [GOBLIN]);

    await ui.closeDialog();

    await expect(selection).resolves.toBeNull();
  });

  it('keeps keyboard focus on Cancel across a progress update', async () => {
    const ui = new UIManager();
    const dialog = await ui.createMainDialog('');
    const element = mount(await ui.createTVACacheHTML(false));
    Object.defineProperty(dialog, 'rendered', { get: () => true });
    Object.defineProperty(dialog, 'element', { get: () => element });
    document.querySelector('.cancel-btn').focus();

    ui.updateDialogContent(await ui.createTVACacheHTML(true));

    expect(document.activeElement).toBe(document.querySelector('.cancel-btn'));
  });
});

describe('progress and outcome views', () => {
  it('exposes progress to assistive technology', async () => {
    mount(await new UIManager().createProgressHTML(1, 4, 'Replacing', []));

    const bar = document.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('counts failed replacements as failures, not as missing matches', async () => {
    mount(
      await new UIManager().createProgressHTML(1, 1, 'Done', [{ name: 'Orc', status: 'failed' }])
    );

    expect(document.querySelector('.summary-item.failed .label').textContent.trim()).toBe(
      englishFor('TOKEN_REPLACER_FA.ui.failedLabel')
    );
  });

  it('offers Close once every token is processed', async () => {
    const ui = new UIManager();
    mount(await ui.createProgressHTML(1, 2, 'Replacing', []));
    expect(document.querySelector('[data-action="close"]')).toBeNull();

    mount(await ui.createProgressHTML(2, 2, 'Done', []));
    expect(document.querySelector('[data-action="close"]').textContent.trim()).toBe(
      englishFor('TOKEN_REPLACER_FA.dialog.close')
    );
  });

  it('presents a cancellation as information, not as an error', async () => {
    mount(await new UIManager().createErrorHTML({ errorType: 'info', message: 'Stopped' }));

    const box = document.querySelector('.token-replacer-fa-error');
    expect(box.classList.contains('is-info')).toBe(true);
    expect(box.getAttribute('role')).toBe('status');
  });

  it('discloses technical details without script', async () => {
    mount(
      await new UIManager().createErrorHTML({
        errorType: 'unknown',
        message: 'Boom',
        details: 'stack',
      })
    );

    const details = document.querySelector('details.error-details');
    expect(details.querySelector('summary').textContent.trim()).toBe(
      englishFor('TOKEN_REPLACER_FA.ui.showDetails')
    );
    expect(details.querySelector('pre').textContent).toBe('stack');
  });
});
