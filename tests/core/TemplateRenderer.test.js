/**
 * Tests for TemplateRenderer: the facade over Foundry's v13 Handlebars API.
 *
 * v13 is the supported floor, so the deprecated `renderTemplate` /
 * `loadTemplates` globals are no longer a fallback: a missing namespace is a
 * clear error, not a silent call into an API Foundry is removing.
 *
 * @module tests/core/TemplateRenderer.test
 */

import { describe, it, expect, vi } from 'vitest';
import { TemplateRenderer } from '../../scripts/core/TemplateRenderer.js';

/** A renderer over an injected handlebars namespace. */
const over = (handlebars) => new TemplateRenderer(() => handlebars);

describe('TemplateRenderer', () => {
  it('renders through foundry.applications.handlebars', async () => {
    const renderTemplate = vi.fn(async () => '<p>v13</p>');

    await expect(over({ renderTemplate }).render('modules/x/error.hbs', { a: 1 })).resolves.toBe(
      '<p>v13</p>'
    );
    expect(renderTemplate).toHaveBeenCalledWith('modules/x/error.hbs', { a: 1 });
  });

  it('propagates a render failure to the caller', async () => {
    const renderTemplate = vi.fn(async () => Promise.reject(new Error('no template')));

    await expect(over({ renderTemplate }).render('modules/x/missing.hbs', {})).rejects.toThrow(
      'no template'
    );
  });

  it('preloads through foundry.applications.handlebars', async () => {
    const loadTemplates = vi.fn(async () => []);

    await over({ loadTemplates }).preload(['a.hbs', 'b.hbs']);
    expect(loadTemplates).toHaveBeenCalledWith(['a.hbs', 'b.hbs']);
  });

  it('never calls the deprecated globals when the namespace is missing', async () => {
    const legacy = vi.fn(async () => '<p>legacy</p>');
    const saved = { render: globalThis.renderTemplate, load: globalThis.loadTemplates };
    vi.stubGlobal('renderTemplate', legacy);
    vi.stubGlobal('loadTemplates', legacy);
    try {
      await expect(over(undefined).render('modules/x/error.hbs', {})).rejects.toThrow(
        /foundry\.applications\.handlebars/
      );
      await expect(over(undefined).preload([])).rejects.toThrow(
        /foundry\.applications\.handlebars/
      );
      expect(legacy).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('renderTemplate', saved.render);
      vi.stubGlobal('loadTemplates', saved.load);
    }
  });

  it('reads the namespace from Foundry by default, at call time', async () => {
    const renderer = new TemplateRenderer();
    await expect(renderer.render('modules/x/error.hbs', {})).resolves.toBe(
      '<div>mock template</div>'
    );
  });
});
