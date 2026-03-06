/**
 * IndexService DI smoke tests
 * Validates that IndexService can be instantiated with injected dependencies
 * without requiring Foundry VTT globals (game, canvas, etc.)
 */
import { describe, it, expect, vi } from 'vitest';
import { IndexService } from '../../scripts/services/IndexService.js';

describe('IndexService DI', () => {
  it('instantiates with injected deps without accessing Foundry globals', () => {
    const mockStorage = {
      load: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      needsMigration: vi.fn(),
      migrateFromLocalStorage: vi.fn(),
    };
    const mockWorkerFactory = vi.fn();
    const mockGetSetting = vi.fn();
    const mockGetTvaAPI = vi.fn();

    const service = new IndexService({
      storageService: mockStorage,
      workerFactory: mockWorkerFactory,
      getSetting: mockGetSetting,
      getTvaAPI: mockGetTvaAPI,
    });

    expect(service).toBeInstanceOf(IndexService);
    expect(service._storageService).toBe(mockStorage);
    expect(service._workerFactory).toBe(mockWorkerFactory);
    expect(service._getSetting).toBe(mockGetSetting);
    expect(service._getTvaAPI).toBe(mockGetTvaAPI);
  });

  it('constructor does NOT call workerFactory (Worker is lazy)', () => {
    const mockWorkerFactory = vi.fn();

    new IndexService({
      storageService: { load: vi.fn(), save: vi.fn(), remove: vi.fn() },
      workerFactory: mockWorkerFactory,
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });

    expect(mockWorkerFactory).not.toHaveBeenCalled();
  });

  it('buildTermCategoryMap() works (pure logic, no globals)', () => {
    const service = new IndexService({
      storageService: { load: vi.fn(), save: vi.fn(), remove: vi.fn() },
      workerFactory: vi.fn(),
      getSetting: vi.fn(),
      getTvaAPI: vi.fn(),
    });

    const map = service.termCategoryMap;
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBeGreaterThan(0);

    // Spot check: "wolf" should map to "beast" category
    const wolfEntry = map.get('wolf');
    expect(wolfEntry).toBeDefined();
    expect(wolfEntry.category).toBe('beast');
  });

  it('default constructor (no args) does not throw at construction time', () => {
    // Default constructor uses lazy globals -- they are NOT accessed until
    // methods are called, so construction itself is safe.
    expect(() => new IndexService()).not.toThrow();
  });
});
