/**
 * Tests for TemplateRenderer: the facade over Foundry's v13 and legacy
 * Handlebars template API.
 *
 * @module tests/core/TemplateRenderer.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TemplateRenderer } from '../../scripts/core/TemplateRenderer.js';

describe('TemplateRenderer', () => {
  let originalFoundry;
  let renderer;

  let originalRender;
  let originalLoad;

  // Saved and restored by hand: vi.unstubAllGlobals() would also remove the
  // `game` stub the setup file installs for every test.
  beforeEach(() => {
    originalFoundry = globalThis.foundry;
    originalRender = globalThis.renderTemplate;
    originalLoad = globalThis.loadTemplates;
    renderer = new TemplateRenderer();
  });

  afterEach(() => {
    globalThis.foundry = originalFoundry;
    globalThis.renderTemplate = originalRender;
    globalThis.loadTemplates = originalLoad;
  });

  it('renders through foundry.applications.handlebars on v13', async () => {
    const renderTemplate = vi.fn(async () => '<p>v13</p>');
    globalThis.foundry = { applications: { handlebars: { renderTemplate } } };

    await expect(renderer.render('modules/x/error.hbs', { a: 1 })).resolves.toBe('<p>v13</p>');
    expect(renderTemplate).toHaveBeenCalledWith('modules/x/error.hbs', { a: 1 });
  });

  it('falls back to the global renderTemplate when the namespace is absent', async () => {
    globalThis.foundry = {};
    const legacy = vi.fn(async () => '<p>legacy</p>');
    globalThis.renderTemplate = legacy;

    await expect(renderer.render('modules/x/error.hbs', {})).resolves.toBe('<p>legacy</p>');
    expect(legacy).toHaveBeenCalledWith('modules/x/error.hbs', {});
  });

  it('propagates a render failure to the caller', async () => {
    globalThis.foundry = {
      applications: {
        handlebars: { renderTemplate: vi.fn(async () => Promise.reject(new Error('no template'))) },
      },
    };

    await expect(renderer.render('modules/x/missing.hbs', {})).rejects.toThrow('no template');
  });

  it('preloads through foundry.applications.handlebars on v13', async () => {
    const loadTemplates = vi.fn(async () => []);
    globalThis.foundry = { applications: { handlebars: { loadTemplates } } };

    await renderer.preload(['a.hbs', 'b.hbs']);
    expect(loadTemplates).toHaveBeenCalledWith(['a.hbs', 'b.hbs']);
  });

  it('falls back to the global loadTemplates when the namespace is absent', async () => {
    globalThis.foundry = {};
    const legacy = vi.fn(async () => []);
    globalThis.loadTemplates = legacy;

    await renderer.preload([]);
    expect(legacy).toHaveBeenCalledWith([]);
  });
});
