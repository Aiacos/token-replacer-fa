# Phase 5: Storage Tests - Research

**Researched:** 2026-03-06
**Domain:** IndexedDB testing with fake-indexeddb in Vitest/jsdom
**Confidence:** HIGH

## Summary

StorageService wraps IndexedDB with a localStorage fallback. The jsdom environment used by Vitest does NOT provide IndexedDB (confirmed: `window.indexedDB` is `undefined` in jsdom 28.1.0). The `fake-indexeddb` package (v6.2.5) provides a complete in-memory IndexedDB implementation and must be installed as a dev dependency.

The service has 11 public methods across three categories: CRUD (has, save, load, remove, clear), connection management (openDatabase, testConnection, close), and migration (needsMigration, migrateFromLocalStorage). All methods follow a consistent pattern: try IndexedDB first, fall through to localStorage on failure. This dual-path architecture requires two separate test groups per operation.

**Primary recommendation:** Install `fake-indexeddb@6.2.5`, add `"fake-indexeddb/auto"` to Vitest setupFiles, and organize tests with separate describe blocks for IndexedDB path, localStorage fallback path, and migration operations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Test ALL 11 methods on StorageService, not just the 5 in TEST-06
- Core behavior tested with fresh `new StorageService()` instances for isolation
- Separate small describe block verifying the exported `storageService` singleton works correctly
- Migration methods tested with full round-trip: seed localStorage, call migrateFromLocalStorage, verify data in IndexedDB, verify localStorage key removed
- Timestamp metadata verified: assert `timestamp` is a number and roughly current (within a few seconds)
- Dedicated `describe('localStorage fallback')` block where `isIndexedDBSupported` is set to false
- All 5 CRUD operations tested through localStorage-only path, separate from IndexedDB tests
- localStorage `save()` size limit (~4.5MB) rejection path tested -- verify save() returns false for oversized data
- `clear()` selective cleanup verified: seed localStorage with module keys + unrelated keys, call clear(), verify only `token-replacer-fa`-prefixed keys removed
- Research-first approach: let the research phase determine whether jsdom's IndexedDB is complete enough
- If jsdom has gaps, install `fake-indexeddb` as a dev dependency (approved by user)
- No manual IndexedDB mocking -- use either jsdom's built-in or fake-indexeddb
- Core errors only: transaction abort (TEST-06 requirement), open failure, save/load/remove errors
- Skip connection lifecycle events (onblocked, onversionchange, onclose) -- deferred to Phase 10
- Silent fallthrough tested: simulate IndexedDB failure, verify operations still succeed via localStorage
- Dedicated `has()` tests: verify true for existing keys, false for missing keys, works via localStorage fallback

### Claude's Discretion
- Exact test count per method (aim for meaningful coverage)
- How to simulate IndexedDB failures (spy on openDatabase vs manipulate isIndexedDBSupported)
- Whether to use beforeEach/afterEach for database cleanup or fresh instances per test
- Test data shapes (simple strings vs complex nested objects for save/load round-trips)

### Deferred Ideas (OUT OF SCOPE)
- Connection lifecycle event testing (onblocked, onversionchange, onclose) -- Phase 10
- Error handling standardization (createModuleError pattern) -- Phase 10
- IndexService integration with StorageService -- Phase 7
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-06 | StorageService IndexedDB operations tested (save, load, delete, version check, transaction abort) | fake-indexeddb provides full IndexedDB API; save/load/remove round-trip patterns documented; transaction abort testable via direct object store manipulation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fake-indexeddb | 6.2.5 | In-memory IndexedDB implementation for Node.js | Only viable option -- jsdom lacks IndexedDB entirely; 82.8% Web Platform Tests pass rate |
| vitest | 3.2.4 | Test runner (already installed) | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fake-indexeddb/auto | 6.2.5 | Auto-registers all IndexedDB globals | Setup file import -- provides window.indexedDB, IDBKeyRange, etc. globally |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fake-indexeddb | Manual IDB mocks | User explicitly rejected manual mocking; fake-indexeddb is approved |

**Installation:**
```bash
npm install --save-dev fake-indexeddb@6.2.5
```

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── setup/
│   └── foundry-mocks.js        # Existing (add fake-indexeddb/auto import)
├── helpers/
│   └── mock-helpers.js          # Existing
├── core/                        # Phase 4 tests
│   ├── Constants.test.js
│   └── Utils.test.js
└── services/                    # NEW - Phase 5
    └── StorageService.test.js   # All StorageService tests
```

### Pattern 1: fake-indexeddb/auto Setup
**What:** Import `fake-indexeddb/auto` in the Vitest setup file to make IndexedDB globally available
**When to use:** Always -- must be loaded before any StorageService import

Add to `vitest.config.js` setupFiles:
```javascript
// vitest.config.js
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    setupFiles: ['fake-indexeddb/auto', 'tests/setup/foundry-mocks.js'],
  },
});
```

**Why this order matters:** `fake-indexeddb/auto` must load BEFORE `foundry-mocks.js` because StorageService's constructor calls `checkIndexedDBSupport()` which checks `window.indexedDB`. If IndexedDB globals aren't registered yet, `isIndexedDBSupported` will be `false`.

### Pattern 2: Fresh Instance Per Test Group
**What:** Create a new `StorageService()` per describe block or per test for isolation
**When to use:** All IndexedDB tests, to avoid connection state leaking between tests

```javascript
describe('save()', () => {
  let service;

  beforeEach(() => {
    service = new StorageService();
  });

  afterEach(() => {
    service.close();
  });

  it('saves and returns true', async () => {
    const result = await service.save('test-key', { foo: 'bar' });
    expect(result).toBe(true);
  });
});
```

### Pattern 3: Database Cleanup Between Tests
**What:** Delete the IndexedDB database between tests to prevent state leakage
**When to use:** Between test groups that modify database state

```javascript
import { IDBFactory } from 'fake-indexeddb';

afterEach(() => {
  service.close();
  // Reset the IndexedDB factory to clear all databases
  // Option A: Use deleteDatabase
  const req = indexedDB.deleteDatabase('token-replacer-fa');
  // Option B: Replace the global with a fresh factory
  // globalThis.indexedDB = new IDBFactory();
});
```

**Recommendation:** Use `indexedDB.deleteDatabase('token-replacer-fa')` in afterEach. This is cleaner than replacing the factory and matches real browser behavior.

### Pattern 4: localStorage Fallback Testing
**What:** Set `isIndexedDBSupported = false` to force localStorage path
**When to use:** Dedicated fallback test block

```javascript
describe('localStorage fallback', () => {
  let service;

  beforeEach(() => {
    service = new StorageService();
    service.isIndexedDBSupported = false;  // Force localStorage path
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('save() stores to localStorage', async () => {
    const result = await service.save('test-key', { data: 'value' });
    expect(result).toBe(true);
    expect(localStorage.getItem('test-key')).not.toBeNull();
  });
});
```

### Pattern 5: Error Simulation for IndexedDB Failures
**What:** Spy on openDatabase to simulate connection failures, testing fallthrough to localStorage
**When to use:** Error scenario tests

```javascript
describe('error scenarios', () => {
  it('falls through to localStorage on IndexedDB failure', async () => {
    const service = new StorageService();
    vi.spyOn(service, 'openDatabase').mockRejectedValue(new Error('DB open failed'));

    localStorage.clear();
    const result = await service.save('test-key', { data: 'value' });
    expect(result).toBe(true);  // localStorage fallback succeeds
    expect(localStorage.getItem('test-key')).not.toBeNull();

    service.close();
  });
});
```

### Anti-Patterns to Avoid
- **Creating manual IndexedDB mocks:** User explicitly rejected this. Use fake-indexeddb.
- **Sharing StorageService instances across describe blocks:** Connection state leaks cause flaky tests. Use fresh instances.
- **Not closing connections in afterEach:** Leaked connections cause "blocked" events and test interference.
- **Testing onblocked/onversionchange/onclose events:** Deferred to Phase 10.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IndexedDB implementation | Custom IDB mocks with vi.fn() | fake-indexeddb/auto | User decision; 82.8% spec compliance; handles transactions, cursors, key ranges correctly |
| Database cleanup | Manual store clearing logic | `indexedDB.deleteDatabase()` | Standard API, guaranteed clean state |
| localStorage mock | Custom localStorage polyfill | jsdom built-in | Already available in Vitest jsdom environment |

## Common Pitfalls

### Pitfall 1: Setup File Order
**What goes wrong:** If `fake-indexeddb/auto` loads AFTER `foundry-mocks.js`, the beforeEach in foundry-mocks runs before IndexedDB globals exist. More critically, any module-level `new StorageService()` sees `indexedDB` as undefined.
**Why it happens:** Vitest processes setupFiles in array order.
**How to avoid:** Place `'fake-indexeddb/auto'` as the FIRST entry in setupFiles array.
**Warning signs:** `isIndexedDBSupported` is always `false`; all tests route through localStorage.

### Pitfall 2: Singleton Import Timing
**What goes wrong:** The `storageService` singleton is created at module import time. If IndexedDB isn't available when the module first loads, the singleton's `isIndexedDBSupported` is permanently `false`.
**Why it happens:** `export const storageService = new StorageService()` runs during import.
**How to avoid:** Ensure `fake-indexeddb/auto` is in setupFiles (loaded before test imports). For singleton tests, import the singleton directly; for isolation tests, create new instances.
**Warning signs:** Singleton tests always fall through to localStorage even though IndexedDB is available.

### Pitfall 3: IDBKeyRange Global
**What goes wrong:** `StorageService.has()` uses `IDBKeyRange.only(key)` as a global. If `IDBKeyRange` isn't registered, `has()` throws a ReferenceError.
**Why it happens:** jsdom doesn't provide IDBKeyRange. fake-indexeddb/auto registers it globally.
**How to avoid:** Confirm `IDBKeyRange` exists in global scope after setup (quick sanity test).
**Warning signs:** `has()` tests fail with "IDBKeyRange is not defined".

### Pitfall 4: Async Transaction Completion
**What goes wrong:** Tests assert immediately after calling save/load without awaiting, getting stale results.
**Why it happens:** IndexedDB operations are asynchronous even with fake-indexeddb.
**How to avoid:** Always `await` the StorageService method calls. They return promises.
**Warning signs:** Intermittent test failures, especially on load-after-save patterns.

### Pitfall 5: localStorage State Leakage
**What goes wrong:** localStorage data from one test affects another.
**Why it happens:** jsdom's localStorage persists across tests within the same file.
**How to avoid:** Call `localStorage.clear()` in beforeEach/afterEach for localStorage fallback tests.
**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 6: Database Name Collision
**What goes wrong:** Multiple test describe blocks use the same database name (`token-replacer-fa`) and interfere.
**Why it happens:** fake-indexeddb maintains a shared in-memory database registry.
**How to avoid:** Either use fresh instances + deleteDatabase in afterEach, or accept that the database persists (which is fine for round-trip tests where you control state).
**Warning signs:** Unexpected data found in load() before any save() in that test.

## Code Examples

### Example 1: Save/Load Round-Trip
```javascript
it('save() then load() returns original data', async () => {
  const service = new StorageService();
  const testData = { categories: { humanoid: ['path1', 'path2'] }, version: 3 };

  await service.save('test-index', testData);
  const loaded = await service.load('test-index');

  expect(loaded).toEqual(testData);
  service.close();
});
```

### Example 2: Timestamp Verification
```javascript
it('save() stores timestamp metadata', async () => {
  const service = new StorageService();
  const before = Date.now();
  await service.save('ts-test', { value: 1 });
  const after = Date.now();

  // Access the raw record from IndexedDB to check timestamp
  const db = await service.openDatabase();
  const tx = db.transaction(['index'], 'readonly');
  const store = tx.objectStore('index');
  const record = await new Promise((resolve) => {
    const req = store.get('ts-test');
    req.onsuccess = () => resolve(req.result);
  });

  expect(record.timestamp).toBeGreaterThanOrEqual(before);
  expect(record.timestamp).toBeLessThanOrEqual(after);
  service.close();
});
```

### Example 3: localStorage Size Limit Rejection
```javascript
it('save() rejects data exceeding 4.5MB in localStorage', async () => {
  const service = new StorageService();
  service.isIndexedDBSupported = false;

  // Create data that serializes to > 4.5MB
  const largeData = 'x'.repeat(5 * 1024 * 1024);
  const result = await service.save('large-key', largeData);

  expect(result).toBe(false);
});
```

### Example 4: clear() Selective Cleanup
```javascript
it('clear() only removes token-replacer-fa prefixed keys', async () => {
  const service = new StorageService();
  service.isIndexedDBSupported = false;

  localStorage.setItem('token-replacer-fa-index', '{"data":"cached"}');
  localStorage.setItem('token-replacer-fa-config', '{"data":"config"}');
  localStorage.setItem('other-module-data', 'keep-this');

  await service.clear();

  expect(localStorage.getItem('token-replacer-fa-index')).toBeNull();
  expect(localStorage.getItem('token-replacer-fa-config')).toBeNull();
  expect(localStorage.getItem('other-module-data')).toBe('keep-this');
});
```

### Example 5: Migration Round-Trip
```javascript
it('migrateFromLocalStorage() moves data to IndexedDB and removes old key', async () => {
  const service = new StorageService();
  const migrationData = { categories: { beast: ['wolf.png'] } };

  // Seed localStorage with old format
  localStorage.setItem('old-cache-key', JSON.stringify({
    data: migrationData,
    timestamp: Date.now()
  }));

  const result = await service.migrateFromLocalStorage('old-cache-key', 'new-cache-key');
  expect(result).toBe(true);

  // Verify data is now in IndexedDB
  const loaded = await service.load('new-cache-key');
  expect(loaded).toEqual(migrationData);

  // Verify old key removed
  expect(localStorage.getItem('old-cache-key')).toBeNull();

  service.close();
});
```

### Example 6: Transaction Abort Error
```javascript
it('rejects on transaction abort', async () => {
  const service = new StorageService();

  // Open database first
  const db = await service.openDatabase();

  // Spy on transaction to force abort
  const originalTransaction = db.transaction.bind(db);
  vi.spyOn(db, 'transaction').mockImplementation((...args) => {
    const tx = originalTransaction(...args);
    // Force abort after a tick
    setTimeout(() => tx.abort(), 0);
    return tx;
  });

  // save() should catch the abort and fall through to localStorage
  const result = await service.save('abort-test', { value: 1 });
  // Falls through to localStorage, so still returns true
  expect(result).toBe(true);

  service.close();
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual IDB mocks | fake-indexeddb/auto | fake-indexeddb v5+ (2023) | No need for custom mock objects; full spec-compliant behavior |
| structuredClone polyfill needed | Node.js 17+ has native structuredClone | Node 17 (2021) | No extra polyfill needed; project uses Node 25.8.0 |
| jest + fake-indexeddb setup | vitest + fake-indexeddb/auto in setupFiles | vitest mainstream (2023+) | Simpler config; same auto import pattern works |

## Open Questions

1. **Transaction abort simulation reliability**
   - What we know: fake-indexeddb supports `transaction.abort()` and fires `onabort` handlers
   - What's unclear: Whether spying on `db.transaction` to force abort is reliable across all operations, or if we need to abort after specific operations
   - Recommendation: Start with the spy approach shown in Example 6; if flaky, try directly calling `transaction.abort()` on the returned transaction object

2. **Database cleanup strategy**
   - What we know: `indexedDB.deleteDatabase()` works; fresh `IDBFactory()` instances also work
   - What's unclear: Performance impact of deleteDatabase in afterEach vs using fresh factory
   - Recommendation: Use `indexedDB.deleteDatabase('token-replacer-fa')` + `service.close()` in afterEach. Simple, standard, reliable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `vitest.config.js` |
| Quick run command | `npx vitest run tests/services/StorageService.test.js` |
| Full suite command | `npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-06 | StorageService save/load round-trip | unit | `npx vitest run tests/services/StorageService.test.js -t "save"` | No - Wave 0 |
| TEST-06 | StorageService version check (stale cache rejected) | unit | `npx vitest run tests/services/StorageService.test.js -t "load"` | No - Wave 0 |
| TEST-06 | StorageService transaction abort | unit | `npx vitest run tests/services/StorageService.test.js -t "abort"` | No - Wave 0 |
| TEST-06 | StorageService delete operations | unit | `npx vitest run tests/services/StorageService.test.js -t "remove"` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/services/StorageService.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/services/StorageService.test.js` -- covers TEST-06 (all CRUD, connection, migration, fallback, errors)
- [ ] Install `fake-indexeddb@6.2.5` as devDependency
- [ ] Update `vitest.config.js` setupFiles to include `fake-indexeddb/auto` as first entry
- [ ] Create `tests/services/` directory

## Sources

### Primary (HIGH confidence)
- StorageService.js source code -- all 11 methods analyzed directly
- Node.js runtime check -- confirmed `structuredClone` available (Node 25.8.0)
- jsdom 28.1.0 runtime check -- confirmed `indexedDB` is `undefined`
- fake-indexeddb npm registry -- confirmed v6.2.5 latest, ESM exports available

### Secondary (MEDIUM confidence)
- [fake-indexeddb GitHub README](https://github.com/dumbmatter/fakeIndexedDB) -- setup patterns, auto import, jsdom compatibility notes
- [fake-indexeddb npm page](https://www.npmjs.com/package/fake-indexeddb) -- version and release info

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- jsdom confirmed lacking IndexedDB; fake-indexeddb is the established solution; version verified
- Architecture: HIGH -- StorageService source code fully analyzed; all 11 methods understood; dual-path pattern clear
- Pitfalls: HIGH -- setup file ordering, singleton timing, IDBKeyRange global all verified through code analysis

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, fake-indexeddb rarely has breaking changes)
