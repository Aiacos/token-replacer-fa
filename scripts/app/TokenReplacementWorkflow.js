/**
 * Token Replacer FA - One token replacement run
 * @module app/TokenReplacementWorkflow
 */

import { MODULE_ID } from '../core/Constants.js';
import { DebugLogger } from '../core/DebugLogger.js';
import { ModuleError } from '../core/ModuleError.js';
import { Scheduler } from '../core/Scheduler.js';
import { localizer as defaultLocalizer } from '../core/Localizer.js';
import { VariantAssignment } from './VariantAssignment.js';

/**
 * Error-message patterns that map an unstructured error to a type the error
 * dialog can explain. First match wins.
 * @type {ReadonlyArray<{test: RegExp, type: string, recovery: string[]}>}
 */
const ERROR_CLASSES = Object.freeze([
  { test: /TVA|token-variants/, type: 'tva_missing', recovery: ['install_tva', 'check_console'] },
  { test: /cache/, type: 'cache_load_failed', recovery: ['rebuild_cache', 'reload_module'] },
  {
    test: /network|fetch/,
    type: 'network_error',
    recovery: ['check_network', 'check_file_access'],
  },
  { test: /Fuse/, type: 'fuse_load_failed', recovery: ['reload_module', 'check_network'] },
]);

/**
 * @typedef {'completed'|'cancelled'|'failed'|'nothing-to-do'} RunOutcome
 */

/**
 * One run of "replace the art of every NPC token on the scene".
 *
 * Steps, in order: guards (Fuse.js, scene, NPC tokens) → open the dialog →
 * prepare search sources (TVA cache or local scan) → group tokens by creature
 * and search → for each group pick token art (auto, confirm, or manual browse)
 * and apply it → summarise.
 *
 * Cancel is offered only up to the end of the search, before any token is
 * touched, so a cancelled run always leaves the scene exactly as it was. A
 * failure while applying one creature group marks that group's tokens failed
 * and moves on to the next group.
 *
 * @pattern Command + Template Method — one object per run with `execute()` and
 * `cancel()`; `execute()` fixes the step order and each step is a method.
 */
export class TokenReplacementWorkflow {
  /**
   * @param {Object} deps
   * @param {import('./ModuleSettings.js').ModuleSettings} deps.settings - Module settings
   * @param {import('./CompanionModules.js').CompanionModules} deps.companions - Companion module view
   * @param {{load: function(): Promise<*>}} deps.fuseLoader - Fuse.js loader
   * @param {Object} deps.searchService - Search facade
   * @param {{cancelOperation: function(): void}} deps.searchOrchestrator - Cancels an in-flight search
   * @param {Object} deps.tvaCacheService - TVA cache owner
   * @param {{buildLocalTokenIndex: function(): Promise<Array>}} deps.scanService - Local scan fallback
   * @param {Object} deps.tokenService - Token lookup and grouping
   * @param {Object} deps.dialog - The UI manager (dialog, templates, selection handlers)
   * @param {{write: function(*, string): Promise<boolean>}} deps.imageWriter - Applies token art
   * @param {{localize: Function}} [deps.localizer] - Localizer
   * @param {function(): Object} [deps.getUi] - Returns Foundry's `ui` (read lazily)
   * @param {function(): (Object|null)} [deps.getScene] - Returns the active scene
   * @param {function(number): Promise<void>} [deps.yieldToMain] - Lets the UI paint
   * @param {function(string): {assign: Function}} [deps.assignmentFor] - Assignment strategy per mode
   * @param {{log: Function}} [deps.logger] - Debug logger
   */
  constructor({
    settings,
    companions,
    fuseLoader,
    searchService,
    searchOrchestrator,
    tvaCacheService,
    scanService,
    tokenService,
    dialog,
    imageWriter,
    localizer = defaultLocalizer,
    getUi = () => ui,
    getScene = () => canvas?.scene,
    yieldToMain = (ms) => Scheduler.yieldToMain(ms),
    assignmentFor = (mode) => VariantAssignment.forMode(mode),
    logger = new DebugLogger('Workflow'),
  }) {
    this._settings = settings;
    this._companions = companions;
    this._fuseLoader = fuseLoader;
    this._searchService = searchService;
    this._searchOrchestrator = searchOrchestrator;
    this._tvaCacheService = tvaCacheService;
    this._scanService = scanService;
    this._tokenService = tokenService;
    this._dialog = dialog;
    this._imageWriter = imageWriter;
    this._localizer = localizer;
    this._getUi = getUi;
    this._getScene = getScene;
    this._yield = yieldToMain;
    this._assignmentFor = assignmentFor;
    this._logger = logger;

    this._cancelRequested = false;
    /** @type {Array<{name: string, status: string, match?: string}>} */
    this._results = [];
    this._reported = new Set();
    this._done = 0;
    this._total = 0;
    /** @type {{autoReplace: boolean, confirmReplace: boolean, threshold: number}|null} */
    this._policy = null;
  }

  /**
   * Foundry's `ui`, read on use. Call sites spell `this._ui.notifications.*` so
   * the `npm run validate` notification-text rule still sees them.
   * @returns {Object} Foundry's ui namespace
   */
  get _ui() {
    return this._getUi();
  }

  /** @returns {boolean} True once the user asked to cancel this run */
  get cancelRequested() {
    return this._cancelRequested;
  }

  /** @returns {ReadonlyArray<{name: string, status: string, match?: string}>} Per-token results so far */
  get results() {
    return this._results;
  }

  /**
   * Ask the run to stop at the next phase boundary. Only the search is
   * interrupted: the category index is built in the background by the `ready`
   * hook and never awaited here, so cancelling it would destroy a build nothing
   * retries while speeding nothing up.
   * @returns {void}
   */
  cancel() {
    this._cancelRequested = true;
    this._searchOrchestrator.cancelOperation();
    this._logger.log('Cancellation requested by user');
  }

  /**
   * Run every step. Never rejects: failures reach the user as a dialog or a
   * notification and come back as the outcome.
   * @returns {Promise<RunOutcome>} How the run ended
   */
  async execute() {
    try {
      this._searchService.clearCache();

      const npcTokens = await this._collectTokens();
      if (!npcTokens) return 'nothing-to-do';
      this._total = npcTokens.length;

      this._ui.notifications.info(this._localizer.localize('notifications.started'));
      await this._openDialog();
      this._searchService.init();

      const localIndex = await this._prepareSources();
      if (await this._abortIfCancelled()) return 'cancelled';

      const searchResults = await this._search(npcTokens, localIndex);
      if (await this._abortIfCancelled()) return 'cancelled';

      // Past this point tokens start changing, so Cancel no longer applies:
      // disarm it rather than leave a button that silently does nothing.
      this._dialog.setCancelCallback(null);

      await this._applyAll(searchResults, localIndex);
      await this._summarise();
      return 'completed';
    } catch (error) {
      // A cancellation reaches here when it interrupts an in-flight search; it
      // is an outcome, not a failure. Setting the flag matters: an error that
      // carries the marker while the flag is clear would otherwise leave the
      // user staring at a frozen progress dialog.
      if (error?.cancelled || this._cancelRequested) {
        this._cancelRequested = true;
        await this._abortIfCancelled();
        return 'cancelled';
      }
      await this._reportError(error);
      return 'failed';
    } finally {
      // Drop the callback so a stale closure cannot fire against the next run
      this._dialog.setCancelCallback(null);
    }
  }

  /**
   * Guards: Fuse.js loaded, a scene is active, it has NPC tokens.
   * No scene and no tokens are "nothing to do", not errors.
   * @private
   * @returns {Promise<Array|null>} NPC tokens, or null when there is nothing to do
   */
  async _collectTokens() {
    const Fuse = await this._fuseLoader.load();
    if (!Fuse) {
      throw ModuleError.of('fuse_load_failed', 'Fuse.js library failed to load', [
        'reload_module',
        'check_network',
      ]);
    }

    const scene = this._getScene();
    if (!scene) {
      this._ui.notifications.warn(this._localizer.localize('notifications.noScene'));
      return null;
    }

    const npcTokens = this._tokenService.getSceneNPCTokens();
    if (npcTokens.length === 0) {
      this._ui.notifications.info(this._localizer.localize('notifications.noTokens'));
      return null;
    }
    this._logger.log(`Found ${npcTokens.length} NPC tokens on "${scene.name}"`);
    return npcTokens;
  }

  /**
   * Open the progress dialog and arm its Cancel button.
   * @private
   * @returns {Promise<void>}
   */
  async _openDialog() {
    const dialog = await this._dialog.createMainDialog(
      await this._dialog.createScanProgressHTML(
        this._localizer.localize('ui.initializing'),
        0,
        0,
        0,
        0
      ),
      // Closing the dialog does not cancel: the loops below stop on their own
      // once they see it closed.
      () => this._logger.log('Dialog closed by user')
    );
    // ApplicationV2 needs force:true for the first display (Article VI.1).
    await dialog.render({ force: true });
    this._dialog.setCancelCallback(() => this.cancel());
  }

  /**
   * Make sure something can be searched: TVA's cache (refreshed first when the
   * setting asks for it), or a local directory scan without TVA.
   * @private
   * @returns {Promise<Array>} Local index; empty when searching through TVA
   */
  async _prepareSources() {
    const hasTVA = this._companions.hasTVA;
    let localIndex = [];

    if (hasTVA && this._settings.useTVACache) {
      await this._loadTvaCache();
    } else {
      localIndex = await this._scanService.buildLocalTokenIndex();
      this._logger.log(`Local index built: ${localIndex.length} images`);
    }

    if (!hasTVA && localIndex.length === 0) {
      throw ModuleError.of(
        'tva_missing',
        'No search sources available (TVA not active and local index empty)',
        ['install_tva']
      );
    }
    return localIndex;
  }

  /**
   * Load (or refresh, then force-reload) TVA's cache.
   * @private
   * @returns {Promise<void>}
   */
  async _loadTvaCache() {
    this._dialog.updateDialogContent(await this._dialog.createTVACacheHTML(false));
    await this._yield(100);

    const tvaAPI = this._companions.tvaAPI;
    let loaded;
    if (this._settings.refreshTVACache && tvaAPI?.cacheImages) {
      this._dialog.updateDialogContent(await this._dialog.createTVACacheHTML(true));
      await this._yield(50);
      try {
        await tvaAPI.cacheImages();
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to refresh TVA cache, using the existing one:`, error);
      }
      await this._yield(100);
      await this._showTvaLoading();
      // Clears the in-memory and IndexedDB copies, then re-reads TVA's file
      loaded = await this._tvaCacheService.reloadTVACache();
    } else {
      await this._showTvaLoading();
      loaded = await this._tvaCacheService.loadTVACache();
    }

    if (loaded) {
      const stats = this._tvaCacheService.getTVACacheStats();
      if (stats.totalImages === 0) {
        throw ModuleError.of('tva_cache_empty', 'TVA cache loaded but contains 0 images', [
          'rebuild_cache',
          'check_file_access',
        ]);
      }
      this._logger.log(`TVA direct cache ready: ${stats.totalImages} images`);
    } else {
      console.warn(`${MODULE_ID} | Failed to load TVA cache directly, will use API fallback`);
    }
    await this._yield(100);
  }

  /** @private */
  async _showTvaLoading() {
    this._dialog.updateDialogContent(
      await this._dialog.createTVACacheHTML(false, this._localizer.localize('ui.loadingTvaCache'))
    );
  }

  /**
   * Group tokens by creature and search token art for every group.
   * @private
   * @param {Array} npcTokens - Tokens on the scene
   * @param {Array} localIndex - Local index (empty with TVA)
   * @returns {Promise<Map<string, {matches: Array, tokens: Array, creatureInfo: Object}>>} Results per group
   */
  async _search(npcTokens, localIndex) {
    const groups = this._tokenService.groupTokensByCreature(npcTokens);
    const uniqueCreatures = groups.size;
    this._logger.log(`Searching ${uniqueCreatures} creature types for ${npcTokens.length} tokens`);

    this._dialog.updateDialogContent(
      await this._dialog.createParallelSearchHTML(
        0,
        uniqueCreatures,
        uniqueCreatures,
        npcTokens.length,
        []
      )
    );
    await this._yield(50);

    return this._searchService.parallelSearchCreatures(groups, localIndex, async (info) => {
      if (info.type === 'batch' && this._dialog.isDialogOpen()) {
        this._dialog.updateDialogContent(
          await this._dialog.createParallelSearchHTML(
            info.completed,
            info.total,
            uniqueCreatures,
            npcTokens.length,
            info.currentBatch
          )
        );
      }
    });
  }

  /**
   * Pick and apply token art group by group. A group that fails is reported
   * and the remaining groups still run.
   * @private
   * @param {Map} searchResults - Results per creature group
   * @param {Array} localIndex - Local index, for the manual category browser
   * @returns {Promise<void>}
   */
  async _applyAll(searchResults, localIndex) {
    this._policy = {
      autoReplace: this._settings.autoReplace,
      confirmReplace: this._settings.confirmReplace,
      threshold: this._settings.fuzzyThreshold,
    };

    await this._progress(this._localizer.localize('dialog.replacing'));
    await this._yield(50);

    for (const group of searchResults.values()) {
      if (!this._dialog.isDialogOpen()) break;
      try {
        const selection =
          group.matches.length === 0
            ? await this._chooseManually(group, localIndex)
            : await this._chooseFromMatches(group);
        await this._apply(group, selection);
      } catch (error) {
        console.warn(
          `${MODULE_ID} | Token replacement failed for "${group.creatureInfo?.actorName}":`,
          error
        );
        for (const token of group.tokens) {
          if (!this._reported.has(token)) await this._report(group, token, 'failed');
        }
      }
    }
  }

  /**
   * No match found: let the user browse categories for this creature.
   * @private
   * @returns {Promise<{paths: string[]|null, mode?: string}>} The user's selection
   */
  async _chooseManually(group, localIndex) {
    const { creatureInfo, tokens } = group;
    this._dialog.updateDialogContent(
      await this._dialog.createNoMatchHTML(creatureInfo, tokens.length)
    );
    await this._yield(50);

    const dialogEl = this._dialog.getDialogElement();
    const selection = dialogEl
      ? await this._dialog.setupNoMatchHandlers(
          dialogEl,
          creatureInfo,
          localIndex,
          tokens.length,
          (type, idx, term, cb) => this._searchService.searchByCategory(type, idx, term, cb)
        )
      : null;

    await this._progress(this._localizer.localize('dialog.replacing'));
    await this._yield(50);
    return { paths: selection?.paths ?? null, mode: selection?.mode };
  }

  /**
   * Matches found: auto-apply a good-enough best match, ask the user, or take
   * the best match unasked, depending on the settings.
   * @private
   * @returns {Promise<{paths: string[]|null, mode?: string}>} The chosen art
   */
  async _chooseFromMatches(group) {
    const { matches, tokens, creatureInfo } = group;
    const best = matches[0];
    const score = best.score !== undefined ? 1 - best.score : 0;
    const { autoReplace, confirmReplace, threshold } = this._policy;

    if ((autoReplace && score >= 1 - threshold) || !confirmReplace) {
      return { paths: [best.path] };
    }

    this._dialog.updateDialogContent(
      await this._dialog.createMatchSelectionHTML(creatureInfo, matches, tokens.length)
    );
    await this._yield(50);

    const dialogEl = this._dialog.getDialogElement();
    const selection = dialogEl ? await this._dialog.setupMatchSelectionHandlers(dialogEl) : null;

    await this._progress(this._localizer.localize('dialog.replacing'));
    await this._yield(50);
    return { paths: selection?.paths ?? null, mode: selection?.mode };
  }

  /**
   * Apply the chosen art to the group's tokens, or mark them skipped.
   * @private
   * @param {{tokens: Array, creatureInfo: Object}} group - Creature group
   * @param {{paths: string[]|null, mode?: string}} selection - Chosen art and assignment mode
   * @returns {Promise<void>}
   */
  async _apply(group, selection) {
    const assignments = this._assignmentFor(selection.mode).assign(
      group.tokens,
      selection.paths ?? []
    );

    if (assignments.length === 0) {
      for (const token of group.tokens) {
        if (!this._dialog.isDialogOpen()) break;
        await this._report(group, token, 'skipped');
      }
      return;
    }

    for (const { token, path } of assignments) {
      if (!this._dialog.isDialogOpen()) break;
      const success = await this._imageWriter.write(token, path);
      const match = path
        .split('/')
        .pop()
        .replace(/\.[^/.]+$/, '');
      await this._report(group, token, success ? 'success' : 'failed', match);
    }
  }

  /**
   * Record one token's result and refresh the progress view.
   * @private
   */
  async _report(group, token, status, match = undefined) {
    this._done++;
    this._reported.add(token);
    const result = { name: `${group.creatureInfo.actorName} (${token.name})`, status };
    if (match !== undefined) result.match = match;
    this._results.push(result);
    const label = status === 'skipped' ? 'dialog.skipped' : 'dialog.replacing';
    await this._progress(this._localizer.localize(label));
  }

  /** @private */
  async _progress(status) {
    this._dialog.updateDialogContent(
      await this._dialog.createProgressHTML(this._done, this._total, status, this._results)
    );
  }

  /**
   * Final progress view and the success/failure notifications. Skipped when
   * the user closed the dialog: they already left the run.
   * @private
   * @returns {Promise<void>}
   */
  async _summarise() {
    if (!this._dialog.isDialogOpen()) return;
    const successCount = this._results.filter((r) => r.status === 'success').length;
    const failedCount = this._results.filter((r) => r.status === 'failed').length;

    this._done = this._total;
    await this._progress(this._localizer.localize('dialog.complete'));

    this._ui.notifications.info(
      this._localizer.localize('notifications.complete', { count: successCount })
    );
    if (failedCount > 0) {
      this._ui.notifications.warn(
        this._localizer.localize('notifications.replaceFailed', { count: failedCount })
      );
    }
  }

  /**
   * Report a cancelled run, in the dialog when it is open.
   * @private
   * @returns {Promise<boolean>} True if the run should stop
   */
  async _abortIfCancelled() {
    if (!this._cancelRequested) return false;

    this._logger.log('Run aborted by user before any token was modified');
    this._dialog.setCancelCallback(null);
    const message = this._localizer.localize('ui.cancelled');
    if (this._dialog.isDialogOpen()) {
      this._dialog.updateDialogContent(
        await this._dialog.createErrorHTML({ errorType: 'info', message })
      );
    } else {
      this._ui.notifications.info(message);
    }
    return true;
  }

  /**
   * Show a failure: in the dialog when it is open, as a notification otherwise.
   * @private
   * @param {*} error - What went wrong
   * @returns {Promise<void>}
   */
  async _reportError(error) {
    console.error(`${MODULE_ID} | Error during token replacement:`, error);
    const display = this._toDisplayError(error);

    if (this._dialog.isDialogOpen()) {
      this._dialog.updateDialogContent(await this._dialog.createErrorHTML(display));
      return;
    }

    const msg = this._localizer.localize('notifications.processingError', {
      error: display.message,
    });
    if (display.recoverySuggestions?.length > 0) {
      const tryLabel = this._localizer.localize('ui.tryThis');
      this._ui.notifications.error(`${msg} ${tryLabel} ${display.recoverySuggestions.join('. ')}`, {
        permanent: true,
      });
    } else {
      this._ui.notifications.error(msg);
    }
  }

  /**
   * Structured errors from the services pass through; anything else is
   * classified by its message so the error dialog can still suggest a fix.
   * @private
   * @param {*} error - What went wrong
   * @returns {{errorType: string, message: string, recoverySuggestions: string[]}} Display error
   */
  _toDisplayError(error) {
    if (error?.errorType && error.message && error.recoverySuggestions) return error;

    const message = error?.message || String(error);
    const match = ERROR_CLASSES.find(({ test }) => test.test(message));
    return ModuleError.of(
      match?.type ?? 'unknown',
      message,
      match?.recovery ?? ['check_console', 'reload_module', 'contact_support']
    );
  }
}
