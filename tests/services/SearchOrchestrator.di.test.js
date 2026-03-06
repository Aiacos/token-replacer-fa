/**
 * SearchOrchestrator DI smoke tests
 * Validates that SearchOrchestrator can be instantiated with injected dependencies
 * without requiring Foundry VTT globals (game, canvas, etc.)
 */
import { describe, it, expect, vi } from 'vitest';
import { SearchOrchestrator } from '../../scripts/services/SearchOrchestrator.js';

describe('SearchOrchestrator DI', () => {
  it('instantiates with all injected deps without accessing Foundry globals', () => {
    const mockSettings = {};
    const mockGetSetting = vi.fn((mod, key) => mockSettings[`${mod}.${key}`]);
    const mockIndexService = { isBuilt: false, searchByCategory: vi.fn(() => []) };
    const mockTVACache = { hasTVA: false, tvaCacheLoaded: false };
    const mockForgeBazaar = { isServiceAvailable: () => false };
    const mockWorkerFactory = vi.fn();

    const orchestrator = new SearchOrchestrator({
      getSetting: mockGetSetting,
      indexService: mockIndexService,
      tvaCacheService: mockTVACache,
      forgeBazaarService: mockForgeBazaar,
      workerFactory: mockWorkerFactory,
    });

    expect(orchestrator).toBeInstanceOf(SearchOrchestrator);
    expect(orchestrator._getSetting).toBe(mockGetSetting);
    expect(orchestrator._indexService).toBe(mockIndexService);
    expect(orchestrator._tvaCacheService).toBe(mockTVACache);
    expect(orchestrator._forgeBazaarService).toBe(mockForgeBazaar);
    expect(orchestrator._workerFactory).toBe(mockWorkerFactory);
  });

  it('setDependencies() updates _tvaCacheService and _forgeBazaarService', () => {
    const orchestrator = new SearchOrchestrator({
      getSetting: vi.fn(),
      indexService: { isBuilt: false },
      workerFactory: vi.fn(),
    });

    expect(orchestrator._tvaCacheService).toBeNull();
    expect(orchestrator._forgeBazaarService).toBeNull();

    const mockTVA = { hasTVA: true };
    const mockForge = { isServiceAvailable: () => true };
    orchestrator.setDependencies(mockTVA, mockForge);

    expect(orchestrator._tvaCacheService).toBe(mockTVA);
    expect(orchestrator._forgeBazaarService).toBe(mockForge);
  });

  it('default constructor (no args) does not throw at construction time', () => {
    // Default constructor uses lazy globals -- they are NOT accessed until
    // methods are called, so construction itself is safe.
    expect(() => new SearchOrchestrator()).not.toThrow();
  });

  it('clearCache() works on DI-constructed instance', () => {
    const orchestrator = new SearchOrchestrator({
      getSetting: vi.fn(),
      indexService: { isBuilt: false },
      workerFactory: vi.fn(),
    });

    // Add an entry to the cache
    orchestrator.searchCache.set('test-key', [{ path: '/test.png' }]);
    expect(orchestrator.searchCache.size).toBe(1);

    orchestrator.clearCache();
    expect(orchestrator.searchCache.size).toBe(0);
  });
});
