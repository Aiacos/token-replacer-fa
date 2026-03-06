/**
 * SearchService facade - Unit tests
 * Covers init wiring/idempotency, clearCache delegation, searchByCategory
 * and parallelSearchCreatures input validation, delegation, and error wrapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all three singleton sub-services
vi.mock('../../scripts/services/TVACacheService.js', () => ({
  tvaCacheService: { init: vi.fn() },
}));
vi.mock('../../scripts/services/ForgeBazaarService.js', () => ({
  forgeBazaarService: { init: vi.fn(), clearCache: vi.fn(), isServiceAvailable: () => false },
}));
vi.mock('../../scripts/services/SearchOrchestrator.js', () => ({
  searchOrchestrator: {
    setDependencies: vi.fn(),
    clearCache: vi.fn(),
    searchByCategory: vi.fn(async () => []),
    parallelSearchCreatures: vi.fn(async () => new Map()),
  },
}));

// Import class (not singleton) and mocked singletons for assertions
import { SearchService } from '../../scripts/services/SearchService.js';
import { tvaCacheService } from '../../scripts/services/TVACacheService.js';
import { forgeBazaarService } from '../../scripts/services/ForgeBazaarService.js';
import { searchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';

describe('SearchService', () => {
  /** @type {SearchService} */
  let svc;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new SearchService();
  });

  // -----------------------------------------------------------------------
  // init()
  // -----------------------------------------------------------------------
  describe('init()', () => {
    it('wires sub-services on first call', () => {
      svc.init();

      expect(tvaCacheService.init).toHaveBeenCalledOnce();
      expect(forgeBazaarService.init).toHaveBeenCalledOnce();
      expect(searchOrchestrator.setDependencies).toHaveBeenCalledWith(
        tvaCacheService,
        forgeBazaarService
      );
    });

    it('is idempotent — second call does not re-invoke sub-services', () => {
      svc.init();
      svc.init();

      expect(tvaCacheService.init).toHaveBeenCalledTimes(1);
      expect(forgeBazaarService.init).toHaveBeenCalledTimes(1);
      expect(searchOrchestrator.setDependencies).toHaveBeenCalledTimes(1);
    });

    it('wraps init errors in createModuleError with errorType "unknown"', () => {
      tvaCacheService.init.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      expect(() => svc.init()).toThrow();
      try {
        svc.init();
      } catch (err) {
        // Reset for the actual check — need a fresh instance
      }

      const fresh = new SearchService();
      tvaCacheService.init.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      try {
        fresh.init();
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err.errorType).toBe('unknown');
        expect(err.details).toContain('boom');
        expect(err.recoverySuggestions).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // clearCache()
  // -----------------------------------------------------------------------
  describe('clearCache()', () => {
    it('delegates to orchestrator and forgeBazaarService', () => {
      svc.clearCache();

      expect(searchOrchestrator.clearCache).toHaveBeenCalledOnce();
      expect(forgeBazaarService.clearCache).toHaveBeenCalledOnce();
    });

    it('does not throw when sub-service clearCache throws', () => {
      searchOrchestrator.clearCache.mockImplementationOnce(() => {
        throw new Error('cache fail');
      });

      expect(() => svc.clearCache()).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // searchByCategory()
  // -----------------------------------------------------------------------
  describe('searchByCategory()', () => {
    it('delegates to searchOrchestrator.searchByCategory', async () => {
      const expected = [{ path: 'a.webp' }];
      searchOrchestrator.searchByCategory.mockResolvedValueOnce(expected);

      const result = await svc.searchByCategory('beast', [], null);

      expect(searchOrchestrator.searchByCategory).toHaveBeenCalledWith(
        'beast',
        [],
        null,
        null
      );
      expect(result).toBe(expected);
    });

    it('throws createModuleError with search_failed for empty string categoryType', async () => {
      await expect(svc.searchByCategory('', [])).rejects.toMatchObject({
        errorType: 'search_failed',
      });
    });

    it('throws createModuleError when localIndex is not an array', async () => {
      await expect(svc.searchByCategory('beast', 'notArray')).rejects.toMatchObject({
        errorType: 'search_failed',
        details: expect.stringContaining('array'),
      });
    });

    it('wraps unexpected orchestrator errors in createModuleError', async () => {
      searchOrchestrator.searchByCategory.mockRejectedValueOnce(new Error('network'));

      await expect(svc.searchByCategory('beast', [])).rejects.toMatchObject({
        errorType: 'search_failed',
        details: expect.stringContaining('network'),
      });
    });

    it('passes through already-structured errors unchanged', async () => {
      const structured = { errorType: 'custom', message: 'custom msg', details: 'detail', recoverySuggestions: [] };
      searchOrchestrator.searchByCategory.mockRejectedValueOnce(structured);

      await expect(svc.searchByCategory('beast', [])).rejects.toBe(structured);
    });
  });

  // -----------------------------------------------------------------------
  // parallelSearchCreatures()
  // -----------------------------------------------------------------------
  describe('parallelSearchCreatures()', () => {
    it('delegates to searchOrchestrator.parallelSearchCreatures', async () => {
      const groups = new Map([['beast', { type: 'beast' }]]);
      const expected = new Map([['beast', []]]);
      searchOrchestrator.parallelSearchCreatures.mockResolvedValueOnce(expected);

      const result = await svc.parallelSearchCreatures(groups, []);

      expect(searchOrchestrator.parallelSearchCreatures).toHaveBeenCalledWith(
        groups,
        [],
        null
      );
      expect(result).toBe(expected);
    });

    it('throws createModuleError when groups is not a Map', async () => {
      await expect(svc.parallelSearchCreatures({}, [])).rejects.toMatchObject({
        errorType: 'search_failed',
        details: expect.stringContaining('Map'),
      });
    });

    it('returns empty Map without calling orchestrator for empty Map', async () => {
      const result = await svc.parallelSearchCreatures(new Map(), []);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(searchOrchestrator.parallelSearchCreatures).not.toHaveBeenCalled();
    });

    it('wraps unexpected orchestrator errors in createModuleError', async () => {
      const groups = new Map([['beast', { type: 'beast' }]]);
      searchOrchestrator.parallelSearchCreatures.mockRejectedValueOnce(new Error('timeout'));

      await expect(svc.parallelSearchCreatures(groups, [])).rejects.toMatchObject({
        errorType: 'search_failed',
        details: expect.stringContaining('timeout'),
      });
    });
  });
});
