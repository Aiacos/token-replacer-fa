/**
 * ScanService — local index building and the TVA API fallback, with an
 * injected FilePicker browse and settings.
 * @module tests/services/ScanService
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScanService, scanService } from '../../scripts/services/ScanService.js';

const noExclusions = { isExcluded: () => false };

function createBrowse(tree) {
  return vi.fn(async (path) => {
    const node = tree[path];
    if (node instanceof Error) throw node;
    return node ?? { files: [], dirs: [] };
  });
}

describe('ScanService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('exports a singleton', () => {
    expect(scanService).toBeInstanceOf(ScanService);
    expect(scanService.imageExtensions).toContain('.webp');
  });

  describe('discoverTokenPaths', () => {
    it('returns sanitized setting paths plus common folders that have content', async () => {
      const browse = createBrowse({ tokens: { files: ['tokens/a.webp'], dirs: [] } });
      const service = new ScanService({
        browse,
        getSetting: () => 'my/tokens, ../escape ,  other',
        pathFilter: noExclusions,
      });

      const paths = await service.discoverTokenPaths();

      expect(paths).toContain('my/tokens');
      expect(paths).toContain('tokens');
      expect(paths).not.toContain('modules/fa-nexus');
      expect(paths.some((p) => p.includes('..'))).toBe(false);
    });

    it('logs and skips a common folder whose browse throws', async () => {
      const browse = createBrowse({ 'modules/fa-nexus': new Error('denied') });
      const service = new ScanService({ browse, getSetting: () => '', pathFilter: noExclusions });

      expect(await service.discoverTokenPaths()).toEqual([]);
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('buildLocalTokenIndex', () => {
    it('returns an empty index when no paths are found', async () => {
      const service = new ScanService({
        browse: createBrowse({}),
        getSetting: () => '',
        pathFilter: noExclusions,
      });

      expect(await service.buildLocalTokenIndex()).toEqual([]);
    });

    it('scans every path and de-duplicates images across overlapping roots', async () => {
      const browse = createBrowse({
        tokens: { files: ['tokens/a.webp'], dirs: ['tokens/sub'] },
        'tokens/sub': { files: ['tokens/sub/b.webp'], dirs: [] },
      });
      const service = new ScanService({
        browse,
        getSetting: () => 'tokens/sub',
        pathFilter: noExclusions,
      });

      const index = await service.buildLocalTokenIndex();

      expect(index.map((i) => i.path).sort()).toEqual(['tokens/a.webp', 'tokens/sub/b.webp']);
    });
  });

  describe('scanDirectoryForImages', () => {
    it('collects the walk, honouring the depth arguments', async () => {
      const browse = createBrowse({
        a: { files: ['a/0.webp'], dirs: ['a/b'] },
        'a/b': { files: ['a/b/1.webp'], dirs: [] },
      });
      const service = new ScanService({ browse, getSetting: () => '', pathFilter: noExclusions });

      expect(await service.scanDirectoryForImages('a', 0, 0)).toHaveLength(1);
      expect(await service.scanDirectoryForImages('a', 0, 1)).toHaveLength(2);
      expect((await service.scanDirectoryForImages('a', 0, 1, null, 'Beasts'))[0].category).toBe(
        'Beasts'
      );
    });
  });

  describe('getAllTVAImages', () => {
    it('returns nothing without TVA', async () => {
      const service = new ScanService({ getTvaAPI: () => null });

      expect(await service.getAllTVAImages()).toEqual([]);
    });

    it('normalizes string and object results, de-duplicates, and survives a failing term', async () => {
      vi.useFakeTimers();
      const doImageSearch = vi
        .fn()
        .mockResolvedValueOnce(['p/Wolf_Grey.webp', { route: 'p/bear.webp', label: 'Bear' }])
        .mockRejectedValueOnce(new Error('search broke'))
        .mockResolvedValue(['p/Wolf_Grey.webp', { nothing: true }]);
      const service = new ScanService({
        getTvaAPI: () => ({ doImageSearch }),
        pathFilter: noExclusions,
      });

      const pending = service.getAllTVAImages();
      await vi.runAllTimersAsync();
      const images = await pending;
      vi.useRealTimers();

      expect(images).toEqual([
        { path: 'p/Wolf_Grey.webp', name: 'Wolf Grey', source: 'tva' },
        { path: 'p/bear.webp', name: 'Bear', source: 'tva' },
      ]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('TVA search failed'),
        expect.any(Error)
      );
    });
  });

  describe('filterByFolderPath', () => {
    it('keeps images whose folder or name contains the category, minus excluded paths', () => {
      const service = new ScanService({ pathFilter: { isExcluded: (p) => p.includes('props') } });
      const images = [
        { path: 'pack/Undead/Skeleton.webp', name: 'Skeleton' },
        { path: 'pack/Misc/x.webp', name: 'Undead Knight' },
        { path: 'pack/props/undead.webp', name: 'Undead prop' },
        { path: 'pack/Beasts/Wolf.webp', name: 'Wolf' },
      ];

      expect(service.filterByFolderPath(images, 'Undead').map((i) => i.name)).toEqual([
        'Skeleton',
        'Undead Knight',
      ]);
      expect(service.filterByFolderPath(null, 'undead')).toEqual([]);
      expect(service.filterByFolderPath(images, '')).toEqual([]);
    });
  });
});
