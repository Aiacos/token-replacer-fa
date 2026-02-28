# Testing Patterns

**Analysis Date:** 2025-02-28

## Test Framework

**Status:** No automated test framework configured

The codebase uses manual testing via Foundry VTT browser console. No unit test, integration test, or E2E test runners are configured.

**Manual Testing Approach:**

- Foundry VTT loads module in browser environment (Chrome, Firefox, Edge)
- Testing performed via scene control button in Foundry UI
- Browser DevTools console used to observe behavior and check for errors
- Network tab used to simulate slow connections (testing skeleton loaders, caching)

**Test Documentation:**

- `MANUAL_TESTING_GUIDE.md` - Step-by-step manual test procedures for UI features
- `console-test-script.js` - Historical console testing utilities
- `TEST_SUMMARY.md` - Test results and findings documentation
- `TESTING-REQUIRED.md` - Critical test scenarios that must be verified
- Individual test scripts in `.auto-claude/specs/` (feature verification scripts)

**Available Test Utilities in Codebase:**

- `console-test-script.js` (850 lines) - Manual console-based testing helpers
- `test-worker.html` - Web Worker testing utility
- Various spec-based verification scripts: `smoke-test.js`, `test-script.js`, `verification-test.js`

## Test File Organization

**Location:**

- Manual test scripts in root directory: `console-test-script.js`, `MANUAL_TESTING_GUIDE.md`
- Feature-specific test guides in `.auto-claude/specs/{feature}/testing-guide.md`
- Verification scripts in `.auto-claude/specs/{feature}/` directories

**File Naming Pattern:**

- Test documentation: `MANUAL_TESTING_GUIDE.md`, `TEST_SUMMARY.md`, `TESTING-REQUIRED.md`
- Test scripts: `console-test-script.js`, `smoke-test.js`, `verification-test.js`
- Test guides: `testing-guide.md`, `test-match-selection.md`, `test-no-match-browser.md`

**Spec Organization:**

- Specs in `.auto-claude/specs/{sequential-number}-{feature-name}/`
- Each spec contains: `spec.md` (requirements) + testing documentation
- Examples: `001-migrate-to-v2-dialog-api/`, `007-indexeddb-storage-for-large-libraries/`, `008-web-worker-background-processing/`

## Test Structure

**Manual Test Procedures (from MANUAL_TESTING_GUIDE.md):**

```
Test Format:
- Test title and purpose
- Prerequisites (Foundry version, modules, scene setup)
- Step-by-step procedures
- Expected results with checkmarks (✅)
- Checkpoint: Verify no console errors
```

**Test Coverage Areas:**

1. **Match Selection Dialog** - Skeleton loaders, image loading, selection UI
2. **No-Match Browser** - Category search, filtering, selection
3. **Progress Tracking** - Dialog updates during processing
4. **Dialog Rendering** - ApplicationV2 initial render and updates
5. **Error Handling** - Error display, recovery suggestions
6. **Caching** - TVA cache loading, index persistence, localStorage

**Skeleton Loader Test Example:**

```markdown
## Test 1: Match Selection Dialog - Skeleton Loaders

**Purpose:** Verify skeleton loaders appear on both preview and match grid images

**Steps:**

1. Open Foundry VTT with D&D 5e world
2. Open browser DevTools, Network tab with "Slow 3G" throttling
3. Select NPC tokens, click Token Replacer FA button
4. Wait for match selection dialog

**Expected Results:**

- ✅ Token preview image (52×52px) shows shimmer animation
- ✅ Match grid images (72×72px) show shimmer animation
- ✅ Smooth gradient effect visible
- ✅ Subtle pulse effect on skeleton
- ✅ Images fade in smoothly when loaded
- ✅ Skeleton disappears completely when loaded
- ✅ No layout shift or visual jump
- ✅ Dark theme colors match (#1a1a1a, #252525-#333333)

**Checkpoint:**

- Open DevTools Console
- Verify no errors or warnings
```

## Manual Testing Guide (from MANUAL_TESTING_GUIDE.md)

**Prerequisites:**

```
Required:
- Foundry VTT v12 or v13
- D&D 5e system enabled
- Token Variant Art (TVA) module installed and active
- Token Replacer FA module installed and active
- Modern browser (Chrome, Firefox, Edge)
- Browser DevTools available
- Test scene with NPC tokens
```

**Key Test Procedures:**

1. **Match Selection Dialog** - Skeleton Loaders
2. **No-Match Dialog** - Skeleton Loader on preview image
3. **Category Search Results** - Dynamic HTML skeleton loaders
4. **Dialog Interactions** - User selections and cancellations
5. **Error Scenarios** - Missing TVA, empty cache, network failures
6. **Caching Behavior** - TVA cache loading, index persistence, localStorage

**Network Simulation:**

- Enable browser DevTools Network tab
- Set throttling to "Slow 3G" or "Fast 3G"
- Observe skeleton loaders during slow image loading
- Verify no UI freezing during load

## Test Patterns from Code

**Console Testing Pattern:**

```javascript
// From console-test-script.js
// Access module via window global:
window.TokenReplacerFA;

// Trigger main workflow:
window.TokenReplacerFA.processTokenReplacement();

// Check internal state:
window.TokenReplacerFA.getSetting('debugMode');
window.TokenReplacerFA.hasTVA;

// Access services:
import { searchService } from 'modules/token-replacer-fa/scripts/services/SearchService.js';
searchService.parallelSearchCreatures(groups, localIndex, callback);
```

**Verification Script Pattern:**

```javascript
// From spec-based verification tests
// Test Web Worker functionality
const worker = new Worker('modules/token-replacer-fa/scripts/workers/IndexWorker.js');

// Test IndexedDB storage
const stored = await storageService.get('token-replacer-fa-index-v3');

// Test TVA cache loading
const cacheLoaded = await tvaCacheService.loadTVACache();
const stats = tvaCacheService.getTVACacheStats();
```

## Mocking

**No Mocking Framework:**
The codebase does not use Jest, Vitest, or any mocking framework.

**Integration Testing Approach:**
Tests run directly against Foundry VTT API, TVA module API, and actual browser APIs:

- Real DOM manipulation (dialogs, event handlers)
- Real storage access (localStorage, IndexedDB)
- Real Foundry hooks and settings system
- Real image loading with network throttling
- Real worker instantiation and messaging

**Testing Foundry Dependencies:**

- Tests use actual `game` object from Foundry VTT
- Tests use actual `canvas` and scene objects
- Tests use actual `ui.notifications` system
- Tests use actual Foundry settings system via `game.settings.get/register`

**Testing External APIs:**

- Token Variant Art (TVA) module: Access via `game.modules.get('token-variants')`
- FA Nexus module: Access via `game.modules.get('fa-nexus')`
- Forge Bazaar: Direct HTTP requests (no mocking)
- Fuse.js: Imported from CDN via dynamic import

## Fixtures and Factories

**Test Data:**
No fixtures or factories in codebase. Manual setup required:

- Create Foundry world with D&D 5e system
- Create scene with NPC tokens
- Set token creature types manually in token properties

**Sample Test Tokens:**
From test documentation, create tokens with these creature types:

- Humanoid (common, should find matches)
- Beast (common, should find matches)
- Undead (common, should find matches)
- Dragon (less common, fewer matches)
- Obscure type (for no-match testing)

**TVA Cache Setup:**
Tests assume TVA module is installed and has scanned for token artwork:

- TVA static cache file must be populated
- Forgotten Adventures module or Forge Bazaar must be accessible
- FA Nexus module optional but recommended

## Coverage

**Requirements:** No coverage requirements configured

**What IS Tested (Manually):**

1. Dialog rendering (ApplicationV2 with `force: true`)
2. TVA cache loading (direct cache file access)
3. Index building (both Worker and fallback paths)
4. Search orchestration (parallel searches, fuzzy matching)
5. Token image replacement (direct update + TVA API)
6. Error handling (structured errors, recovery suggestions)
7. UI updates (progress dialog, match selection)
8. Event handling (button clicks, selection, cancellation)
9. Settings access (all 8 configurable settings)
10. Localization (i18n caching, placeholder replacement)

**What is NOT Tested Automatically:**

- Unit tests for pure functions (Utils, categorization)
- Integration tests with mocked Foundry API
- E2E tests from scene control button to token update
- Performance benchmarks
- Cross-browser compatibility (manual browser testing only)
- Accessibility (manual testing with screen readers possible)

## Test Types

**Manual Testing (Browser-based):**

- **Smoke Tests** - Basic functionality works (button clickable, dialog appears)
- **UI Tests** - Dialog renders correctly, skeleton loaders visible, transitions smooth
- **Integration Tests** - TVA integration works, image loading completes, tokens update
- **Error Path Tests** - Error messages displayed, recovery suggestions shown
- **Caching Tests** - Cache persists, index loads from storage, i18n cached
- **Performance Tests** - Dialog responsive with slow network, skeleton loaders smooth

**Console Verification Scripts:**

- Worker functionality test: `test-script.js` in `008-web-worker-background-processing`
- Forge Bazaar access: `test-forge-access.js` in `009-direct-forge-bazaar-api-integration`
- TVA disabled fallback: `test-tva-disabled.js` in `009-direct-forge-bazaar-api-integration`
- IndexedDB storage: `smoke-test.js` in `007-indexeddb-storage-for-large-libraries`

## Common Testing Patterns

**Async Testing Pattern:**

```javascript
// Manual async test in console
(async () => {
  const result = await tokenReplacerApp.processTokenReplacement();
  console.log('Process completed');
})();

// Or with explicit await
const searchResults = await searchService.parallelSearchCreatures(groups, localIndex);
```

**Error Path Testing:**

```javascript
// Disable TVA to test fallback
game.modules.get('token-variants').active = false;

// Trigger replacement - should use ScanService instead
await tokenReplacerApp.processTokenReplacement();

// Check for graceful error handling
// Dialog should show error message with recovery suggestions
```

**Debug Logging Testing:**

```javascript
// Enable debug mode
game.settings.set('token-replacer-fa', 'debugMode', true);

// Trigger operation - logs appear in DevTools console
await tokenReplacerApp.processTokenReplacement();

// Disable debug mode
game.settings.set('token-replacer-fa', 'debugMode', false);
```

**Slow Network Testing:**

```javascript
// Open DevTools Network tab
// Set throttling to "Slow 3G"
// Click Token Replacer button
// Observe skeleton loaders animating during image load
// Verify no UI freezing during 10+ second waits
```

**Storage Testing:**

```javascript
// Test localStorage
localStorage.setItem('token-replacer-fa-filter-term', 'test');
const saved = localStorage.getItem('token-replacer-fa-filter-term');

// Test IndexedDB
const stored = await storageService.get('token-replacer-fa-index-v3');
const stats = await storageService.getStats('token-replacer-fa-index-v3');
```

## Testing Foundry VTT Specific Features

**Dialog Rendering:**

```javascript
// Test ApplicationV2 render (requires force: true for initial render)
const dialog = await uiManager.createMainDialog(html, callback);
await dialog.render({ force: true }); // Required for first render!
console.log(dialog.rendered); // Should be true

// Test dialog content update
dialog.updateContent(newHtml); // Uses DOM manipulation, no re-render
```

**Settings Access:**

```javascript
// Verify settings registered
game.settings.get('token-replacer-fa', 'debugMode');

// All 8 configurable settings:
// - fuzzyThreshold (number, default 0.1)
// - searchPriority (string: faNexus|forgeBazaar|both, default 'both')
// - autoReplace (boolean, default false)
// - confirmReplace (boolean, default true)
// - fallbackFullSearch (boolean, default false)
// - useTVACache (boolean, default true)
// - refreshTVACache (boolean, default false)
// - additionalPaths (string, default '')
// - indexUpdateFrequency (string: daily|weekly|monthly|quarterly, default 'weekly')
// - debugMode (boolean, default false)
```

**Localization Testing:**

```javascript
// Check i18n caching
tokenReplacerApp.i18n('notifications.started'); // Cached on second call

// Check cache statistics
tokenReplacerApp.logI18nCacheStats();
// Output: "i18n cache stats: N entries, X hits, Y misses (Z% hit rate)"

// Test placeholder replacement
tokenReplacerApp.i18n('notifications.complete', { count: 5 });
// Replaces {count} with 5
```

## Critical Test Scenarios (from TESTING-REQUIRED.md)

**Must Test Before Release:**

1. **Token Replacement Workflow**
   - Select multiple NPC tokens
   - Click Token Replacer button
   - Observe TVA cache loading
   - Verify matches found and displayed
   - Select images for replacement
   - Confirm tokens updated

2. **Error Handling**
   - TVA module missing/disabled → error displayed with recovery suggestions
   - TVA cache empty → error displayed with "rebuild cache" suggestion
   - Network failure → error displayed with "check network" suggestion
   - Fuse.js load failure → error displayed with "reload module" suggestion

3. **Dialog State Management**
   - Dialog renders on first load with `force: true`
   - Content updates without full dialog re-render
   - Dialog properly closes when user cancels
   - Dialog updates during long-running searches (progress visible)

4. **Caching Behavior**
   - TVA cache loads once on first use, then cached in IndexedDB
   - Cache refresh button (refreshTVACache) clears and rebuilds
   - Filter term persists in localStorage during session
   - i18n strings cached with visible cache hit statistics

5. **Network Resilience**
   - Slow network (3G throttling): skeleton loaders visible, no UI freeze
   - Image loading timeout: graceful degradation, fallback to placeholder
   - Offline mode: error message displayed, recovery suggestion offered

---

_Testing analysis: 2025-02-28_
