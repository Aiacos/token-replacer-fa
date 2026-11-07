/**
 * Token Replacer FA - Startup index bootstrap
 * @module app/IndexBootstrapper
 */

import { MODULE_ID } from '../core/Constants.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { StoppableNotification } from './StoppableNotification.js';

/** IndexedDB key of the persisted category index (owned by IndexService). */

/**
 * Runs the `ready`-hook startup: load Fuse.js, report companion modules, then —
 * in the background — load the TVA cache and build the category index.
 *
 * Only the GM-only scene control ever reads the index, so a player's browser
 * skips everything. The background phase never rejects: a failed cache load or
 * index build degrades searches, it does not break the world.
 *
 * @pattern Facade + Template Method — one `run()` over five services, whose
 * fixed step order (guard → Fuse → dependencies → search init → background
 * cache/index) lives in `run()` while each step is its own method.
 */
export class IndexBootstrapper {
  /**
   * @param {Object} deps
   * @param {import('./CompanionModules.js').CompanionModules} deps.companions - Companion module view
   * @param {{load: function(): Promise<*>}} deps.fuseLoader - Fuse.js loader
   * @param {{init: function(): void}} deps.searchService - Search facade
   * @param {Object} deps.tvaCacheService - TVA cache owner
   * @param {Object} deps.indexService - Category index owner
   * @param {{has: function(string): Promise<boolean>}} deps.storageService - Persistent storage
   * @param {StoppableNotification} [deps.notification] - Click-to-stop notification
   * @param {{localize: Function, orEnglish: Function}} [deps.localizer] - Localizer
   * @param {function(): boolean} [deps.isGM] - Whether the current user is a GM
   * @param {function(): Object} [deps.getUi] - Returns Foundry's `ui` (read lazily)
   * @param {{log: Function}} [deps.logger] - Debug logger
   * @param {string} [deps.indexCacheKey] - Storage key whose presence means "cached index"
   */
  constructor({
    companions,
    fuseLoader,
    searchService,
    tvaCacheService,
    indexService,
    storageService,
    notification = new StoppableNotification(),
    localizer = defaultLocalizer,
    isGM = () => game.user.isGM,
    getUi = () => ui,
    logger = new DebugLogger('IndexBootstrapper'),
    // The index owns its storage key; reading it from the service's class keeps
    // one source of truth instead of a copied string.
    indexCacheKey = indexService?.constructor?.CACHE_KEY,
  }) {
    this._companions = companions;
    this._fuseLoader = fuseLoader;
    this._searchService = searchService;
    this._tvaCacheService = tvaCacheService;
    this._indexService = indexService;
    this._storageService = storageService;
    this._notification = notification;
    this._localizer = localizer;
    this._isGM = isGM;
    this._getUi = getUi;
    this._logger = logger;
    this._indexCacheKey = indexCacheKey;
  }

  /**
   * Foundry's `ui`, read on use. Call sites spell `this._ui.notifications.*` so
   * the `npm run validate` notification-text rule still sees them.
   * @returns {Object} Foundry's ui namespace
   */
  get _ui() {
    return this._getUi();
  }

  /**
   * Run the startup sequence. The foreground steps are awaited; the cache load
   * and index build are started and returned unawaited, so `ready` is not held
   * up by a multi-minute build.
   * @returns {Promise<{background: Promise<void>|null}>} The background task, or null when skipped
   */
  async run() {
    if (!this._isGM()) return { background: null };

    await this.loadFuse();
    this.reportDependencies();
    this._searchService.init();

    if (!this._companions.hasTVA) {
      this._logger.log('TVA not available, skipping cache load and index build');
      return { background: null };
    }
    console.log(`${MODULE_ID} | Loading TVA cache and building index in background...`);
    return { background: this.buildInBackground() };
  }

  /**
   * Load Fuse.js, warning the GM when it cannot be loaded.
   * @returns {Promise<boolean>} True if Fuse.js is available
   */
  async loadFuse() {
    const Fuse = await this._fuseLoader.load();
    if (!Fuse) {
      this._ui.notifications.warn(this._localizer.localize('notifications.fuseLoadFailed'));
      return false;
    }
    this._logger.log('Fuse.js library loaded');
    return true;
  }

  /**
   * Log which companion modules are active.
   * @returns {void}
   */
  reportDependencies() {
    console.log(`${MODULE_ID} | Token Variant Art available: ${this._companions.hasTVA}`);
    console.log(`${MODULE_ID} | FA Nexus available: ${this._companions.hasFANexus}`);
  }

  /**
   * Load the TVA cache, then build the index. Never rejects: each step owns
   * its failures.
   * @returns {Promise<void>}
   */
  async buildInBackground() {
    await this.loadTvaCache();
    await this.buildIndex();
  }

  /**
   * Load the TVA cache. A failure is logged and the index is still built from
   * whatever the fallback search paths can offer.
   * @returns {Promise<boolean>} True if the cache loaded
   */
  async loadTvaCache() {
    try {
      const loaded = await this._tvaCacheService.loadTVACache();
      if (loaded) {
        const stats = this._tvaCacheService.getTVACacheStats();
        console.log(
          `${MODULE_ID} | TVA direct cache ready: ${stats.totalImages} images in ${stats.categories} categories`
        );
      } else {
        console.warn(`${MODULE_ID} | Failed to load TVA cache directly, will use fallback methods`);
      }
      return Boolean(loaded);
    } catch (error) {
      console.warn(`${MODULE_ID} | TVA cache load error:`, error);
      return false;
    }
  }

  /**
   * Build the category index. A first-time build shows progress and a stop
   * control; a rebuild from the persisted index finishes before anyone could
   * reach for either, so it stays silent.
   * @returns {Promise<boolean>} True if the index is ready
   */
  async buildIndex() {
    try {
      console.log(`${MODULE_ID} | Building image index in background...`);
      const hasCache = await this._storageService.has(this._indexCacheKey);
      this._logger.log(`Index cache ${hasCache ? 'found' : 'missing, first-time build'}`);

      let notification = { dismiss: () => {} };
      if (!hasCache) {
        this._ui.notifications.info(
          this._localizer.orEnglish(
            'notifications.indexingStart',
            'Token Replacer FA: First-time setup - building image index in background. This may take several minutes but only happens once.'
          ),
          { permanent: false }
        );
        notification = this._notification.show(
          this._localizer.localize('notifications.indexingStoppable'),
          () => {
            console.log(`${MODULE_ID} | Index build stopped by user`);
            this._indexService.cancelOperation();
          }
        );
      }

      const tvaCacheImages = this._tvaCacheService.isTVACacheLoaded
        ? this._tvaCacheService.tvaCacheImages
        : null;
      let success;
      try {
        success = await this._indexService.build(
          false,
          hasCache ? null : this._throttledProgress(),
          tvaCacheImages
        );
      } finally {
        notification.dismiss();
      }

      if (!success) {
        console.warn(`${MODULE_ID} | Index build failed, will use direct API calls`);
        return false;
      }
      const stats = this._indexService.getStats();
      console.log(`${MODULE_ID} | Image index ready: ${stats.totalImages} images`);
      if (!hasCache) {
        this._ui.notifications.info(
          this._localizer.orEnglish(
            'notifications.indexingComplete',
            'Token Replacer FA: Index ready! {count} images indexed.',
            { count: stats.totalImages }
          ),
          { permanent: false }
        );
      }
      return true;
    } catch (error) {
      // Stopping is an outcome the user asked for, not a failure — but it does
      // leave the session without a category index, so say so rather than let
      // searches quietly get slower.
      if (error?.cancelled) {
        console.log(`${MODULE_ID} | Index build cancelled by user`);
        this._ui.notifications.info(this._localizer.localize('notifications.indexingStopped'));
      } else {
        console.warn(`${MODULE_ID} | Index build error:`, error);
      }
      return false;
    }
  }

  /**
   * Progress reporter throttled to ~10% steps, so a 50k-image build does not
   * flood the notification log (Constitution, Article III.3).
   * @private
   * @returns {function(number, number, number): void} Progress callback
   */
  _throttledProgress() {
    let lastNotifiedPercent = -1;
    return (current, total, images) => {
      const percent = Math.round((current / total) * 100);
      // Rounding maps the last ~0.5% of items to 100: announce it once.
      if (percent === lastNotifiedPercent) return;
      if (percent < 100 && percent - lastNotifiedPercent < 10) return;
      lastNotifiedPercent = percent;
      this._ui.notifications.info(
        this._localizer.orEnglish(
          'notifications.indexing',
          'Token Replacer FA: Building index... {percent}% ({images} images)',
          { percent, images }
        ),
        { permanent: false }
      );
    };
  }
}
