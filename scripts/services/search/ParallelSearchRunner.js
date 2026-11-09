/**
 * Token Replacer FA - Batched search over creature groups
 * @module services/search/ParallelSearchRunner
 */

import { MODULE_ID } from '../../core/Constants.js';

/**
 * Searches token art for every creature group of a scene, `batchSize` groups
 * at a time. The fixed skeleton — batch, report progress, await the batch,
 * record each group — is this class; *what* searching one group means is the
 * function the caller passes.
 *
 * - **Cancellation** is honoured at batch boundaries: the searches inside a
 *   batch run concurrently and are awaited together, so the in-flight batch
 *   finishes and the rest never start.
 * - **Failure isolation**: one group's failure is logged and leaves that group
 *   out of the result; the other groups still get their matches. A
 *   cancellation surfacing from a group is not reported as a failure.
 *
 * @pattern Template Method — fixed batching skeleton, the per-group search is
 * the hook; Observer — progress goes to an optional listener per batch.
 */
export class ParallelSearchRunner {
  /**
   * @param {Object} deps - Collaborators
   * @param {number} deps.batchSize - Groups searched concurrently
   * @param {function(): boolean} deps.isCancelled - True once the user asked to stop
   * @param {{log: function(...*): void}} deps.logger - Debug logger
   */
  constructor({ batchSize, isCancelled, logger }) {
    this._batchSize = batchSize;
    this._isCancelled = isCancelled;
    this._logger = logger;
  }

  /**
   * @param {Map<string, {creatureInfo: Object, tokens: Array}>} groups - Creature groups by key
   * @param {function(Object): Promise<Array<Object>>} searchGroup - Searches one
   *   group's `creatureInfo`
   * @param {function(Object): void} [onProgress] - Receives
   *   `{type: 'batch', completed, total, currentBatch}` before each batch
   * @returns {Promise<Map<string, {matches: Array, tokens: Array, creatureInfo: Object}>>}
   */
  async run(groups, searchGroup, onProgress = null) {
    const groupArray = Array.from(groups.entries());
    const total = groupArray.length;
    const results = new Map();

    for (let i = 0; i < total; i += this._batchSize) {
      if (this._isCancelled()) {
        this._logger.log(`Parallel search cancelled after ${results.size} creature type(s)`);
        break;
      }

      const batch = groupArray.slice(i, i + this._batchSize);

      if (onProgress) {
        onProgress({
          type: 'batch',
          completed: i,
          total,
          currentBatch: batch.map(([_key, group]) => group.creatureInfo.actorName),
        });
      }

      const settled = await Promise.allSettled(
        batch.map(async ([key, group]) => ({
          key,
          group,
          matches: await searchGroup(group.creatureInfo),
        }))
      );

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          const { key, group, matches } = outcome.value;
          results.set(key, { matches, tokens: group.tokens, creatureInfo: group.creatureInfo });
        } else if (outcome.reason?.cancelled) {
          // Every search in the in-flight batch rejects with the cancellation;
          // reporting each as a failure would mislabel a deliberate stop.
          this._logger.log('Batch search stopped by cancellation');
        } else {
          console.warn(
            `${MODULE_ID} | Batch search failed for one group:`,
            outcome.reason?.message || outcome.reason
          );
        }
      }
    }

    return results;
  }
}
