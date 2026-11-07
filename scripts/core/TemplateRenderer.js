/**
 * Token Replacer FA - Handlebars template access
 * @module core/TemplateRenderer
 */

/**
 * Renders and preloads the module's Handlebars templates. Handlebars
 * auto-escaping is the module's XSS boundary, so every dialog goes through here.
 *
 * Only the v13 namespace is used. v13 is the supported floor and deprecated the
 * `renderTemplate` / `loadTemplates` globals, so falling back to them would
 * only hide a broken environment behind an API Foundry is removing: a missing
 * namespace is reported as an error instead (Constitution, Article VI.1).
 *
 * @see https://foundryvtt.com/api/v13/functions/foundry.applications.handlebars.renderTemplate.html
 * @see https://foundryvtt.com/api/v13/functions/foundry.applications.handlebars.loadTemplates.html
 *
 * @pattern Facade — one narrow entry point over Foundry's template API, so the
 * dialogs never touch Foundry's namespaces directly.
 */
export class TemplateRenderer {
  /**
   * @param {function(): (Object|undefined)} [getHandlebars] - Returns
   *   `foundry.applications.handlebars` (default: read from Foundry at call time)
   */
  constructor(
    getHandlebars = () =>
      typeof foundry === 'undefined' ? undefined : foundry.applications?.handlebars
  ) {
    this._getHandlebars = getHandlebars;
  }

  /**
   * Render a Handlebars template.
   * @param {string} path - Template path
   * @param {Object} data - Template data
   * @returns {Promise<string>} Rendered HTML
   */
  async render(path, data) {
    return this._api('renderTemplate').renderTemplate(path, data);
  }

  /**
   * Preload Handlebars templates.
   * @param {string[]} paths - Template paths to preload
   * @returns {Promise<void>}
   */
  async preload(paths) {
    await this._api('loadTemplates').loadTemplates(paths);
  }

  /**
   * @param {string} method - The function the caller needs
   * @returns {any} The handlebars namespace
   * @private
   */
  _api(method) {
    const handlebars = this._getHandlebars();
    if (typeof handlebars?.[method] !== 'function') {
      throw new Error(
        `foundry.applications.handlebars.${method} is unavailable (Foundry v13+ required)`
      );
    }
    return handlebars;
  }
}

/** The page-wide instance. */
export const templateRenderer = new TemplateRenderer();
