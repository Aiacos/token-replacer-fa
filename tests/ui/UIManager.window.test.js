/**
 * The dialog window: Cancel, Close, announcements, and the hand-over between
 * consecutive selection dialogs.
 *
 * @module tests/ui/UIManager.window
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UIManager } from '../../scripts/ui/UIManager.js';
import { TokenReplacerDialog } from '../../scripts/ui/TokenReplacerDialog.js';
import { useRealTemplates, useMemoryStorage, englishFor } from './helpers/real-templates.js';

/**
 * A TokenReplacerDialog whose window element is a real DOM node, rendered the
 * way ApplicationV2 would render it.
 */
async function renderedDialog(ui, html) {
  const dialog = await ui.createMainDialog(html);
  const element = document.createElement('div');
  document.body.appendChild(element);
  Object.defineProperty(dialog, 'rendered', { get: () => true, configurable: true });
  Object.defineProperty(dialog, 'element', { get: () => element });
  dialog._replaceHTML(await dialog._renderHTML({ content: html }), element, {});
  await dialog._onRender({}, {});
  return { dialog, element };
}

// The shared ApplicationV2 mock lacks the render/close hooks that Foundry's
// base class provides and TokenReplacerDialog calls through `super`.
const MockBase = Object.getPrototypeOf(TokenReplacerDialog.prototype);
MockBase._onRender ??= async () => {};
MockBase._onClose ??= async () => {};

beforeEach(() => {
  useRealTemplates();
  useMemoryStorage();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('dialog window', () => {
  it('cancels through the callback and reports it as information', async () => {
    const ui = new UIManager();
    const { element } = await renderedDialog(ui, await ui.createTVACacheHTML());
    const callback = vi.fn(async () => {});
    ui.setCancelCallback(callback);

    element.querySelector('.cancel-btn').click();
    await vi.waitFor(() =>
      expect(element.querySelector('.token-replacer-fa-error')).not.toBeNull()
    );

    expect(callback).toHaveBeenCalledTimes(1);
    const box = element.querySelector('.token-replacer-fa-error');
    expect(box.classList.contains('is-info')).toBe(true);
    expect(box.textContent).toContain(englishFor('TOKEN_REPLACER_FA.ui.cancelled'));
  });

  it('shows the busy label while cancelling and ignores a second press', async () => {
    const ui = new UIManager();
    const { element } = await renderedDialog(ui, await ui.createTVACacheHTML());
    let finish;
    const callback = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    ui.setCancelCallback(callback);
    const button = element.querySelector('.cancel-btn');

    button.click();
    button.click();

    expect(button.disabled).toBe(true);
    expect(button.querySelector('.btn-label').textContent).toBe(
      englishFor('TOKEN_REPLACER_FA.ui.cancelling')
    );
    expect(callback).toHaveBeenCalledTimes(1);
    finish();
  });

  it('reports a failed cancellation as an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = new UIManager();
    const { element } = await renderedDialog(ui, await ui.createTVACacheHTML());
    ui.setCancelCallback(async () => {
      throw new Error('stuck');
    });

    element.querySelector('.cancel-btn').click();
    await vi.waitFor(() =>
      expect(element.querySelector('.token-replacer-fa-error')).not.toBeNull()
    );

    expect(element.querySelector('.token-replacer-fa-error').getAttribute('role')).toBe('alert');
  });

  it('closes from the outcome screen', async () => {
    const ui = new UIManager();
    const { dialog, element } = await renderedDialog(
      ui,
      await ui.createProgressHTML(1, 1, 'Done', [])
    );
    const close = vi.spyOn(dialog, 'close');

    element.querySelector('[data-action="close"]').click();

    expect(close).toHaveBeenCalled();
  });

  it('announces each new status line once, in a region that survives updates', async () => {
    const ui = new UIManager();
    const { element } = await renderedDialog(ui, await ui.createProgressHTML(0, 2, 'Go', []));
    const live = element.querySelector('.trfa-live-region');

    ui.updateDialogContent(await ui.createProgressHTML(1, 2, 'Go', []));
    const announced = live.textContent;
    ui.updateDialogContent(await ui.createProgressHTML(1, 2, 'Go', []));

    expect(element.querySelector('.trfa-live-region')).toBe(live);
    expect(announced).toBe('1 / 2 - Go');
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  it('settles the previous selection with null when a new one starts', async () => {
    const ui = new UIManager();
    const html = await ui.createMatchSelectionHTML(
      { actorName: 'A', type: 'beast' },
      [{ name: 'Wolf', path: 'w.webp', score: 0 }],
      1
    );
    document.body.innerHTML = `<div id="d"><div class="dialog-content">${html}</div></div>`;
    const first = ui.setupMatchSelectionHandlers(document.getElementById('d'));
    ui.setupMatchSelectionHandlers(document.getElementById('d'));

    await expect(first).resolves.toBeNull();
  });

  it('starts at a width the layout was designed for', () => {
    expect(TokenReplacerDialog.DEFAULT_OPTIONS.position.width).toBe(640);
  });
});
