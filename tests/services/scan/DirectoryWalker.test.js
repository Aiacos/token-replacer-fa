/**
 * DirectoryWalker — recursive FilePicker walk as an async iterator.
 * @module tests/services/scan/DirectoryWalker
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectoryWalker } from '../../../scripts/services/scan/DirectoryWalker.js';

/** A browse() over an in-memory tree: { dirPath: { files: [], dirs: [] } }. */
function createBrowse(tree) {
  return vi.fn(async (path) => {
    const node = tree[path];
    if (node instanceof Error) throw node;
    return node ?? null;
  });
}

const noExclusions = { isExcluded: () => false };

async function collect(iterator) {
  const out = [];
  for await (const item of iterator) out.push(item);
  return out;
}

describe('DirectoryWalker', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it('yields images recursively, naming and categorizing them by folder', async () => {
    const browse = createBrowse({
      root: { files: ['root/Wolf_Grey-01.webp', 'root/readme.txt'], dirs: ['root/Undead'] },
      'root/Undead': { files: ['root/Undead/Skeleton.PNG'], dirs: [] },
    });
    const walker = new DirectoryWalker({
      browse,
      pathFilter: noExclusions,
      yieldToMain: async () => {},
    });

    const images = await collect(walker.walk('root'));

    expect(images).toEqual([
      {
        path: 'root/Wolf_Grey-01.webp',
        name: 'Wolf Grey 01',
        fileName: 'Wolf_Grey-01.webp',
        category: 'root',
        source: 'local',
      },
      {
        path: 'root/Undead/Skeleton.PNG',
        name: 'Skeleton',
        fileName: 'Skeleton.PNG',
        category: 'Undead',
        source: 'local',
      },
    ]);
  });

  it('stops descending past maxDepth', async () => {
    const browse = createBrowse({
      a: { files: ['a/0.webp'], dirs: ['a/b'] },
      'a/b': { files: ['a/b/1.webp'], dirs: ['a/b/c'] },
      'a/b/c': { files: ['a/b/c/2.webp'], dirs: [] },
    });
    const walker = new DirectoryWalker({
      browse,
      pathFilter: noExclusions,
      yieldToMain: async () => {},
    });

    const images = await collect(walker.walk('a', { maxDepth: 1 }));

    expect(images.map((i) => i.path)).toEqual(['a/0.webp', 'a/b/1.webp']);
    expect(browse).not.toHaveBeenCalledWith('a/b/c');
  });

  it('yields each path once per walk', async () => {
    const browse = createBrowse({
      a: { files: ['shared.webp', 'shared.webp'], dirs: ['b'] },
      b: { files: ['shared.webp'], dirs: [] },
    });
    const walker = new DirectoryWalker({
      browse,
      pathFilter: noExclusions,
      yieldToMain: async () => {},
    });

    expect(await collect(walker.walk('a'))).toHaveLength(1);
  });

  it('logs and skips a directory whose browse throws, and keeps walking its siblings', async () => {
    const browse = createBrowse({
      root: { files: [], dirs: ['root/broken', 'root/ok'] },
      'root/broken': new Error('permission denied'),
      'root/ok': { files: ['root/ok/a.webp'], dirs: [] },
    });
    const walker = new DirectoryWalker({
      browse,
      pathFilter: noExclusions,
      yieldToMain: async () => {},
    });

    const images = await collect(walker.walk('root'));

    expect(images.map((i) => i.path)).toEqual(['root/ok/a.webp']);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('root/broken'),
      expect.any(Error)
    );
  });

  it('skips excluded files and does not enter excluded folders', async () => {
    const browse = createBrowse({
      root: { files: ['root/a.webp', 'root/tree.webp'], dirs: ['root/props'] },
      'root/props': { files: ['root/props/x.webp'], dirs: [] },
    });
    const pathFilter = { isExcluded: (p) => p.includes('props') || p.includes('tree') };
    const walker = new DirectoryWalker({ browse, pathFilter, yieldToMain: async () => {} });

    const images = await collect(walker.walk('root'));

    expect(images.map((i) => i.path)).toEqual(['root/a.webp']);
    expect(browse).not.toHaveBeenCalledWith('root/props');
  });

  it('reports progress per browsed directory', async () => {
    const browse = createBrowse({ root: { files: ['root/a.webp'], dirs: [] } });
    const onProgress = vi.fn();
    const walker = new DirectoryWalker({
      browse,
      pathFilter: noExclusions,
      yieldToMain: async () => {},
    });

    await collect(walker.walk('root', { onProgress }));

    expect(onProgress).toHaveBeenCalledWith({
      currentDir: 'root',
      depth: 0,
      filesFound: 1,
      dirsFound: 0,
    });
  });

  it('yields to the main thread every 30 images', async () => {
    const files = Array.from({ length: 65 }, (_, i) => `root/${i}.webp`);
    const yieldToMain = vi.fn(async () => {});
    const walker = new DirectoryWalker({
      browse: createBrowse({ root: { files, dirs: [] } }),
      pathFilter: noExclusions,
      yieldToMain,
    });

    await collect(walker.walk('root'));

    expect(yieldToMain).toHaveBeenCalledTimes(2);
  });

  it('can be stopped early without browsing the rest of the tree', async () => {
    const browse = createBrowse({
      root: { files: ['root/a.webp'], dirs: ['root/sub'] },
      'root/sub': { files: ['root/sub/b.webp'], dirs: [] },
    });
    const walker = new DirectoryWalker({
      browse,
      pathFilter: noExclusions,
      yieldToMain: async () => {},
    });

    for await (const _image of walker.walk('root')) break;

    expect(browse).toHaveBeenCalledTimes(1);
  });
});
