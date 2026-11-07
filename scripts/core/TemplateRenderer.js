/**
 * Token Replacer FA - Handlebars template access
 * @module core/TemplateRenderer
 */

/**
 * Renders and preloads the module's Handlebars templates.
 *
 * Foundry v13 moved the template API under `foundry.applications.handlebars`
 * and deprecated the globals; the globals remain as a defensive fallback
 * (Constitution, Article VI.1). Handlebars auto-escaping is the module's XSS
 * boundary, so every dialog goes through here.
 *
 * @see https://foundryvtt.com/api/v13/functions/foundry.applications.handlebars.renderTemplate.html
 *
 * @pattern Facade — one narrow entry point over Foundry's template API, so the
 * v12/v13 split lives in a single place.
 */
export class TemplateRenderer {
  /**
   * Render a Handlebars template (v12/v13 compatible)
   * @param {string} path - Template path
   * @param {Object} data - Template data
   * @returns {Promise<string>} Rendered HTML
   */
  async render(path, data) {
    if (foundry?.applications?.handlebars?.renderTemplate) {
      return foundry.applications.handlebars.renderTemplate(path, data);
    }
    return renderTemplate(path, data);
  }

  /**
   * Preload Handlebars templates (v12/v13 compatible)
   * @param {string[]} paths - Template paths to preload
   * @returns {Promise<void>}
   */
  async preload(paths) {
    if (foundry?.applications?.handlebars?.loadTemplates) {
      // @ts-expect-error Foundry v13 loadTemplates returns template array, not void
      return foundry.applications.handlebars.loadTemplates(paths);
    }
    // @ts-expect-error Foundry v12 loadTemplates returns template array, not void per fvtt-types
    return loadTemplates(paths);
  }
}

/** The page-wide instance. */
export const templateRenderer = new TemplateRenderer();
