/**
 * MatchGrid on its own: the selection model, filtering, rendering lifecycle.
 *
 * @module tests/ui/MatchGrid
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MatchGrid } from '../../scripts/ui/MatchGrid.js';
import { DisplayLabels } from '../../scripts/ui/DisplayLabels.js';
import { renderModuleTemplate } from './helpers/real-templates.js';

const A = { name: 'Goblin Archer', path: 'a.webp', score: 0 };
const B = { name: 'Goblin Boss', path: 'b.webp', score: 0.5 };
const C = { name: 'Wolf', path: 'c.webp', score: 0.9 };

const renderer = { render: vi.fn(renderModuleTemplate) };
const labels = new DisplayLabels({ localize: (key) => key });

let element;
let empty;

function grid(options = {}) {
  return new MatchGrid({ element, emptyElement: empty, renderer, labels, ...options });
}

const visiblePaths = () =>
  [...element.querySelectorAll('.match-option:not([hidden])')].map((t) => t.dataset.path);
const tile = (path) => element.querySelector(`[data-path="${path}"]`);

beforeEach(() => {
  document.body.innerHTML = '<div id="grid"></div><p id="empty" hidden></p>';
  element = document.getElementById('grid');
  empty = document.getElementById('empty');
  renderer.render.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('MatchGrid', () => {
  it('selects the best match when given a result set', async () => {
    const g = grid();
    await g.setMatches([A, B, C]);

    expect(g.selectedPaths).toEqual(['a.webp']);
    expect(tile('a.webp').getAttribute('aria-pressed')).toBe('true');
  });

  it('renders nothing and selects nothing for an empty result set', async () => {
    const g = grid();
    const outcome = await g.setMatches([]);

    expect(outcome).toEqual({ visible: 0, total: 0, capped: false });
    expect(g.selectionSize).toBe(0);
    expect(empty.hidden).toBe(true);
  });

  it('filters on name and path with AND terms over the whole result set', async () => {
    const g = grid({ maxVisible: 1 });
    await g.setMatches([A, B, C]);
    expect(visiblePaths()).toEqual(['a.webp']);

    const outcome = await g.filter('goblin boss');

    expect(visiblePaths()).toEqual(['b.webp']);
    expect(outcome).toEqual({ visible: 1, total: 1, capped: false });
  });

  it('reports a capped result when more matches pass than it shows', async () => {
    const g = grid({ maxVisible: 2 });

    expect(await g.setMatches([A, B, C])).toEqual({ visible: 2, total: 3, capped: true });
  });

  it('keeps rank order when tiles are rendered late', async () => {
    const g = grid({ maxVisible: 1 });
    await g.setMatches([A, B, C]);
    await g.filter('wolf');
    await g.filter('');
    await g.filter('boss');
    await g.filter('');

    expect([...element.children].map((t) => t.dataset.path)).toEqual([
      'a.webp',
      'b.webp',
      'c.webp',
    ]);
  });

  it('does not render a tile twice', async () => {
    const g = grid();
    await g.setMatches([A, B]);
    renderer.render.mockClear();

    await g.filter('boss');
    await g.filter('');

    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('toggles in multi-select and allows an empty selection', async () => {
    const g = grid({ multiSelect: true });
    const changes = vi.fn();
    g.onSelectionChange(changes);
    await g.setMatches([A, B]);

    tile('b.webp').click();
    tile('a.webp').click();

    expect(g.selectedPaths).toEqual(['b.webp']);
    tile('b.webp').click();
    expect(g.selectionSize).toBe(0);
    expect(changes).toHaveBeenLastCalledWith([]);
  });

  it('replaces the selection in single select', async () => {
    const g = grid();
    await g.setMatches([A, B]);

    tile('b.webp').click();
    tile('b.webp').click();

    expect(g.selectedPaths).toEqual(['b.webp']);
  });

  it('keeps hidden matches selected', async () => {
    const g = grid({ multiSelect: true });
    await g.setMatches([A, B, C]);
    tile('c.webp').click();

    await g.filter('goblin');

    expect(tile('c.webp').hidden).toBe(true);
    expect(g.selectedPaths).toEqual(['a.webp', 'c.webp']);
  });

  it('shows the empty element only when the filter matches nothing', async () => {
    const g = grid();
    await g.setMatches([A]);

    await g.filter('zzz');
    expect(empty.hidden).toBe(false);

    await g.filter('');
    expect(empty.hidden).toBe(true);
  });

  it('uses buttons, which browsers activate with Enter and Space', async () => {
    // jsdom does not synthesize key activation, so this pins the semantics the
    // browser relies on: a focusable <button type="button"> carrying the state.
    const g = grid({ multiSelect: true });
    await g.setMatches([A]);
    const button = tile('a.webp');

    expect(button.tagName).toBe('BUTTON');
    button.focus();
    expect(document.activeElement).toBe(button);
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('notifies activation with the double-clicked path, selected', async () => {
    const g = grid({ multiSelect: true });
    const activated = vi.fn();
    g.onActivate(activated);
    await g.setMatches([A, B]);

    tile('b.webp').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(activated).toHaveBeenCalledWith('b.webp');
    expect(g.selectedPaths).toEqual(['a.webp', 'b.webp']);
  });

  it('labels a score-less match by its source and a scored one by percent', async () => {
    const g = grid();
    await g.setMatches([{ name: 'X', path: 'x.webp', source: 'tva-direct' }, A]);

    expect(tile('x.webp').querySelector('.match-score').textContent).toBe('ui.source.tvaDirect');
    expect(tile('a.webp').querySelector('.match-score').textContent).toBe('100%');
  });

  it('drops a render that finishes after the result set was replaced', async () => {
    let release;
    const slow = {
      render: vi.fn(
        (path, data) =>
          new Promise((resolve) => {
            release = () => resolve(renderModuleTemplate(path, data));
          })
      ),
    };
    const g = grid({ renderer: slow });

    const first = g.setMatches([A]);
    const pendingRelease = release;
    const second = g.setMatches([C]);
    release();
    pendingRelease();
    await Promise.all([first, second]);

    expect([...element.children].map((t) => t.dataset.path)).toEqual(['c.webp']);
  });

  it('ignores clicks after destroy', async () => {
    const g = grid({ multiSelect: true });
    await g.setMatches([A, B]);
    g.destroy();

    tile('b.webp').click();

    expect(g.selectedPaths).toEqual(['a.webp']);
  });

  it('reveals images that finished loading before it was attached', () => {
    document.body.innerHTML = '<div id="root"><span><img src="x.webp"></span></div>';
    const img = document.querySelector('img');
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 10 });

    MatchGrid.watchImages(document.getElementById('root'), new AbortController().signal);

    expect(img.parentElement.classList.contains('loaded')).toBe(true);
  });

  it('swaps a broken image for the placeholder once', () => {
    document.body.innerHTML = '<div id="root"><span><img src="x.webp"></span></div>';
    const img = document.querySelector('img');
    MatchGrid.watchImages(document.getElementById('root'), new AbortController().signal);

    img.dispatchEvent(new Event('error'));
    const fallback = img.getAttribute('src');
    img.dispatchEvent(new Event('error'));

    expect(fallback).toBe('icons/svg/mystery-man.svg');
    expect(img.dataset.fallback).toBe('1');
  });
});
