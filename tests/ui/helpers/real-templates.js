/**
 * Real Handlebars templates and real English strings for UI tests.
 *
 * The global Foundry mock renders every template as `<div>mock template</div>`
 * and localizes every key to itself, which is fine for services but hides
 * exactly what the UI tests need to see: the markup a user gets, and whether a
 * label is a translated sentence or a raw key. These helpers swap in the
 * module's own `.hbs` files and `lang/en.json`.
 *
 * @module tests/ui/helpers/real-templates
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Handlebars from 'handlebars';
import { vi } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MODULE_PREFIX = 'modules/token-replacer-fa/';

const english = JSON.parse(readFileSync(path.join(ROOT, 'lang/en.json'), 'utf8'));

/**
 * Look a fully-qualified key up in lang/en.json the way Foundry does: a missing
 * key comes back as the key itself.
 * @param {string} key - e.g. TOKEN_REPLACER_FA.ui.apply
 * @returns {string}
 */
export function englishFor(key) {
  const value = key.split('.').reduce((node, part) => node?.[part], english);
  return typeof value === 'string' ? value : key;
}

const compiled = new Map();

/**
 * Render a module template from disk.
 * @param {string} templatePath - modules/token-replacer-fa/templates/x.hbs
 * @param {object} data - Template context
 * @returns {Promise<string>}
 */
export async function renderModuleTemplate(templatePath, data) {
  const relative = templatePath.replace(MODULE_PREFIX, '');
  let template = compiled.get(relative);
  if (!template) {
    template = Handlebars.compile(readFileSync(path.join(ROOT, relative), 'utf8'));
    compiled.set(relative, template);
  }
  return template(data);
}

/**
 * Point the global Foundry mocks at the real templates and English strings.
 * Call from beforeEach: the setup file's mocks are shared by every test file.
 */
export function useRealTemplates() {
  foundry.applications.handlebars.renderTemplate.mockImplementation(renderModuleTemplate);
  game.i18n.localize.mockImplementation(englishFor);
}

/**
 * Replace localStorage with an in-memory Storage for this test file. Node's
 * own experimental localStorage shadows jsdom's and is unusable without a
 * backing file, so the dialogs would otherwise log a warning on every load.
 * @returns {Map<string, string>} The backing map, for assertions
 */
export function useMemoryStorage() {
  const data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  });
  return data;
}
