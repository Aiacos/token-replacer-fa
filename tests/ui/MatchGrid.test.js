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

/**
 * Stands in for IntersectionObserver: jsdom has no layout, so the test says
 * when the sentinel scrolls into view.
 */
class FakeObservers {
  constructor() {
    this.callback = null;
    this.observed = new Set();
    this.disconnected = false;
    this.create = vi.fn((callback) => {
      this.callback = callback;
      return {
        observe: (target) => this.observed.add(target),
        unobserve: (target) => this.observed.delete(target),
        disconnect: () => {
          this.disconnected = true;
          this.observed.clear();
        },
      };
    });
  }

  /** @param {boolean} [isIntersecting=true] */
  scroll(isIntersecting = true) {
    this.callback([...this.observed].map((target) => ({ target, isIntersecting })));
  }
}

let element;
let empty;
let observers;

function grid(options = {}) {
  return new MatchGrid({
    element,
    emptyElement: empty,
    renderer,
    labels,
    observerFactory: observers.create,
    ...options,
  });
}

/** Resolves with the next count the grid reports. */
const nextCount = (g) =>
  new Promise((resolve) => {
    const off = g.onCountChange((outcome) => {
      off();
      resolve(outcome);
    });
  });

const tilePaths = () => [...element.querySelectorAll('.match-option')].map((t) => t.dataset.path);
const sentinel = () => element.querySelector('.match-grid-sentinel');
const many = (n, prefix = 'm') =>
  Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i}`, path: `${prefix}${i}.webp` }));

const visiblePaths = () =>
  [...element.querySelectorAll('.match-option:not([hidden])')].map((t) => t.dataset.path);
const tile = (path) => element.querySelector(`[data-path="${path}"]`);

beforeEach(() => {
  document.body.innerHTML = '<div id="grid"></div><p id="empty" hidden></p>';
  element = document.getElementById('grid');
  empty = document.getElementById('empty');
  renderer.render.mockClear();
  observers = new FakeObservers();
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

    expect(outcome).toEqual({ visible: 0, total: 0 });
    expect(g.selectionSize).toBe(0);
    expect(empty.hidden).toBe(true);
  });

  it('filters on name and path with AND terms over the whole result set', async () => {
    const g = grid({ maxVisible: 1 });
    await g.setMatches([A, B, C]);
    expect(visiblePaths()).toEqual(['a.webp']);

    const outcome = await g.filter('goblin boss');

    expect(visiblePaths()).toEqual(['b.webp']);
    // total is the whole result set, so the count reads "1 of 3", not "1 of 1".
    expect(outcome).toEqual({ visible: 1, total: 3 });
  });

  it('renders the first page only when more matches pass than a page holds', async () => {
    const g = grid({ maxVisible: 2 });

    expect(await g.setMatches([A, B, C])).toEqual({ visible: 2, total: 3 });
    expect(tilePaths()).toEqual(['a.webp', 'b.webp']);
  });

  it('keeps rank order when tiles are rendered late', async () => {
    const g = grid({ maxVisible: 1 });
    await g.setMatches([A, B, C]);
    await g.filter('wolf');
    await g.filter('');
    await g.filter('boss');
    await g.filter('');

    expect(tilePaths()).toEqual(['a.webp', 'b.webp', 'c.webp']);
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

  it('hides the grid box while the filter matches nothing, so no empty frame shows', async () => {
    const g = grid();
    await g.setMatches([A, B]);

    const outcome = await g.filter('zzz');
    expect(element.hidden).toBe(true);
    expect(outcome).toEqual({ visible: 0, total: 2 });

    await g.filter('');
    expect(element.hidden).toBe(false);
  });

  describe('arrow-key navigation', () => {
    const press = (key) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.activeElement.dispatchEvent(event);
      return event;
    };
    const focused = () => document.activeElement?.dataset.path;
    const D = { name: 'Owlbear', path: 'd.webp', score: 0.95 };

    it('moves along the visible tiles with Left, Right, Home and End', async () => {
      const g = grid();
      await g.setMatches([A, B, C]);
      tile('a.webp').focus();

      expect(press('ArrowRight').defaultPrevented).toBe(true);
      expect(focused()).toBe('b.webp');
      press('ArrowLeft');
      expect(focused()).toBe('a.webp');
      press('ArrowLeft');
      expect(focused()).toBe('a.webp');
      press('End');
      expect(focused()).toBe('c.webp');
      press('Home');
      expect(focused()).toBe('a.webp');
    });

    it('skips tiles the filter hides', async () => {
      const g = grid();
      await g.setMatches([A, B, C]);
      await g.filter('goblin');
      tile('a.webp').focus();

      press('End');
      expect(focused()).toBe('b.webp');
    });

    it('moves by a row with Up and Down, using the laid-out column count', async () => {
      const g = grid();
      await g.setMatches([A, B, C, D]);
      // Two columns: jsdom has no layout, so give the tiles their rows.
      for (const [path, top] of [
        ['a.webp', 0],
        ['b.webp', 0],
        ['c.webp', 100],
        ['d.webp', 100],
      ]) {
        Object.defineProperty(tile(path), 'offsetTop', { value: top, configurable: true });
      }
      tile('b.webp').focus();

      press('ArrowDown');
      expect(focused()).toBe('d.webp');
      press('ArrowDown');
      expect(focused()).toBe('d.webp');
      press('ArrowUp');
      expect(focused()).toBe('b.webp');
    });

    it('leaves other keys to the browser', async () => {
      const g = grid();
      await g.setMatches([A, B]);
      tile('a.webp').focus();

      expect(press('Enter').defaultPrevented).toBe(false);
      expect(focused()).toBe('a.webp');
    });
  });

  describe('progressive rendering', () => {
    it('observes a sentinel after the last tile while more matches wait', async () => {
      const g = grid({ maxVisible: 2 });
      await g.setMatches(many(5));

      expect(element.lastElementChild).toBe(sentinel());
      expect(observers.observed.has(sentinel())).toBe(true);
    });

    it('needs no sentinel when one page holds every match', async () => {
      const g = grid({ maxVisible: 5 });
      await g.setMatches(many(5));

      expect(sentinel()).toBeNull();
      expect(observers.observed.size).toBe(0);
    });

    it('renders the next page when the sentinel scrolls into view', async () => {
      const g = grid({ maxVisible: 2 });
      await g.setMatches(many(5));

      let counted = nextCount(g);
      observers.scroll();
      expect(await counted).toEqual({ visible: 4, total: 5 });
      expect(tilePaths()).toEqual(['m0.webp', 'm1.webp', 'm2.webp', 'm3.webp']);
      expect(element.lastElementChild).toBe(sentinel());

      counted = nextCount(g);
      observers.scroll();
      expect(await counted).toEqual({ visible: 5, total: 5 });
      expect(tilePaths()).toHaveLength(5);
      expect(sentinel()).toBeNull();
      expect(observers.observed.size).toBe(0);
    });

    it('ignores an observer report of the sentinel leaving the view', async () => {
      const g = grid({ maxVisible: 2 });
      await g.setMatches(many(5));
      renderer.render.mockClear();

      observers.scroll(false);
      await Promise.resolve();

      expect(renderer.render).not.toHaveBeenCalled();
      expect(tilePaths()).toHaveLength(2);
    });

    it('renders one page for two reports that arrive while it renders', async () => {
      const g = grid({ maxVisible: 2 });
      await g.setMatches(many(6));
      renderer.render.mockClear();

      const counted = nextCount(g);
      observers.scroll();
      observers.scroll();
      await counted;

      expect(renderer.render).toHaveBeenCalledTimes(1);
      expect(tilePaths()).toHaveLength(4);
    });

    it('restarts from page one over the filtered set', async () => {
      const g = grid({ maxVisible: 2 });
      await g.setMatches([...many(3, 'wolf'), ...many(3, 'goblin')]);
      const counted = nextCount(g);
      observers.scroll();
      await counted;

      const outcome = await g.filter('goblin');

      expect(outcome).toEqual({ visible: 2, total: 6 });
      expect(visiblePaths()).toEqual(['goblin0.webp', 'goblin1.webp']);
      expect(observers.observed.has(sentinel())).toBe(true);
    });

    it('keeps a selection made on a later page across filtering', async () => {
      const g = grid({ maxVisible: 2, multiSelect: true });
      await g.setMatches(many(5));
      const counted = nextCount(g);
      observers.scroll();
      await counted;
      tile('m3.webp').click();

      await g.filter('m 0');
      await g.filter('');

      expect(g.selectedPaths).toEqual(['m0.webp', 'm3.webp']);
      expect(tile('m3.webp').hidden).toBe(true);
    });

    it('drops a page that finishes rendering after the result set was replaced', async () => {
      let release;
      const slow = {
        render: vi.fn(async (path, data) => {
          if (data.tiles[0].path === 'm2.webp') await new Promise((r) => (release = r));
          return renderModuleTemplate(path, data);
        }),
      };
      const g = grid({ maxVisible: 2, renderer: slow });
      await g.setMatches(many(5));

      observers.scroll();
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      await g.setMatches([A]);
      release();
      await Promise.resolve();
      await Promise.resolve();

      expect(tilePaths()).toEqual(['a.webp']);
    });

    it('drops a page that finishes rendering after a newer filter', async () => {
      let release;
      const slow = {
        render: vi.fn(async (path, data) => {
          if (data.tiles[0].path === 'm2.webp') await new Promise((r) => (release = r));
          return renderModuleTemplate(path, data);
        }),
      };
      const g = grid({ maxVisible: 2, renderer: slow });
      await g.setMatches(many(5));

      observers.scroll();
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      await g.filter('m 1');
      release();
      await vi.waitFor(() => expect(tile('m2.webp')).not.toBeNull());

      expect(visiblePaths()).toEqual(['m1.webp']);
    });

    it('logs a page that fails to render instead of throwing', async () => {
      const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failing = {
        render: vi
          .fn(renderModuleTemplate)
          .mockImplementationOnce(renderModuleTemplate)
          .mockRejectedValueOnce(new Error('template gone')),
      };
      const g = grid({ maxVisible: 2, renderer: failing });
      await g.setMatches(many(5));

      observers.scroll();
      await vi.waitFor(() => expect(warn).toHaveBeenCalled());

      expect(tilePaths()).toHaveLength(2);
      warn.mockRestore();
    });

    it('disconnects the observer on destroy', async () => {
      const g = grid({ maxVisible: 2 });
      await g.setMatches(many(5));

      g.destroy();

      expect(observers.disconnected).toBe(true);
    });

    it('observes against the grid itself, the element that scrolls', () => {
      const IntersectionObserver = vi.fn(function () {
        this.observe = vi.fn();
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
      });
      // Set by hand: vi.unstubAllGlobals() would also drop the setup file's Foundry globals.
      globalThis.IntersectionObserver = IntersectionObserver;
      try {
        new MatchGrid({ element, renderer, labels });

        expect(IntersectionObserver).toHaveBeenCalledWith(
          expect.any(Function),
          expect.objectContaining({ root: element, rootMargin: expect.any(String) })
        );
      } finally {
        delete globalThis.IntersectionObserver;
      }
    });

    it('renders every page in chunks when IntersectionObserver is missing', async () => {
      const chunks = [];
      const g = grid({
        maxVisible: 2,
        observerFactory: () => null,
        nextChunk: () => new Promise((resolve) => chunks.push(resolve)),
      });

      expect(await g.setMatches(many(5))).toEqual({ visible: 2, total: 5 });
      expect(sentinel()).toBeNull();

      let counted = nextCount(g);
      chunks.shift()();
      expect(await counted).toEqual({ visible: 4, total: 5 });
      counted = nextCount(g);
      chunks.shift()();
      expect(await counted).toEqual({ visible: 5, total: 5 });
      expect(tilePaths()).toHaveLength(5);
      expect(chunks).toHaveLength(0);
    });

    it('stops rendering chunks once destroyed', async () => {
      const chunks = [];
      const g = grid({
        maxVisible: 2,
        observerFactory: () => null,
        nextChunk: () => new Promise((resolve) => chunks.push(resolve)),
      });
      await g.setMatches(many(5));

      g.destroy();
      chunks.shift()();
      await Promise.resolve();
      await Promise.resolve();

      expect(tilePaths()).toHaveLength(2);
    });

    describe('keyboard', () => {
      const press = (key) => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        document.activeElement.dispatchEvent(event);
        return event;
      };
      const focused = () => document.activeElement?.dataset.path;

      it('loads the next page when End reaches the last rendered tile', async () => {
        const g = grid({ maxVisible: 2 });
        await g.setMatches(many(5));
        tile('m0.webp').focus();

        press('End');
        expect(focused()).toBe('m1.webp');
        const counted = nextCount(g);
        expect(await counted).toEqual({ visible: 4, total: 5 });
        await vi.waitFor(() => expect(focused()).toBe('m3.webp'));
      });

      it('moves past the last rendered tile with ArrowRight', async () => {
        const g = grid({ maxVisible: 2 });
        await g.setMatches(many(5));
        tile('m1.webp').focus();

        const counted = nextCount(g);
        expect(press('ArrowRight').defaultPrevented).toBe(true);
        await counted;

        await vi.waitFor(() => expect(focused()).toBe('m2.webp'));
      });

      it('stays on the last tile when every page is rendered', async () => {
        const g = grid({ maxVisible: 5 });
        await g.setMatches(many(3));
        tile('m2.webp').focus();
        renderer.render.mockClear();

        press('ArrowRight');
        press('End');

        expect(focused()).toBe('m2.webp');
        expect(renderer.render).not.toHaveBeenCalled();
      });
    });
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
