/**
 * Token Replacer FA - Application composition root
 * @module app/TokenReplacerApp
 */

import { MODULE_ID } from '../core/Constants.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { ModuleSettings } from './ModuleSettings.js';
import { CompanionModules } from './CompanionModules.js';
import { TokenImageWriter } from './TokenImageWriter.js';
import { IndexBootstrapper } from './IndexBootstrapper.js';
import { SceneControls } from './SceneControls.js';
import { TokenReplacementWorkflow } from './TokenReplacementWorkflow.js';

/** Every Handlebars template, preloaded in `init` so the first dialog opens instantly. */
const TEMPLATES = Object.freeze([
  'modules/token-replacer-fa/templates/error.hbs',
  'modules/token-replacer-fa/templates/tva-cache.hbs',
  'modules/token-replacer-fa/templates/scan-progress.hbs',
  'modules/token-replacer-fa/templates/search-progress.hbs',
  'modules/token-replacer-fa/templates/parallel-search.hbs',
  'modules/token-replacer-fa/templates/progress.hbs',
  'modules/token-replacer-fa/templates/match-selection.hbs',
  'modules/token-replacer-fa/templates/no-match.hbs',
  'modules/token-replacer-fa/templates/match-grid.hbs',
]);

/**
 * @typedef {Object} AppServices
 * @property {{load: function(): Promise<*>}} fuseLoader
 * @property {Object} searchService
 * @property {Object} searchOrchestrator
 * @property {Object} tvaCacheService
 * @property {Object} scanService
 * @property {Object} tokenService
 * @property {Object} indexService
 * @property {Object} storageService
 * @property {Object} uiManager
 * @property {{preload: function(string[]): Promise<void>}} templateRenderer
 */

/**
 * The module's application object: wires the services into the startup
 * bootstrapper, the scene control and one workflow per run, and owns the
 * "is a run in progress" state. `main.js` constructs it with the real service
 * singletons and forwards Foundry's hooks to it; it is also exposed as
 * `window.TokenReplacerFA` for macros.
 *
 * @pattern Facade + Mediator — the one object hooks and macros talk to; it
 * routes each request to the collaborator that owns it and keeps the
 * collaborators unaware of each other (the scene control starts a run without
 * knowing the workflow exists).
 */
export class TokenReplacerApp {
  /**
   * @param {Object} deps
   * @param {AppServices} deps.services - Service instances
   * @param {ModuleSettings} [deps.settings] - Settings registry
   * @param {CompanionModules} [deps.companions] - Companion module view
   * @param {{localize: Function, orEnglish: Function, stats: Object}} [deps.localizer] - Localizer
   * @param {function(): Object} [deps.getUi] - Returns Foundry's `ui` (read lazily)
   * @param {function(TokenReplacerApp): {execute: Function, cancel: Function, cancelRequested: boolean}} [deps.createWorkflow] - Builds one run
   * @param {{log: Function}} [deps.logger] - Debug logger
   */
  constructor({
    services,
    settings = new ModuleSettings(),
    companions = new CompanionModules(),
    localizer = defaultLocalizer,
    getUi = () => ui,
    createWorkflow = undefined,
    logger = new DebugLogger('App'),
  }) {
    this._services = services;
    this._settings = settings;
    this._companions = companions;
    this._localizer = localizer;
    this._getUi = getUi;
    this._logger = logger;
    this._createWorkflow = createWorkflow ?? (() => this._defaultWorkflow());

    this._imageWriter = new TokenImageWriter({
      companions,
      tokenService: services.tokenService,
    });
    this._bootstrapper = new IndexBootstrapper({
      companions,
      fuseLoader: services.fuseLoader,
      searchService: services.searchService,
      tvaCacheService: services.tvaCacheService,
      indexService: services.indexService,
      storageService: services.storageService,
      localizer,
      getUi,
    });
    this._sceneControls = new SceneControls({
      onActivate: () => this.processTokenReplacement(),
      localizer,
      getUi,
    });

    /** @type {{execute: Function, cancel: Function, cancelRequested: boolean}|null} */
    this._run = null;
  }

  /**
   * Foundry's `ui`, read on use. Call sites spell `this._ui.notifications.*` so
   * the `npm run validate` notification-text rule still sees them.
   * @returns {Object} Foundry's ui namespace
   */
  get _ui() {
    return this._getUi();
  }

  /** @returns {boolean} True while a replacement run is in progress */
  get isProcessing() {
    return this._run !== null;
  }

  /** @returns {boolean} True when the user cancelled the run in progress */
  get cancelRequested() {
    return this._run?.cancelRequested ?? false;
  }

  /** @returns {boolean} True if Token Variant Art is active */
  get hasTVA() {
    return this._companions.hasTVA;
  }

  /** @returns {boolean} True if FA Nexus is active */
  get hasFANexus() {
    return this._companions.hasFANexus;
  }

  /** @returns {Object|null} TVA's API, or null when TVA is inactive */
  get tvaAPI() {
    return this._companions.tvaAPI;
  }

  /**
   * Localize a `TOKEN_REPLACER_FA.*` key.
   * @param {string} key - Key without the namespace prefix
   * @param {Object<string, string|number>} [data={}] - {placeholder} values
   * @returns {string} Localized string
   */
  i18n(key, data = {}) {
    return this._localizer.localize(key, data);
  }

  /**
   * Log the localization cache statistics (debug aid).
   * @returns {void}
   */
  logI18nCacheStats() {
    const { entries, hits, misses } = this._localizer.stats;
    const total = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : 0;
    console.log(
      `${MODULE_ID} | i18n cache stats: ${entries} entries, ${hits} hits, ${misses} misses (${hitRate}% hit rate)`
    );
  }

  /**
   * @param {string} key - Setting key
   * @returns {*} Setting value
   */
  getSetting(key) {
    return this._settings.get(key);
  }

  /**
   * Register every module setting. Must precede anything that logs.
   * @returns {void}
   */
  registerSettings() {
    this._settings.register();
  }

  /**
   * `init` hook: register settings, then preload templates. Never throws; a
   * failure is reported with a declared English fallback because `game.i18n`
   * may not exist yet.
   * @returns {Promise<boolean>} True if initialization succeeded
   */
  async initialize() {
    try {
      this.registerSettings();
      await this._services.templateRenderer.preload([...TEMPLATES]);
      this._logger.log('Module initialization complete');
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Initialization failed:`, error);
      const msg = this._localizer.orEnglish(
        'notifications.initFailed',
        'Token Replacer FA: Initialization failed. {error}',
        { error: error?.message || String(error) }
      );
      const tryLabel = this._localizer.orEnglish('ui.tryThis', 'Try:');
      if (error?.recoverySuggestions?.length > 0) {
        this._ui.notifications.error(`${msg} ${tryLabel} ${error.recoverySuggestions.join('. ')}`, {
          permanent: true,
        });
      } else {
        this._ui.notifications.error(msg);
      }
      return false;
    }
  }

  /**
   * `ready` hook: load Fuse.js and start the background cache/index build.
   * @returns {Promise<{background: Promise<void>|null}>} The background build, when started
   */
  async onReady() {
    console.log(`${MODULE_ID} | Module ready`);
    const started = await this._bootstrapper.run();
    this.logI18nCacheStats();
    return started;
  }

  /**
   * `getSceneControlButtons` hook: add the GM button.
   * @param {Object} controls - v13 controls record
   * @returns {boolean} True if the button was added
   */
  addSceneControlButton(controls) {
    return this._sceneControls.addButton(controls);
  }

  /**
   * Apply token art to one token (TVA API when available, direct update otherwise).
   * @param {*} token - Foundry token
   * @param {string} imagePath - Token art path
   * @returns {Promise<boolean>} True if the token was updated
   */
  replaceTokenImage(token, imagePath) {
    return this._imageWriter.write(token, imagePath);
  }

  /**
   * Start a replacement run, unless one is already in progress.
   * @returns {Promise<string>} The run outcome, or 'busy' when one was already running
   */
  async processTokenReplacement() {
    if (this._run) {
      this._ui.notifications.warn(this.i18n('notifications.inProgress'));
      return 'busy';
    }

    const run = this._createWorkflow(this);
    this._run = run;
    try {
      return await run.execute();
    } finally {
      this._run = null;
    }
  }

  /**
   * Cancel the run in progress, if any.
   * @returns {void}
   */
  cancel() {
    this._run?.cancel();
  }

  /**
   * Release the workers (page unload). Each is attempted independently.
   * @returns {void}
   */
  terminate() {
    for (const service of [this._services.indexService, this._services.searchOrchestrator]) {
      try {
        service?.terminate();
      } catch (error) {
        console.debug(`${MODULE_ID} | Cleanup error:`, error);
      }
    }
  }

  /**
   * @private
   * @returns {TokenReplacementWorkflow} A run wired to this app's services
   */
  _defaultWorkflow() {
    const s = this._services;
    return new TokenReplacementWorkflow({
      settings: this._settings,
      companions: this._companions,
      fuseLoader: s.fuseLoader,
      searchService: s.searchService,
      searchOrchestrator: s.searchOrchestrator,
      tvaCacheService: s.tvaCacheService,
      scanService: s.scanService,
      tokenService: s.tokenService,
      dialog: s.uiManager,
      imageWriter: this._imageWriter,
      localizer: this._localizer,
      getUi: this._getUi,
    });
  }
}
