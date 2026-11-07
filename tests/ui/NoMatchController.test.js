/**
 * The category browser: searches, superseded searches, empty categories.
 *
 * @module tests/ui/NoMatchController
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UIManager } from '../../scripts/ui/UIManager.js';
import { useRealTemplates, useMemoryStorage, englishFor } from './helpers/real-templates.js';

const CREATURE = { actorName: 'Mystery', type: 'humanoid', currentImage: 'm.webp' };
const ORC = { name: 'Orc', path: 'orc.webp', score: 0.1 };

const visiblePaths = () =>
  [...document.querySelectorAll('.match-option:not([hidden])')].map((t) => t.dataset.path);

async function open(searchByCategory, tokenCount = 1) {
  const ui = new UIManager();
  document.body.innerHTML = `<div id="dialog"><div class="dialog-content">${await ui.createNoMatchHTML(
    CREATURE,
    tokenCount
  )}</div></div>`;
  const selection = ui.setupNoMatchHandlers(
    document.getElementById('dialog'),
    CREATURE,
    [],
    tokenCount,
    searchByCategory
  );
  return { ui, selection };
}

function search(text) {
  document.querySelector('.category-type-input').value = text;
  document.querySelector('.search-category-btn').click();
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

describe('no-match category browser', () => {
  it('prefills the actor type as a user-language label', async () => {
    await open(vi.fn());

    expect(document.querySelector('.category-type-input').value).toBe('Humanoid');
  });

  it('searches the type key for a typed label', async () => {
    const searchByCategory = vi.fn(async () => [ORC]);
    await open(searchByCategory);

    search('Humanoid');
    await vi.advanceTimersByTimeAsync(0);

    expect(searchByCategory.mock.calls[0][0]).toBe('humanoid');
  });

  it('warns instead of searching when the type is empty', async () => {
    const searchByCategory = vi.fn();
    await open(searchByCategory);

    search('  ');

    expect(searchByCategory).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalledWith(
      englishFor('TOKEN_REPLACER_FA.dialog.selectTypeFirst')
    );
  });

  it('says so when the category holds no token art, with Apply disabled', async () => {
    await open(vi.fn(async () => []));

    search('ooze');
    await vi.advanceTimersByTimeAsync(0);

    expect(document.querySelector('.no-results-message').hidden).toBe(false);
    expect(document.querySelector('.category-filter').hidden).toBe(true);
    expect(document.querySelector('.select-btn').disabled).toBe(true);
  });

  it('lets a newer search win over a slower older one', async () => {
    const pending = [];
    const searchByCategory = vi.fn(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        })
    );
    await open(searchByCategory);

    search('beast');
    await vi.advanceTimersByTimeAsync(0);
    search('humanoid');
    await vi.advanceTimersByTimeAsync(0);
    pending[1]([ORC]);
    await vi.advanceTimersByTimeAsync(0);
    pending[0]([{ name: 'Wolf', path: 'wolf.webp', score: 0 }]);
    await vi.advanceTimersByTimeAsync(0);

    expect(visiblePaths()).toEqual(['orc.webp']);
  });

  it('applies the chosen category match', async () => {
    const { selection } = await open(vi.fn(async () => [ORC]));

    search('humanoid');
    await vi.advanceTimersByTimeAsync(0);
    document.querySelector('.select-btn').click();

    await expect(selection).resolves.toEqual({ paths: ['orc.webp'], mode: 'sequential' });
  });

  it('reveals the assignment mode only once there are matches to assign', async () => {
    await open(
      vi.fn(async () => [ORC]),
      3
    );
    const toggle = document.querySelector('.token-replacer-fa-mode-toggle');
    expect(toggle.hidden).toBe(true);

    search('humanoid');
    await vi.advanceTimersByTimeAsync(0);

    expect(toggle.hidden).toBe(false);
    expect(document.querySelector('.token-replacer-fa-selection-info').hidden).toBe(false);
  });

  it('settles with null on Skip', async () => {
    const { selection } = await open(vi.fn());

    document.querySelector('.skip-btn').click();

    await expect(selection).resolves.toBeNull();
  });
});
