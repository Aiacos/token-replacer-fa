/**
 * DirectIndexBuilder: batching, progress per batch, cancel between yields,
 * input validation and error wrapping.
 *
 * @module tests/services/index/DirectIndexBuilder.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectIndexBuilder } from '../../../scripts/services/index/DirectIndexBuilder.js';
import { CancellationToken } from '../../../scripts/services/index/CancellationToken.js';

const paths = (count) => Array.from({ length: count }, (_, i) => `FA/tokens/goblin-${i}.webp`);

/** A builder whose yield is instant and observable. */
function createBuilder(overrides = {}) {
  const added = [];
  const yieldToMain = vi.fn(async () => {});
  const builder = new DirectIndexBuilder({
    addImage: (path, name) => {
      added.push([path, name]);
      return true;
    },
    yieldToMain,
    batchSize: 10,
    ...overrides,
  });
  return { builder, added, yieldToMain };
}

describe('DirectIndexBuilder', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('adds every path, accepting strings and {path, name} objects', async () => {
    const { builder, added } = createBuilder();

    const count = await builder.build(['a/one.webp', { path: 'a/two.webp', name: 'Two' }]);

    expect(count).toBe(2);
    expect(added).toEqual([
      ['a/one.webp', null],
      ['a/two.webp', 'Two'],
    ]);
  });

  it('counts only the images addImage accepted', async () => {
    const { builder } = createBuilder({ addImage: (path) => path.endsWith('1.webp') });
    await expect(builder.build(paths(25))).resolves.toBe(3); // 1, 11, 21
  });

  it('yields and reports progress once per batch', async () => {
    const { builder, yieldToMain } = createBuilder();
    const onProgress = vi.fn();

    await builder.build(paths(25), onProgress);

    expect(yieldToMain).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls).toEqual([
      [10, 25, 10],
      [20, 25, 20],
      [25, 25, 25],
    ]);
  });

  it('stops between yields when the token is cancelled mid-build', async () => {
    const token = new CancellationToken();
    const { builder, added } = createBuilder();

    const build = builder.build(
      paths(50),
      (processed) => {
        if (processed === 20) token.cancel();
      },
      token
    );

    await expect(build).rejects.toMatchObject({ cancelled: true });
    // The batch in flight finishes; nothing after the yield runs.
    expect(added).toHaveLength(20);
  });

  it('notices a cancel that arrives during the yield itself', async () => {
    const token = new CancellationToken();
    const { builder, added } = createBuilder({ yieldToMain: async () => token.cancel() });

    await expect(builder.build(paths(50), null, token)).rejects.toMatchObject({ cancelled: true });
    // Only the first batch ran: the cancel raised during its yield is seen at once.
    expect(added).toHaveLength(10);
  });

  it('returns 0 for an empty list without yielding', async () => {
    const { builder, yieldToMain } = createBuilder();
    await expect(builder.build([])).resolves.toBe(0);
    expect(yieldToMain).not.toHaveBeenCalled();
  });

  it('rejects a non-array with invalid_paths', async () => {
    const { builder } = createBuilder();
    await expect(builder.build('nope')).rejects.toMatchObject({ errorType: 'invalid_paths' });
  });

  it('wraps a failure while adding into index_build_failed', async () => {
    const { builder } = createBuilder({
      addImage: () => {
        throw new Error('boom');
      },
    });
    await expect(builder.build(paths(3))).rejects.toMatchObject({
      errorType: 'index_build_failed',
    });
  });
});
