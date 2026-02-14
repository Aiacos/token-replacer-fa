# DialogV2 Migration Implementation Plan

**Plan Date:** 2026-02-14
**Module:** Token Replacer FA
**Target Foundry VTT Versions:** v12-v13
**Migration Deadline:** Foundry v16
**Module Version:** 2.9.0 (current) → 3.0.0 (post-migration)

---

## Executive Summary

This document provides a complete, step-by-step implementation plan for migrating Token Replacer FA from the deprecated Dialog V1 API to DialogV2. The migration is designed to be completed in a single focused development session with zero breaking changes to the module's public API.

**Key Metrics:**
- **Estimated Implementation Time:** 8-12 hours (6-8 hours coding + 2-4 hours testing)
- **Files Modified:** 1 file (`scripts/ui/UIManager.js`)
- **Lines Changed:** ~120-150 lines
- **Breaking Changes:** ZERO (100% backward compatible)
- **Risk Level:** MEDIUM (manageable with proper testing)

**Migration Strategy:**
- ✅ Custom `UpdatableDialogV2` subclass to handle content updates
- ✅ Preserve UIManager public API (no changes to consumer code)
- ✅ Lifecycle-based cleanup using `_onAfterClose()` override
- ✅ Explicit v12/v13 compatibility settings

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Implementation Phases](#2-implementation-phases)
3. [Phase 1: Preparation](#3-phase-1-preparation)
4. [Phase 2: Custom Subclass Implementation](#4-phase-2-custom-subclass-implementation)
5. [Phase 3: UIManager Refactoring](#5-phase-3-uimanager-refactoring)
6. [Phase 4: Testing and Validation](#6-phase-4-testing-and-validation)
7. [Phase 5: Documentation and Release](#7-phase-5-documentation-and-release)
8. [Rollback Plan](#8-rollback-plan)
9. [Timeline and Milestones](#9-timeline-and-milestones)
10. [Risk Management](#10-risk-management)
11. [Success Criteria](#11-success-criteria)

---

## 1. Prerequisites

### 1.1 Development Environment Setup

**Required:**
- ✅ Foundry VTT v12 test instance (local or cloud)
- ✅ Foundry VTT v13 test instance (local or cloud)
- ✅ Git repository with clean working directory
- ✅ Text editor/IDE with JavaScript support
- ✅ Browser with developer console (Chrome/Firefox recommended)

**Recommended:**
- ⚠️ Backup of current working v2.9.0 code
- ⚠️ Test world with sample tokens for workflow testing
- ⚠️ Token Variant Art (TVA) module installed and configured
- ⚠️ Forgotten Adventures token packs available

### 1.2 Knowledge Requirements

**Developer should be familiar with:**
- Foundry VTT module development
- JavaScript ES6+ (classes, async/await, arrow functions)
- DOM manipulation (querySelector, innerHTML)
- Promise-based async patterns
- Git version control

**Reference documents to review:**
- `dialogv2-research.md` - V2 API patterns
- `v1-usage-analysis.md` - Current implementation
- `migration-challenges.md` - Known issues and solutions
- `v2-architecture.md` - Design specifications

### 1.3 Pre-Implementation Checklist

- [ ] All research documents reviewed and understood
- [ ] v12 and v13 test environments available
- [ ] Git branch created for migration work (`feature/dialogv2-migration`)
- [ ] Current code backed up (git tag `v2.9.0-pre-migration`)
- [ ] Test world prepared with sample tokens
- [ ] TVA module configured with token paths
- [ ] Browser console cleared and ready for testing

---

## 2. Implementation Phases

### Phase Overview

| Phase | Duration | Type | Blocking |
|-------|----------|------|----------|
| **Phase 1: Preparation** | 30 min | Setup | ✅ |
| **Phase 2: Custom Subclass** | 2-3 hours | Implementation | ✅ |
| **Phase 3: UIManager Refactoring** | 2-3 hours | Implementation | ✅ |
| **Phase 4: Testing** | 2-4 hours | Validation | ✅ |
| **Phase 5: Documentation** | 1-2 hours | Finalization | ⚠️ |

**Total Time:** 8-12 hours (single focused session recommended)

**Parallelization:** Not recommended - phases must be completed sequentially

---

## 3. Phase 1: Preparation

### 3.1 Git Branch Setup

**Commands:**
```bash
# Ensure clean working directory
git status

# Create backup tag
git tag v2.9.0-pre-migration
git push origin v2.9.0-pre-migration

# Create feature branch
git checkout -b feature/dialogv2-migration
```

**Verification:**
```bash
git branch --show-current
# Expected output: feature/dialogv2-migration
```

### 3.2 Code Inspection

**Read and understand:**
1. Open `scripts/ui/UIManager.js`
2. Locate key methods:
   - Line 837-853: `createMainDialog()`
   - Line 859-874: `updateDialogContent()`
   - Line 880-882: `getDialogElement()`
   - Line 895-904: `closeDialog()`
3. Review event handler methods:
   - Line 483-599: `setupMatchSelectionHandlers()`
   - Line 610-829: `setupNoMatchHandlers()`

**Mental model:**
- UIManager manages a single persistent dialog
- Dialog content is updated 10-20 times per workflow
- Event handlers are attached after each content update
- Dialog lifecycle: create → render → update (multiple) → close

### 3.3 Test Environment Verification

**v12 Test:**
```javascript
// In Foundry v12 browser console
console.log(game.release);
// Expected: { generation: 12, ... }

console.log(foundry.applications.api.DialogV2);
// Expected: [class DialogV2]
```

**v13 Test:**
```javascript
// In Foundry v13 browser console
console.log(game.release);
// Expected: { generation: 13, ... }

console.log(foundry.applications.api.DialogV2);
// Expected: [class DialogV2]
```

**Checkpoint:**
- [ ] Git branch created successfully
- [ ] Backup tag exists
- [ ] UIManager.js code reviewed and understood
- [ ] v12 and v13 environments verified
- [ ] DialogV2 available in both versions

**Estimated Time:** 30 minutes

---

## 4. Phase 2: Custom Subclass Implementation

### 4.1 Create UpdatableDialogV2 Class

**Location:** `scripts/ui/UIManager.js` (insert BEFORE UIManager class definition)

**Implementation Steps:**

#### Step 2.1.1: Add Class Header

Insert at **line 1** (before any other code):

```javascript
/**
 * Custom DialogV2 subclass with content update support
 *
 * DialogV2 does not natively support re-rendering or content updates after
 * initial render. This subclass adds an updateContent() method that safely
 * updates dialog content via manual DOM manipulation.
 *
 * @extends foundry.applications.api.DialogV2
 */
class UpdatableDialogV2 extends foundry.applications.api.DialogV2 {
```

#### Step 2.1.2: Implement Constructor

```javascript
  /**
   * Create an updatable dialog
   *
   * @param {Object} config - DialogV2 configuration
   * @param {UIManager} manager - Reference to UIManager instance
   * @param {Function} [onCloseCallback] - Callback to run on dialog close
   */
  constructor(config, manager, onCloseCallback) {
    super(config);

    /**
     * Reference to UIManager for cleanup
     * @type {UIManager}
     * @private
     */
    this._manager = manager;

    /**
     * Callback to execute on dialog close
     * @type {Function|null}
     * @private
     */
    this._onCloseCallback = onCloseCallback || null;

    /**
     * Track if content is currently being updated
     * @type {boolean}
     * @private
     */
    this._isUpdating = false;
  }
```

#### Step 2.1.3: Implement updateContent() Method

```javascript
  /**
   * Update dialog content dynamically
   *
   * DialogV2 does not support re-rendering, so this method manually updates
   * the DOM while preserving dialog position and state. This is a workaround
   * for the framework limitation.
   *
   * @param {string} newContent - New HTML content string
   * @returns {boolean} True if update succeeded, false otherwise
   */
  updateContent(newContent) {
    if (!this.element || !this.rendered) {
      console.warn('TOKEN_REPLACER_FA | Cannot update content: dialog not rendered');
      return false;
    }

    try {
      this._isUpdating = true;

      // Update stored options (for consistency)
      this.options.content = newContent;

      // Perform safe DOM update
      const success = this._safeUpdateContent(newContent);

      return success;
    } catch (error) {
      console.error('TOKEN_REPLACER_FA | Error updating dialog content:', error);
      return false;
    } finally {
      this._isUpdating = false;
    }
  }
```

#### Step 2.1.4: Implement _safeUpdateContent() Helper

```javascript
  /**
   * Safely update dialog content DOM
   *
   * @param {string} newContent - New HTML content
   * @returns {boolean} Success status
   * @private
   */
  _safeUpdateContent(newContent) {
    // Find content container
    const contentEl = this.element.querySelector('.dialog-content');

    if (!contentEl) {
      console.warn('TOKEN_REPLACER_FA | Dialog content container not found');
      return false;
    }

    // Update innerHTML
    contentEl.innerHTML = newContent;

    return true;
  }
```

#### Step 2.1.5: Implement _onAfterClose() Lifecycle Hook

```javascript
  /**
   * Lifecycle hook: After dialog closes
   *
   * Executes cleanup callback and nullifies UIManager reference
   *
   * @param {Object} options - Close options
   * @override
   * @protected
   */
  async _onAfterClose(options) {
    await super._onAfterClose(options);

    // Execute custom close callback
    if (this._onCloseCallback) {
      try {
        this._onCloseCallback();
      } catch (error) {
        console.error('TOKEN_REPLACER_FA | Error in close callback:', error);
      }
    }

    // Cleanup UIManager reference
    if (this._manager) {
      this._manager.mainDialog = null;
    }
  }
}
```

#### Step 2.1.6: Close Class Definition

```javascript
// End of UpdatableDialogV2 class
```

### 4.2 Code Review Checklist

After implementation:
- [ ] Class extends `foundry.applications.api.DialogV2`
- [ ] Constructor calls `super(config)` first
- [ ] Three private properties defined: `_manager`, `_onCloseCallback`, `_isUpdating`
- [ ] `updateContent()` has error handling and logging
- [ ] `_safeUpdateContent()` queries `.dialog-content` selector
- [ ] `_onAfterClose()` calls `super._onAfterClose(options)`
- [ ] All methods have JSDoc comments

### 4.3 Testing Custom Subclass

**Browser console test:**
```javascript
// In Foundry v12 or v13 console
const testDialog = new UpdatableDialogV2({
  window: { title: "Test Dialog" },
  content: "<p>Initial content</p>",
  buttons: []
}, null, () => console.log("Closed"));

await testDialog.render(true);
// Expected: Dialog appears

testDialog.updateContent("<p>Updated content</p>");
// Expected: Content changes without closing dialog

await testDialog.close();
// Expected: "Closed" logged to console
```

**Checkpoint:**
- [ ] UpdatableDialogV2 class implemented (all methods)
- [ ] Code compiles without syntax errors
- [ ] JSDoc comments complete
- [ ] Browser console test passes
- [ ] Dialog updates content successfully

**Estimated Time:** 2-3 hours

---

## 5. Phase 3: UIManager Refactoring

### 5.1 Refactor createMainDialog()

**Location:** `scripts/ui/UIManager.js:837-853`

**Current Code:**
```javascript
createMainDialog(initialContent, onClose) {
  this.mainDialog = new Dialog({
    title: i18n('dialog.title'),
    content: initialContent,
    buttons: {},
    close: () => {
      onClose?.();
      this.mainDialog = null;
    }
  }, {
    classes: ['token-replacer-fa-dialog'],
    width: 500,
    height: 'auto',
    resizable: true
  });
  return this.mainDialog;
}
```

**New Code:**
```javascript
/**
 * Create main dialog window
 *
 * @param {string} initialContent - Initial HTML content
 * @param {Function} [onClose] - Callback to run when dialog closes
 * @returns {UpdatableDialogV2} Dialog instance
 */
createMainDialog(initialContent, onClose) {
  this.mainDialog = new UpdatableDialogV2({
    window: {
      title: i18n('dialog.title')
    },
    content: initialContent,
    buttons: [],  // Empty array (no Foundry-managed buttons)
    classes: ['token-replacer-fa-dialog'],
    position: {
      width: 500,
      height: 'auto'
    },
    rejectClose: false,  // V13 behavior: return null on dismissal
    modal: false
  }, this, onClose);  // Pass manager reference and close callback

  return this.mainDialog;
}
```

**Changes:**
- ✅ `new Dialog()` → `new UpdatableDialogV2()`
- ✅ `title: string` → `window: { title: string }`
- ✅ `buttons: {}` → `buttons: []`
- ✅ `width: 500` → `position: { width: 500 }`
- ✅ Added `rejectClose: false` for v12/v13 compatibility
- ✅ Added `modal: false` to preserve current behavior
- ✅ Removed `close` callback (now handled in subclass)
- ✅ Pass `this` (UIManager reference) to constructor
- ✅ Pass `onClose` callback to constructor
- ⚠️ Removed `resizable: true` (investigate if needed - see Open Questions)

### 5.2 Refactor updateDialogContent()

**Location:** `scripts/ui/UIManager.js:859-874`

**Current Code:**
```javascript
updateDialogContent(content) {
  if (!this.mainDialog) return;

  try {
    this.mainDialog.data.content = content;
    const dialogElement = this.mainDialog.element?.[0];
    if (dialogElement) {
      const contentEl = dialogElement.querySelector('.dialog-content');
      if (contentEl) {
        contentEl.innerHTML = content;
      }
    }
  } catch (e) {
    // Dialog might be in transition
  }
}
```

**New Code:**
```javascript
/**
 * Update dialog content dynamically
 *
 * @param {string} content - New HTML content string
 */
updateDialogContent(content) {
  if (!this.mainDialog) return;

  try {
    // Use custom subclass method
    this.mainDialog.updateContent(content);
  } catch (e) {
    // Dialog might be in transition, silently fail
  }
}
```

**Changes:**
- ✅ Simplified to delegate to `UpdatableDialogV2.updateContent()`
- ✅ Removed V1-specific `data.content` mutation
- ✅ Removed jQuery-style element access `element?.[0]`
- ✅ Preserved error-tolerant behavior (silent catch)

### 5.3 Refactor getDialogElement()

**Location:** `scripts/ui/UIManager.js:880-882`

**Current Code:**
```javascript
getDialogElement() {
  return this.mainDialog?.element?.[0] || null;
}
```

**New Code:**
```javascript
/**
 * Get dialog DOM element
 *
 * @returns {HTMLElement|null} Dialog element or null if not rendered
 */
getDialogElement() {
  return this.mainDialog?.element || null;
}
```

**Changes:**
- ✅ Removed jQuery array access: `element?.[0]` → `element`
- ✅ V2 returns direct HTMLElement reference

### 5.4 Update closeDialog()

**Location:** `scripts/ui/UIManager.js:895-904`

**Current Code:**
```javascript
closeDialog() {
  if (this.mainDialog) {
    try {
      this.mainDialog.close();
    } catch (e) {
      // Dialog might already be closed
    }
    this.mainDialog = null;
  }
}
```

**New Code:**
```javascript
/**
 * Close the main dialog
 *
 * @async
 */
async closeDialog() {
  if (this.mainDialog) {
    try {
      await this.mainDialog.close();
      // Note: mainDialog will be set to null in _onAfterClose() lifecycle hook
    } catch (e) {
      // Dialog might already be closed
      this.mainDialog = null;
    }
  }
}
```

**Changes:**
- ✅ Made async (DialogV2's `close()` is async)
- ✅ Added `await` to `close()` call
- ⚠️ Cleanup now happens in `_onAfterClose()` (except on error)
- ✅ Manual cleanup only on error path

### 5.5 Verify No Changes Needed

**Methods requiring NO changes:**

1. **isDialogOpen()** (line 888-890)
   ```javascript
   isDialogOpen() {
     return !!this.mainDialog;
   }
   ```
   ✅ Already using instance existence check

2. **setupMatchSelectionHandlers()** (line 483-599)
   - ✅ Pure DOM operations, no V1 API dependencies
   - ✅ Receives `dialogElement` parameter (from `getDialogElement()`)
   - ✅ No changes needed

3. **setupNoMatchHandlers()** (line 610-829)
   - ✅ Pure DOM operations, no V1 API dependencies
   - ✅ No changes needed

4. **All HTML generation methods** (lines 42-476)
   - ✅ Return pure HTML strings
   - ✅ No Dialog API usage
   - ✅ No changes needed

### 5.6 Code Review Checklist

After refactoring:
- [ ] `createMainDialog()` uses `UpdatableDialogV2` constructor
- [ ] Configuration structure matches V2 pattern (window.title, buttons array, etc.)
- [ ] `rejectClose: false` explicitly set
- [ ] `updateDialogContent()` delegates to subclass method
- [ ] `getDialogElement()` removes jQuery array access
- [ ] `closeDialog()` is now async with await
- [ ] No syntax errors in modified code
- [ ] JSDoc comments updated

### 5.7 Testing Refactored Methods

**Manual browser console test:**
```javascript
// In Foundry v12 or v13 console
const uiManager = new UIManager();

// Test createMainDialog
const dialog = uiManager.createMainDialog('<p>Initial</p>', () => console.log('Dialog closed'));
await dialog.render(true);
// Expected: Dialog appears with "Initial" content

// Test updateDialogContent
uiManager.updateDialogContent('<p>Updated 1</p>');
// Expected: Content changes to "Updated 1"
uiManager.updateDialogContent('<p>Updated 2</p>');
// Expected: Content changes to "Updated 2"

// Test getDialogElement
const el = uiManager.getDialogElement();
console.log(el);
// Expected: HTMLElement (not null)
console.log(el.querySelector('.dialog-content'));
// Expected: Element found

// Test closeDialog
await uiManager.closeDialog();
// Expected: Dialog closes, "Dialog closed" logged
console.log(uiManager.mainDialog);
// Expected: null
```

**Checkpoint:**
- [ ] All 5 methods refactored successfully
- [ ] Code compiles without syntax errors
- [ ] Manual browser test passes
- [ ] Dialog creates, updates, and closes correctly
- [ ] Element access works
- [ ] No browser console errors

**Estimated Time:** 2-3 hours

---

## 6. Phase 4: Testing and Validation

### 6.1 Unit-Level Testing

#### Test 1: Dialog Creation and Basic Operations

**v12 Test:**
```javascript
// Foundry v12 browser console
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<p>Test v12</p>', () => console.log('Closed'));
await dialog.render(true);

console.log(dialog instanceof foundry.applications.api.DialogV2);
// Expected: true

console.log(uiManager.isDialogOpen());
// Expected: true

await uiManager.closeDialog();
console.log(uiManager.isDialogOpen());
// Expected: false
```

**v13 Test:**
```javascript
// Foundry v13 browser console
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<p>Test v13</p>', () => console.log('Closed'));
await dialog.render(true);

console.log(dialog instanceof foundry.applications.api.DialogV2);
// Expected: true

console.log(uiManager.isDialogOpen());
// Expected: true

await uiManager.closeDialog();
console.log(uiManager.isDialogOpen());
// Expected: false
```

#### Test 2: Rapid Content Updates

**Stress test (10 rapid updates):**
```javascript
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<p>Initial</p>');
await dialog.render(true);

for (let i = 1; i <= 10; i++) {
  uiManager.updateDialogContent(`<p>Update ${i}</p>`);
  await new Promise(resolve => setTimeout(resolve, 100));  // 100ms delay
}
// Expected: All 10 updates render successfully without errors
```

#### Test 3: Element Access and DOM Manipulation

**Test:**
```javascript
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<div id="test-content">Hello</div>');
await dialog.render(true);

const el = uiManager.getDialogElement();
console.log(el.querySelector('#test-content').textContent);
// Expected: "Hello"

uiManager.updateDialogContent('<div id="test-content">World</div>');
console.log(uiManager.getDialogElement().querySelector('#test-content').textContent);
// Expected: "World"
```

#### Test 4: Close Callback Execution

**Test:**
```javascript
let callbackExecuted = false;
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<p>Test</p>', () => {
  callbackExecuted = true;
  console.log('Callback executed');
});
await dialog.render(true);

await uiManager.closeDialog();
console.log(callbackExecuted);
// Expected: true

console.log(uiManager.mainDialog);
// Expected: null
```

#### Test 5: Dialog Dismissal (X button)

**Manual test:**
1. Create and render dialog
2. Click X button in dialog header
3. Verify close callback executes
4. Verify `uiManager.mainDialog` is null

### 6.2 Integration Testing - Full Workflows

#### Workflow 1: Single Token with Match

**Test Steps:**
1. Open test world in Foundry (v12 or v13)
2. Place a token on canvas (e.g., "Goblin")
3. Select token
4. Click "Replace Token Artwork" scene control button
5. **Verify:** Dialog appears with TVA cache loading message
6. **Verify:** Dialog updates to parallel search progress
7. **Verify:** Dialog updates to match selection UI
8. **Verify:** Search filter input works
9. Select a token variant
10. Click "Apply" button
11. **Verify:** Dialog updates to replacement progress
12. **Verify:** Token artwork updates
13. **Verify:** Dialog closes with success message
14. **Verify:** No browser console errors

**Expected Duration:** 2-3 minutes per test

#### Workflow 2: Multiple Tokens (Multi-Select Mode)

**Test Steps:**
1. Place 3 identical tokens on canvas
2. Select all 3 tokens
3. Click "Replace Token Artwork"
4. **Verify:** Dialog shows multi-select mode toggle UI
5. **Verify:** "Sequential" and "Random" mode buttons appear
6. Select multiple token variants (e.g., 3 different variants)
7. Toggle mode to "Random"
8. **Verify:** Mode button visual state changes
9. Click "Apply"
10. **Verify:** All 3 tokens update with assigned variants
11. **Verify:** Random mode distributes variants randomly
12. **Verify:** Dialog closes
13. **Verify:** No browser console errors

**Expected Duration:** 3-4 minutes per test

#### Workflow 3: No Match + Category Search

**Test Steps:**
1. Place a token with unusual name (no automatic matches)
2. Select token
3. Click "Replace Token Artwork"
4. **Verify:** Dialog shows "No Match" UI
5. **Verify:** Category search input field appears
6. Enter category search term (e.g., "humanoid")
7. Click "Search Category" button
8. **Verify:** Dialog updates to show search progress
9. **Verify:** Progress updates in real-time
10. **Verify:** Results display after search completes
11. **Verify:** Category filter input works
12. Select a variant from results
13. Click "Apply"
14. **Verify:** Token updates
15. **Verify:** Dialog closes
16. **Verify:** No browser console errors

**Expected Duration:** 3-4 minutes per test

#### Workflow 4: Error Handling - TVA Not Available

**Test Steps:**
1. Disable Token Variant Art module
2. Refresh Foundry
3. Select token
4. Click "Replace Token Artwork"
5. **Verify:** Dialog shows error message (TVA required)
6. **Verify:** Error message is readable and helpful
7. **Verify:** Dialog can be closed
8. **Verify:** No browser console errors (except expected TVA warning)
9. Re-enable TVA module
10. Refresh and verify normal operation restored

**Expected Duration:** 2 minutes per test

#### Workflow 5: Dialog Interruption (Close During Update)

**Test Steps:**
1. Start token replacement workflow
2. When dialog shows search progress, quickly close dialog (X button)
3. **Verify:** Dialog closes without errors
4. **Verify:** No orphaned event listeners
5. **Verify:** `uiManager.mainDialog` is null
6. Start workflow again
7. **Verify:** Dialog works normally after interruption

**Expected Duration:** 2 minutes per test

### 6.3 Cross-Version Testing Matrix

**Required Tests:**

| Test Case | Foundry v12 | Foundry v13 |
|-----------|-------------|-------------|
| **Unit Tests** | | |
| Dialog creation | ✅ | ✅ |
| Content updates (10x rapid) | ✅ | ✅ |
| Element access | ✅ | ✅ |
| Close callback | ✅ | ✅ |
| Dialog dismissal (X button) | ✅ | ✅ |
| **Integration Tests** | | |
| Single token workflow | ✅ | ✅ |
| Multi-token workflow | ✅ | ✅ |
| Category search workflow | ✅ | ✅ |
| Error handling (no TVA) | ✅ | ✅ |
| Dialog interruption | ✅ | ✅ |
| **Visual Tests** | | |
| CSS styling intact | ✅ | ✅ |
| Match option grid layout | ✅ | ✅ |
| Button styling | ✅ | ✅ |
| Progress bar rendering | ✅ | ✅ |
| **Console Tests** | | |
| No JavaScript errors | ✅ | ✅ |
| No deprecation warnings | ✅ | ✅ |

**Testing Checklist:**
- [ ] All unit tests pass in v12
- [ ] All unit tests pass in v13
- [ ] All integration tests pass in v12
- [ ] All integration tests pass in v13
- [ ] All visual tests pass in v12
- [ ] All visual tests pass in v13
- [ ] No browser console errors in v12
- [ ] No browser console errors in v13

### 6.4 CSS and Visual Verification

**Visual Checklist:**

1. **Dialog Appearance**
   - [ ] Dialog renders at correct width (500px)
   - [ ] Dialog title displays correctly
   - [ ] Content area renders properly
   - [ ] Dialog can be moved (dragged)
   - [ ] Dialog stays on top of other elements

2. **Match Selection UI**
   - [ ] Token variant grid displays correctly
   - [ ] Images load and display
   - [ ] Variant names show below images
   - [ ] Selected state styling works (border/highlight)
   - [ ] Hover effects work

3. **Search Filter**
   - [ ] Filter input field renders
   - [ ] Filter input styling correct
   - [ ] Filtered results update correctly
   - [ ] "X matches" counter displays

4. **Mode Toggle Buttons**
   - [ ] Sequential/Random buttons render
   - [ ] Active state styling works
   - [ ] Click feedback visual

5. **Action Buttons**
   - [ ] "Apply" button renders correctly
   - [ ] "Skip" button renders correctly
   - [ ] Button hover states work
   - [ ] Button disabled states work (if applicable)

6. **Progress Displays**
   - [ ] Scan progress stats render
   - [ ] Search progress updates smoothly
   - [ ] Progress bar renders (if applicable)
   - [ ] Final success/error messages display

7. **No-Match Category Search UI**
   - [ ] Category input field renders
   - [ ] "Search Category" button renders
   - [ ] Loading state displays
   - [ ] Results grid renders correctly

**CSS Inspection:**
```javascript
// In browser console
const el = uiManager.getDialogElement();
console.log(el.className);
// Expected: Should include "token-replacer-fa-dialog"

console.log(el.querySelector('.dialog-content'));
// Expected: Should find content container
```

### 6.5 Performance Testing

**Content Update Performance:**
```javascript
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<p>Initial</p>');
await dialog.render(true);

// Measure 20 rapid updates
console.time('20 content updates');
for (let i = 1; i <= 20; i++) {
  uiManager.updateDialogContent(`<p>Update ${i}</p>`);
}
console.timeEnd('20 content updates');
// Expected: < 100ms total (very fast DOM updates)
```

**Memory Leak Check:**
```javascript
// Create and destroy dialog 10 times
for (let i = 0; i < 10; i++) {
  const uiManager = new UIManager();
  const dialog = uiManager.createMainDialog(`<p>Test ${i}</p>`);
  await dialog.render(true);
  await uiManager.closeDialog();
}
// Verify: uiManager.mainDialog is null after each iteration
// Verify: No increase in DOM node count (Chrome DevTools Memory)
```

### 6.6 Error Handling Verification

**Test Error Scenarios:**

1. **Update Before Render:**
   ```javascript
   const uiManager = new UIManager();
   const dialog = uiManager.createMainDialog('<p>Test</p>');
   // Don't render
   uiManager.updateDialogContent('<p>Update</p>');
   // Expected: Silent failure (no crash), warning logged
   ```

2. **Close Already Closed Dialog:**
   ```javascript
   const uiManager = new UIManager();
   const dialog = uiManager.createMainDialog('<p>Test</p>');
   await dialog.render(true);
   await uiManager.closeDialog();
   await uiManager.closeDialog();  // Close again
   // Expected: No error, handles gracefully
   ```

3. **Rapid Close/Reopen:**
   ```javascript
   const uiManager = new UIManager();
   for (let i = 0; i < 5; i++) {
     const dialog = uiManager.createMainDialog(`<p>Test ${i}</p>`);
     await dialog.render(true);
     await uiManager.closeDialog();
   }
   // Expected: All iterations succeed without errors
   ```

**Checkpoint:**
- [ ] All unit tests pass (both v12 and v13)
- [ ] All integration tests pass (both v12 and v13)
- [ ] All visual checks pass
- [ ] CSS styling intact
- [ ] Performance acceptable (< 100ms for 20 updates)
- [ ] No memory leaks detected
- [ ] Error handling verified
- [ ] No browser console errors in any test

**Estimated Time:** 2-4 hours (comprehensive testing)

---

## 7. Phase 5: Documentation and Release

### 7.1 Update CLAUDE.md

**File:** `CLAUDE.md`

**Changes:**

1. Update "Known Constraints" section (line 60):
   ```markdown
   ## Known Constraints

   - Index caching limited to ~4.5MB localStorage - larger indices rebuild on page load
   - ~~Uses deprecated V1 Dialog API (deadline: Foundry v16)~~ Migrated to DialogV2 in v3.0.0
   - D&D 5e system only (creature type extraction is system-specific)
   - TokenService uses static methods (intentional for stateless token operations)
   ```

2. Add new section after "Architecture":
   ```markdown
   ### Dialog System (V2)

   Module uses DialogV2 (ApplicationV2-based) with custom `UpdatableDialogV2` subclass:
   - Extends DialogV2 with `updateContent()` method for dynamic content updates
   - Supports 10-20 content updates per workflow (search progress, match selection, results)
   - Lifecycle-based cleanup via `_onAfterClose()` override
   - Compatible with Foundry v12-v13, future-proof for v16+
   ```

3. Update "Version Management" section:
   ```markdown
   ## Version Management

   Update version in TWO places:
   1. `module.json` - `"version": "X.Y.Z"`
   2. `scripts/main.js` - Console log string in `Hooks.once('init', ...)`

   **Migration Note:** v3.0.0+ uses DialogV2 (requires Foundry v12+)
   ```

### 7.2 Update module.json

**File:** `module.json`

**Changes:**

1. Update version:
   ```json
   "version": "3.0.0",
   ```

2. Update download URL:
   ```json
   "download": "https://github.com/Aiacos/token-replacer-fa/releases/download/v3.0.0/token-replacer-fa-v3.0.0.zip",
   ```

3. Update changelog entry (if exists):
   ```json
   "changelog": "https://github.com/Aiacos/token-replacer-fa/releases/tag/v3.0.0",
   ```

4. Verify minimum Foundry version:
   ```json
   "compatibility": {
     "minimum": "12",
     "verified": "13"
   }
   ```

### 7.3 Update main.js Console Log

**File:** `scripts/main.js`

**Change console log in `Hooks.once('init', ...)` (around line 12-15):**

**Before:**
```javascript
console.log('TOKEN_REPLACER_FA | Initializing Token Replacer FA v2.9.0');
```

**After:**
```javascript
console.log('TOKEN_REPLACER_FA | Initializing Token Replacer FA v3.0.0');
```

### 7.4 Create CHANGELOG Entry

**File:** `CHANGELOG.md` (create if doesn't exist)

**Add entry:**
```markdown
# Changelog

## [3.0.0] - 2026-02-XX

### Changed
- **BREAKING:** Migrated from deprecated Dialog V1 API to DialogV2
- **BREAKING:** Requires Foundry VTT v12 or higher
- Implemented custom `UpdatableDialogV2` subclass for dynamic content updates
- Updated all dialog lifecycle management to use ApplicationV2 patterns
- Improved v12/v13 cross-version compatibility

### Technical Details
- Created `UpdatableDialogV2` class extending `foundry.applications.api.DialogV2`
- Refactored `UIManager.createMainDialog()` to use DialogV2 constructor pattern
- Simplified `UIManager.updateDialogContent()` to delegate to subclass method
- Updated `UIManager.getDialogElement()` to use direct element access (no jQuery)
- Made `UIManager.closeDialog()` async to match DialogV2 API
- Preserved 100% backward compatibility with UIManager public API

### Migration Notes
- Zero changes required to consumer code (`main.js`)
- All event handlers and HTML generation methods unchanged
- CSS styling preserved (uses same selectors)
- Future-proof for Foundry v16 (V1 Dialog removal deadline)

## [2.9.0] - Previous version
...
```

### 7.5 Create Migration Notes Document

**File:** `MIGRATION_V3.md` (optional, for developers)

**Content:**
```markdown
# Migration to v3.0.0 (DialogV2)

## For Module Developers

This version migrates from Foundry's deprecated Dialog V1 API to DialogV2 (ApplicationV2-based).

### Key Changes

1. **Custom DialogV2 Subclass**
   - New `UpdatableDialogV2` class extends `foundry.applications.api.DialogV2`
   - Adds `updateContent()` method for dynamic content updates
   - Implements lifecycle-based cleanup via `_onAfterClose()`

2. **UIManager Public API**
   - **No breaking changes** - all public methods maintain same signatures
   - `closeDialog()` is now async (but can be called without `await`)

3. **Internal Changes**
   - Element access: `element[0]` → `element` (no jQuery array)
   - Constructor pattern: V1 `new Dialog(data, options)` → V2 `new DialogV2(config)`
   - Close callback: V1 `close: fn` → V2 lifecycle `_onAfterClose()`

### Testing

All workflows tested on Foundry v12 and v13:
- Single token replacement
- Multi-token replacement (sequential/random modes)
- Category search (no-match fallback)
- Error handling (missing TVA, etc.)
- Dialog dismissal and interruption

### Performance

- 20 rapid content updates: < 100ms
- No memory leaks detected
- No visual flickering or state loss

## For End Users

**No changes required.** This is an internal technical migration with no user-facing changes.

**Requirements:**
- Foundry VTT v12 or higher (module already required v12-v13)
- Token Variant Art module (no version change)

**Known Issues:**
- None reported
```

### 7.6 Git Commit and Tag

**Commands:**
```bash
# Stage all changes
git add scripts/ui/UIManager.js
git add module.json
git add scripts/main.js
git add CLAUDE.md
git add CHANGELOG.md
git add MIGRATION_V3.md  # if created

# Commit
git commit -m "Migrate from Dialog V1 to DialogV2 (v3.0.0)

- Implement UpdatableDialogV2 custom subclass
- Refactor UIManager dialog methods for V2 API
- Preserve 100% backward compatibility
- Test on Foundry v12 and v13
- Future-proof for v16 deadline

BREAKING CHANGE: Requires Foundry VTT v12+

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Create version tag
git tag v3.0.0

# Push to remote
git push origin feature/dialogv2-migration
git push origin v3.0.0
```

### 7.7 Create Pull Request

**GitHub Pull Request:**

**Title:** `Migrate from Dialog V1 to DialogV2 (v3.0.0)`

**Description:**
```markdown
## Summary

Migrates Token Replacer FA from the deprecated Dialog V1 API to DialogV2, ensuring compatibility with future Foundry VTT versions (v16 deadline).

## Changes

- ✅ Implemented custom `UpdatableDialogV2` subclass extending DialogV2
- ✅ Refactored `UIManager` dialog methods to use V2 API patterns
- ✅ Maintained 100% backward compatibility with public API
- ✅ Tested on Foundry v12 and v13
- ✅ Zero breaking changes to consumer code

## Technical Details

### Custom Subclass
- Created `UpdatableDialogV2` class to handle dynamic content updates
- Extends `foundry.applications.api.DialogV2`
- Implements `updateContent()` method (V2 lacks re-rendering support)
- Uses lifecycle hook `_onAfterClose()` for cleanup

### UIManager Refactoring
- `createMainDialog()`: V1 constructor → V2 constructor pattern
- `updateDialogContent()`: Delegates to subclass `updateContent()`
- `getDialogElement()`: Direct element access (no jQuery array)
- `closeDialog()`: Now async (matches V2 API)

### Compatibility
- Explicit `rejectClose: false` for v12/v13 consistency
- No changes to event handlers or HTML generation
- CSS styling preserved

## Testing

All tests passed on both Foundry v12 and v13:
- ✅ 5 unit tests (dialog creation, updates, element access, close callback, dismissal)
- ✅ 5 integration tests (single token, multi-token, category search, error handling, interruption)
- ✅ CSS/visual verification
- ✅ Performance testing (< 100ms for 20 updates)
- ✅ No memory leaks
- ✅ No browser console errors

## Migration Notes

**For Developers:**
- Zero code changes required in consumer files (`main.js`)
- `closeDialog()` can be called with or without `await`

**For Users:**
- No user-facing changes
- Requires Foundry VTT v12+ (module already required v12-v13)

## Checklist

- [x] Code implemented and tested
- [x] Documentation updated (CLAUDE.md, CHANGELOG.md)
- [x] Version bumped to 3.0.0
- [x] Git commit with semantic message
- [x] All tests pass (v12 and v13)
- [x] No browser console errors
- [x] CSS styling intact
```

### 7.8 Build and Release

**Build package:**
```bash
# Linux/macOS
bash build.sh

# Windows
build.bat
```

**Verify package:**
```bash
ls -lh releases/token-replacer-fa-v3.0.0.zip
# Expected: ZIP file exists
```

**Create GitHub release:**
```bash
gh release create v3.0.0 \
  releases/token-replacer-fa-v3.0.0.zip \
  module.json \
  --title "v3.0.0 - DialogV2 Migration" \
  --notes "## DialogV2 Migration

This release migrates Token Replacer FA from the deprecated Dialog V1 API to DialogV2, ensuring future compatibility with Foundry VTT v16+.

### Changes
- Migrated to DialogV2 (ApplicationV2-based)
- Implemented custom \`UpdatableDialogV2\` subclass for dynamic content updates
- Maintained 100% backward compatibility
- Tested on Foundry v12 and v13

### Requirements
- Foundry VTT v12 or higher
- Token Variant Art module

### Installation
Use the manifest URL: \`https://github.com/Aiacos/token-replacer-fa/releases/latest/download/module.json\`

### Breaking Changes
- Requires Foundry VTT v12+ (module already required v12-v13)

### Technical Details
See [CHANGELOG.md](https://github.com/Aiacos/token-replacer-fa/blob/main/CHANGELOG.md) for full details." \
  --latest
```

**Checkpoint:**
- [ ] CLAUDE.md updated
- [ ] module.json version and download URL updated
- [ ] main.js console log updated
- [ ] CHANGELOG.md created/updated
- [ ] Git commit created with semantic message
- [ ] Version tag created (v3.0.0)
- [ ] Code pushed to remote
- [ ] Pull request created
- [ ] Package built successfully
- [ ] GitHub release created

**Estimated Time:** 1-2 hours

---

## 8. Rollback Plan

### 8.1 Rollback Triggers

**Rollback is required if:**
- ❌ Any integration test fails after 2 fix attempts
- ❌ Browser console shows critical errors that can't be resolved
- ❌ CSS styling breaks significantly
- ❌ Memory leaks detected
- ❌ Content updates fail in > 10% of attempts
- ❌ User workflows broken or significantly degraded

### 8.2 Immediate Rollback Procedure

**Step 1: Revert Git Changes**
```bash
# Check current branch
git branch --show-current
# Expected: feature/dialogv2-migration

# Discard all changes
git reset --hard v2.9.0-pre-migration

# Verify rollback
git log --oneline -1
# Expected: Commit before migration started
```

**Step 2: Return to Main Branch**
```bash
git checkout main

# Delete feature branch (optional)
git branch -D feature/dialogv2-migration
```

**Step 3: Verify v2.9.0 Code**
```bash
# Check UIManager.js for V1 Dialog usage
grep "new Dialog" scripts/ui/UIManager.js
# Expected: Should find V1 Dialog constructor
```

**Step 4: Test Foundry Integration**
1. Reload Foundry VTT
2. Check module loads correctly
3. Run basic token replacement workflow
4. Verify no errors

### 8.3 Post-Rollback Analysis

**Document Failure:**
1. Create GitHub issue with failure details
2. Include:
   - Error messages (browser console)
   - Failed test scenario
   - Foundry version (v12 or v13)
   - Screenshots of broken UI (if applicable)
3. Tag with `migration` and `bug` labels

**Root Cause Investigation:**
1. Review error logs
2. Identify specific failure point:
   - Custom subclass implementation?
   - UIManager refactoring?
   - Element access pattern?
   - Lifecycle callback timing?
3. Document findings in GitHub issue

**Re-Attempt Strategy:**
1. Fix identified issue in isolated test
2. Create new feature branch
3. Apply fix
4. Re-test before full migration
5. Repeat migration process

### 8.4 Partial Rollback (Hotfix)

**If only one component fails:**

**Example: Custom subclass works, but UIManager refactoring has issue**

```bash
# Keep custom subclass, revert UIManager changes only
git checkout v2.9.0-pre-migration -- scripts/ui/UIManager.js

# Re-apply only non-failing changes
# (manually edit UIManager.js to keep working parts)

# Test and commit fixed version
git add scripts/ui/UIManager.js
git commit -m "Partial DialogV2 migration - hotfix for UIManager"
```

### 8.5 Communication Plan

**If rollback required:**

1. **Update Pull Request:**
   - Add comment explaining rollback reason
   - Close PR with "needs-work" label

2. **Notify Users (if released):**
   - Create GitHub issue: "v3.0.0 Rollback Notice"
   - Explain regression briefly
   - Recommend staying on v2.9.0
   - Provide timeline for fix

3. **Internal Documentation:**
   - Update `MIGRATION_PLAN.md` with lessons learned
   - Document what went wrong in "Gotchas" section
   - Update risk assessment for next attempt

### 8.6 Prevention Measures

**To avoid rollback:**
- ✅ Complete all testing before merging to main
- ✅ Test on BOTH v12 and v13 before release
- ✅ Run full workflow testing (all 5 scenarios)
- ✅ Verify CSS in both versions
- ✅ Check browser console for errors after every test
- ✅ Get peer review of code changes (if team available)

---

## 9. Timeline and Milestones

### 9.1 Gantt Chart Overview

```
Phase 1: Preparation        [■■] 30 min     (0.5h)
Phase 2: Custom Subclass    [■■■■■■] 2-3h   (2.5h avg)
Phase 3: UIManager Refactor [■■■■■■] 2-3h   (2.5h avg)
Phase 4: Testing            [■■■■■■■■] 2-4h (3h avg)
Phase 5: Documentation      [■■■■] 1-2h     (1.5h avg)
──────────────────────────────────────────────────────
Total:                      8-12 hours      (10h avg)
```

### 9.2 Milestone Schedule

**Milestone 1: Development Environment Ready**
- **Duration:** 30 minutes
- **Deliverable:** Git branch created, test environments verified
- **Completion Criteria:**
  - [ ] Feature branch exists
  - [ ] Backup tag created
  - [ ] v12 and v13 test environments accessible
  - [ ] DialogV2 verified in both versions

**Milestone 2: Custom Subclass Implemented**
- **Duration:** 2-3 hours
- **Deliverable:** `UpdatableDialogV2` class complete and tested
- **Completion Criteria:**
  - [ ] Class extends DialogV2
  - [ ] All 5 methods implemented (constructor, updateContent, etc.)
  - [ ] JSDoc comments complete
  - [ ] Browser console test passes

**Milestone 3: UIManager Refactored**
- **Duration:** 2-3 hours
- **Deliverable:** All UIManager methods updated for V2
- **Completion Criteria:**
  - [ ] 5 methods refactored (createMainDialog, updateDialogContent, etc.)
  - [ ] Code compiles without syntax errors
  - [ ] Manual browser test passes
  - [ ] Element access pattern updated

**Milestone 4: Testing Complete**
- **Duration:** 2-4 hours
- **Deliverable:** All tests passed on v12 and v13
- **Completion Criteria:**
  - [ ] All unit tests pass (both versions)
  - [ ] All integration tests pass (both versions)
  - [ ] CSS verification complete
  - [ ] Performance acceptable
  - [ ] No browser console errors

**Milestone 5: Documentation and Release**
- **Duration:** 1-2 hours
- **Deliverable:** v3.0.0 released to GitHub
- **Completion Criteria:**
  - [ ] CLAUDE.md updated
  - [ ] module.json version bumped
  - [ ] CHANGELOG.md created
  - [ ] Git commit and tag created
  - [ ] GitHub release published

### 9.3 Time Allocation Recommendations

**Recommended Schedule:**

**Session 1 (4-6 hours):**
- Phase 1: Preparation (30 min)
- Phase 2: Custom Subclass (2-3 hours)
- Phase 3: UIManager Refactoring (2-3 hours)
- **Checkpoint:** Code complete, basic testing done

**Break:** 1-2 hours (rest, clear mind)

**Session 2 (4-6 hours):**
- Phase 4: Comprehensive Testing (2-4 hours)
- Phase 5: Documentation and Release (1-2 hours)
- **Checkpoint:** Migration complete, released

**Alternative: Single 8-12 Hour Session**
- Recommended for experienced developers
- Take 10-minute breaks every 2 hours
- Checkpoint after each phase

### 9.4 Critical Path

**Dependencies:**

```
Phase 1 (Preparation)
   ↓
Phase 2 (Custom Subclass) ← CRITICAL: Required for Phase 3
   ↓
Phase 3 (UIManager Refactor) ← CRITICAL: Required for Phase 4
   ↓
Phase 4 (Testing) ← CRITICAL: Required for Phase 5
   ↓
Phase 5 (Documentation)
```

**No parallelization possible** - phases must be sequential.

### 9.5 Buffer Time

**Recommended Buffers:**
- Phase 2: +1 hour (for debugging custom subclass)
- Phase 3: +1 hour (for refactoring issues)
- Phase 4: +2 hours (for comprehensive testing)

**Total Buffer:** 4 hours (50% overhead on 8-hour estimate)

**Final Estimate:** 8-12 hours baseline + 4 hours buffer = **12-16 hours worst case**

---

## 10. Risk Management

### 10.1 Risk Register

| Risk ID | Risk Description | Probability | Impact | Mitigation | Contingency |
|---------|-----------------|-------------|--------|------------|-------------|
| **R1** | Custom subclass updateContent() fails | MEDIUM | HIGH | Thorough testing in Phase 2 | Revert to manual DOM updates |
| **R2** | CSS styling breaks in V2 | MEDIUM | LOW | CSS testing in Phase 4 | Update selectors |
| **R3** | Element access errors (jQuery → native) | LOW | MEDIUM | Code review + testing | Add null checks |
| **R4** | Close callback doesn't fire | LOW | LOW | Test in Phase 4 | Debug lifecycle timing |
| **R5** | V12/V13 behavioral differences | MEDIUM | MEDIUM | Explicit `rejectClose` setting | Version-specific code |
| **R6** | Performance degradation | LOW | LOW | Performance tests in Phase 4 | Optimize DOM updates |
| **R7** | Memory leaks | LOW | MEDIUM | Memory leak tests in Phase 4 | Fix cleanup logic |
| **R8** | Breaking changes to main.js required | LOW | HIGH | Preserve public API | Rollback if needed |

### 10.2 Risk Mitigation Details

#### R1: Custom Subclass updateContent() Fails

**Mitigation:**
- Test `updateContent()` immediately after implementation (Phase 2)
- Verify DOM structure matches expectations (`.dialog-content` selector)
- Test rapid updates (10-20x) to ensure stability
- Add comprehensive error handling

**Contingency:**
- If `updateContent()` fails, fall back to manual DOM manipulation in UIManager
- Document as known limitation
- Plan for future improvement

#### R2: CSS Styling Breaks in V2

**Mitigation:**
- Inspect V2 DOM structure in browser (DevTools)
- Compare V1 and V2 HTML output
- Test CSS in both v12 and v13
- Update selectors if needed

**Contingency:**
- Maintain both old and new selectors for backward compatibility
- Use fallback styles if primary selectors fail

#### R3: Element Access Errors

**Mitigation:**
- Global search for `.element[0]` and `.element?.[0]` patterns
- Replace with direct `.element` access
- Add null checks where appropriate
- Test element access in all code paths

**Contingency:**
- Add defensive checks: `if (!element) return null;`
- Log warnings for debugging

#### R4: Close Callback Doesn't Fire

**Mitigation:**
- Test close callback in Phase 4 (Test 4)
- Verify `_onAfterClose()` lifecycle hook executes
- Check both normal close and dismissal (X button)

**Contingency:**
- Add debug logging to `_onAfterClose()`
- Investigate lifecycle timing
- Consider alternative cleanup mechanism

#### R5: V12/V13 Behavioral Differences

**Mitigation:**
- Explicitly set `rejectClose: false` in all DialogV2 instances
- Test dismissal behavior in both versions
- Document any version-specific quirks

**Contingency:**
- Add version detection if needed:
  ```javascript
  const version = game.release.generation;
  const rejectClose = version >= 13 ? false : false;  // Explicit for clarity
  ```

#### R6: Performance Degradation

**Mitigation:**
- Run performance tests (20 rapid updates)
- Measure time with `console.time()`
- Ensure < 100ms for all content updates
- Profile in Chrome DevTools if needed

**Contingency:**
- Optimize DOM updates (minimize innerHTML changes)
- Consider debouncing rapid updates
- Cache DOM selectors

#### R7: Memory Leaks

**Mitigation:**
- Test dialog creation/destruction loop (10x)
- Check `uiManager.mainDialog` is null after close
- Monitor DOM node count in DevTools
- Verify event listeners removed

**Contingency:**
- Add explicit cleanup in `_onAfterClose()`
- Remove event listeners manually if needed
- Force garbage collection in tests

#### R8: Breaking Changes Required to main.js

**Mitigation:**
- Design UIManager API to be 100% backward compatible
- Keep method signatures identical
- `closeDialog()` can be called with or without `await`
- Preserve all existing functionality

**Contingency:**
- If breaking changes unavoidable, document clearly
- Provide migration guide for main.js
- Update all consumer code
- Test thoroughly after changes

### 10.3 Risk Response Plan

**If ANY high-impact risk materializes:**
1. **Immediate:** Stop development, assess impact
2. **Document:** Record exact error, test scenario, screenshots
3. **Analyze:** Determine root cause
4. **Decide:** Fix immediately OR rollback
5. **Execute:** Implement fix OR trigger rollback procedure (Section 8)

**Escalation Criteria:**
- Multiple risks materialize simultaneously
- Fix attempts fail 2+ times
- Timeline exceeds 16 hours
- Critical functionality broken

**Escalation Action:**
- Trigger full rollback (Section 8.2)
- Document lessons learned
- Schedule re-attempt for later date

---

## 11. Success Criteria

### 11.1 Technical Success Criteria

**Code Quality:**
- [ ] All code passes linting (no syntax errors)
- [ ] All methods have JSDoc comments
- [ ] No console.log debugging statements left in code
- [ ] Error handling implemented for all edge cases

**Functionality:**
- [ ] Dialog creates and renders successfully
- [ ] Content updates 10-20 times without errors
- [ ] Element access returns correct HTMLElement
- [ ] Close callback executes on dialog close
- [ ] Dialog cleanup happens (mainDialog set to null)

**Performance:**
- [ ] 20 rapid content updates complete in < 100ms
- [ ] No memory leaks after 10 create/close cycles
- [ ] No visual flickering during updates
- [ ] Dialog position preserved during updates

**Compatibility:**
- [ ] Works on Foundry VTT v12
- [ ] Works on Foundry VTT v13
- [ ] No deprecation warnings in console
- [ ] CSS styling intact in both versions

**Testing:**
- [ ] All 5 unit tests pass (both v12 and v13)
- [ ] All 5 integration tests pass (both v12 and v13)
- [ ] All visual checks pass
- [ ] No browser console errors in any test
- [ ] Error handling verified

### 11.2 Documentation Success Criteria

**Code Documentation:**
- [ ] `UpdatableDialogV2` class fully documented
- [ ] All UIManager methods have updated JSDoc
- [ ] Inline comments explain complex logic

**Project Documentation:**
- [ ] CLAUDE.md updated with V2 patterns
- [ ] module.json version bumped to 3.0.0
- [ ] CHANGELOG.md created with v3.0.0 entry
- [ ] MIGRATION_V3.md created (optional)
- [ ] README updated if needed

**Git Documentation:**
- [ ] Commit message is semantic and descriptive
- [ ] Version tag created (v3.0.0)
- [ ] Pull request has detailed description
- [ ] GitHub release notes complete

### 11.3 Release Success Criteria

**Build:**
- [ ] Package builds successfully (ZIP created)
- [ ] ZIP contains all required files
- [ ] module.json in ZIP has correct version and download URL

**GitHub Release:**
- [ ] Release tagged as v3.0.0
- [ ] ZIP file uploaded
- [ ] module.json uploaded separately
- [ ] Release notes clear and accurate
- [ ] Release marked as "latest"

**Distribution:**
- [ ] Manifest URL works: `https://github.com/Aiacos/token-replacer-fa/releases/latest/download/module.json`
- [ ] ZIP download works
- [ ] Module installs successfully in Foundry from URL

### 11.4 User Experience Success Criteria

**No Breaking Changes:**
- [ ] All existing workflows continue to work
- [ ] No user-facing changes in behavior
- [ ] No new error messages for valid operations

**Visual Consistency:**
- [ ] Dialog looks identical to v2.9.0
- [ ] CSS styling preserved
- [ ] Button placement unchanged
- [ ] Progress displays render correctly

**Performance:**
- [ ] Workflows complete as fast as v2.9.0
- [ ] No noticeable lag or delays
- [ ] No visual artifacts or flickering

### 11.5 Overall Success Definition

**Migration is SUCCESSFUL if:**
✅ All technical success criteria met
✅ All documentation success criteria met
✅ All release success criteria met
✅ All user experience success criteria met
✅ No rollback triggered
✅ Zero critical bugs reported within 7 days post-release

**Migration is PARTIALLY SUCCESSFUL if:**
⚠️ 80-99% of criteria met
⚠️ Minor issues exist but don't block workflows
⚠️ Hotfix required within 7 days

**Migration FAILS if:**
❌ < 80% of criteria met
❌ Critical functionality broken
❌ Rollback required
❌ Multiple critical bugs reported

---

## Appendix A: Quick Reference

### A.1 File Locations

| File | Purpose | Changes |
|------|---------|---------|
| `scripts/ui/UIManager.js` | Main dialog implementation | Add UpdatableDialogV2 class, refactor 5 methods |
| `module.json` | Module metadata | Version 3.0.0, download URL |
| `scripts/main.js` | Module entry point | Update console log version |
| `CLAUDE.md` | Developer guide | Update dialog section, remove V1 reference |
| `CHANGELOG.md` | Version history | Add v3.0.0 entry |

### A.2 Key Code Patterns

**V1 Dialog Creation (OLD):**
```javascript
new Dialog({ title, content, buttons, close }, { classes, width, height })
```

**V2 DialogV2 Creation (NEW):**
```javascript
new UpdatableDialogV2({ window: { title }, content, buttons: [], classes, position: { width } }, manager, onClose)
```

**Element Access (OLD):**
```javascript
this.mainDialog.element?.[0]
```

**Element Access (NEW):**
```javascript
this.mainDialog.element
```

**Content Update (OLD):**
```javascript
this.mainDialog.data.content = newContent;
dialogElement.querySelector('.dialog-content').innerHTML = newContent;
```

**Content Update (NEW):**
```javascript
this.mainDialog.updateContent(newContent);
```

### A.3 Testing Commands

**Basic Dialog Test:**
```javascript
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<p>Test</p>');
await dialog.render(true);
uiManager.updateDialogContent('<p>Updated</p>');
await uiManager.closeDialog();
```

**Rapid Update Test:**
```javascript
for (let i = 1; i <= 20; i++) {
  uiManager.updateDialogContent(`<p>Update ${i}</p>`);
}
```

**Memory Leak Test:**
```javascript
for (let i = 0; i < 10; i++) {
  const dialog = uiManager.createMainDialog(`<p>Test ${i}</p>`);
  await dialog.render(true);
  await uiManager.closeDialog();
}
```

### A.4 Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot update content: dialog not rendered" | `updateContent()` called before `render()` | Ensure `await dialog.render(true)` before updates |
| "Dialog content container not found" | `.dialog-content` selector not found | Verify V2 DOM structure, update selector if needed |
| Close callback doesn't execute | `_onAfterClose()` not called | Check dialog closes properly, verify `super._onAfterClose()` called |
| CSS styling broken | V2 DOM structure different | Inspect element, update CSS selectors |
| Element access returns null | Dialog not rendered yet | Add null check, ensure dialog is rendered |

### A.5 Rollback Command Reference

**Quick Rollback:**
```bash
git reset --hard v2.9.0-pre-migration
git checkout main
```

**Verify Rollback:**
```bash
git log --oneline -1
grep "new Dialog" scripts/ui/UIManager.js  # Should find V1 usage
```

---

## Appendix B: Research Document References

### B.1 Research Documents

1. **dialogv2-research.md**
   - V2 API structure and configuration
   - Static helper methods (confirm, prompt, wait, input, query)
   - Lifecycle methods
   - Key differences from V1
   - Migration examples
   - Best practices and common pitfalls

2. **v1-usage-analysis.md**
   - Current V1 Dialog usage patterns
   - `createMainDialog()` implementation
   - `updateDialogContent()` dual update approach
   - Event handler setup patterns
   - Dialog lifecycle management
   - Usage statistics (10-20 updates per workflow)

3. **migration-challenges.md**
   - Breaking changes (constructor, element access, content updates, close callbacks)
   - V12/V13 compatibility concerns
   - HIGH RISK: Dynamic content updates (no re-rendering support)
   - Three migration options analyzed
   - Risk assessment matrix
   - Phased migration approach
   - Rollback strategy

4. **v2-architecture.md**
   - `UpdatableDialogV2` class design (full code)
   - UIManager method refactoring specifications
   - State management and lifecycle
   - Backward compatibility strategy (100% public API preservation)
   - Testing strategy (15 manual test scenarios)
   - Implementation complexity breakdown
   - Success metrics

### B.2 Official Foundry Documentation

- [DialogV2 API Documentation (v13)](https://foundryvtt.com/api/classes/foundry.applications.api.DialogV2.html)
- [DialogV2Configuration Interface](https://foundryvtt.com/api/interfaces/foundry.DialogV2Configuration.html)
- [ApplicationV2 Conversion Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)
- [API Migration Guides](https://foundryvtt.com/article/migration/)

### B.3 Community Resources

- [DialogV2 Community Wiki](https://foundryvtt.wiki/en/development/api/dialogv2)
- [GitHub Issue #11351 - Convert Dialog to DialogV2](https://github.com/foundryvtt/foundryvtt/issues/11351)

---

## Document History

**Version 1.0** - 2026-02-14
- Initial migration plan created
- Based on completed research documents (Phases 1 and 2.1)
- Defines 5 implementation phases
- Includes comprehensive testing strategy
- Provides rollback plan and risk management
- Estimates 8-12 hours implementation time

**Status:** ✅ Ready for Implementation
**Next Steps:** Begin Phase 1 (Preparation)
