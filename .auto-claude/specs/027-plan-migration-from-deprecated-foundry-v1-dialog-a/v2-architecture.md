# DialogV2 Architecture Design for Token Replacer FA

**Design Date:** 2026-02-14
**Target Foundry VTT Versions:** v12-v13
**Affected Component:** `scripts/ui/UIManager.js`
**Migration Deadline:** Foundry v16

---

## Executive Summary

This document defines the architectural design for migrating Token Replacer FA from the deprecated Dialog V1 API to DialogV2. The design preserves the existing UIManager public API while introducing a custom `UpdatableDialogV2` subclass to solve DialogV2's lack of re-rendering support.

**Key Design Principles:**
1. ✅ **Zero breaking changes** to UIManager's public API
2. ✅ **Backward compatibility** with existing consumer code (`main.js`)
3. ✅ **Future-proof** for Foundry v16+ (V1 removal deadline)
4. ⚠️ **Pragmatic workaround** for DialogV2's content update limitation

---

## 1. Architecture Overview

### 1.1 Component Structure

```
scripts/ui/
├── UIManager.js (existing, refactored)
│   ├── class UIManager
│   │   ├── constructor()
│   │   ├── createMainDialog()          [REFACTORED - V2 usage]
│   │   ├── updateDialogContent()       [REFACTORED - subclass method]
│   │   ├── getDialogElement()          [REFACTORED - element access]
│   │   ├── isDialogOpen()              [UNCHANGED]
│   │   ├── closeDialog()               [REFACTORED - async]
│   │   ├── setupMatchSelectionHandlers() [UNCHANGED]
│   │   ├── setupNoMatchHandlers()      [UNCHANGED]
│   │   └── HTML generation methods     [UNCHANGED - all 12 methods]
│   │
│   └── class UpdatableDialogV2 extends DialogV2  [NEW]
│       ├── constructor(config, manager, onCloseCallback)
│       ├── updateContent(newContent)
│       ├── async _onAfterClose(options)
│       └── _safeUpdateContent(newContent) [PRIVATE]
```

### 1.2 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Custom DialogV2 subclass** | DialogV2 lacks re-rendering; subclass encapsulates workaround |
| **Maintain UIManager public API** | Zero breaking changes for consumer code (`main.js`) |
| **Manual DOM updates** | Only viable solution for 10-20 content updates per workflow |
| **Lifecycle-based cleanup** | V2's `_onAfterClose()` replaces V1's `close` callback |
| **Explicit `rejectClose: false`** | Ensures consistent behavior across v12/v13 |

---

## 2. Custom Dialog Class Design

### 2.1 UpdatableDialogV2 Class

**Purpose:** Extend DialogV2 with content update capability missing from base class

**Location:** `scripts/ui/UIManager.js` (defined before UIManager class)

#### Class Definition

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

#### Design Notes

**Why manual DOM updates?**
- DialogV2 explicitly does not support re-rendering (`render()` won't update content)
- Close/recreate pattern causes poor UX (flickering, state loss)
- Manual DOM updates preserve dialog position, scroll state, and user context
- This is the **only viable solution** for the module's 10-20 content updates per workflow

**Lifecycle integration:**
- `_onAfterClose()` replaces V1's `close` callback mechanism
- Cleanup is guaranteed to run (even on error/dismissal)
- `super._onAfterClose()` called to preserve framework behavior

**Error handling:**
- Guards against rendering state issues (`!this.rendered`)
- Silent failures during transitions (dialog might be closing)
- Logs warnings for debugging without crashing workflows

---

## 3. UIManager Refactoring

### 3.1 Method Signatures (Updated)

#### 3.1.1 createMainDialog()

**Before (V1):**
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

**After (V2):**
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

**Key Changes:**
- ✅ Constructor: `new Dialog()` → `new UpdatableDialogV2()`
- ✅ Title: `title: string` → `window: { title: string }`
- ✅ Buttons: `buttons: {}` → `buttons: []`
- ✅ Sizing: `width: 500` → `position: { width: 500 }`
- ✅ Close callback: `close: fn` → passed to constructor, handled in `_onAfterClose()`
- ✅ Explicit `rejectClose: false` for v12/v13 compatibility

**Removed Options:**
- `resizable: true` - **Investigation required**: Check if DialogV2 supports this
  - If not available, may need to accept non-resizable dialogs
  - Alternative: Check ApplicationV2 configuration for window management

#### 3.1.2 updateDialogContent()

**Before (V1):**
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

**After (V2):**
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

**Key Changes:**
- ✅ Simplified to delegate to `UpdatableDialogV2.updateContent()`
- ✅ Preserves error-tolerant behavior (silent catch)
- ✅ No more V1-specific `data.content` mutation
- ✅ No more jQuery-style element access

#### 3.1.3 getDialogElement()

**Before (V1):**
```javascript
getDialogElement() {
  return this.mainDialog?.element?.[0] || null;
}
```

**After (V2):**
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

**Key Changes:**
- ✅ Remove jQuery array access: `element?.[0]` → `element`
- ✅ V2 returns direct HTMLElement reference

#### 3.1.4 isDialogOpen()

**No changes required** - Already using instance existence check:

```javascript
/**
 * Check if main dialog is currently open
 *
 * @returns {boolean} True if dialog is open
 */
isDialogOpen() {
  return !!this.mainDialog;
}
```

#### 3.1.5 closeDialog()

**Before (V1):**
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

**After (V2):**
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

**Key Changes:**
- ✅ Made async (DialogV2's `close()` is async)
- ⚠️ Cleanup now happens in `_onAfterClose()` lifecycle hook (except on error)
- ✅ Preserves error handling for already-closed state

#### 3.1.6 Event Handler Methods

**No changes required** - Already use pure DOM operations:

- `setupMatchSelectionHandlers(dialogElement)` - ✅ No V1 API dependencies
- `setupNoMatchHandlers(dialogElement, ...)` - ✅ No V1 API dependencies

Both methods:
- Receive `dialogElement` as parameter (from `getDialogElement()`)
- Use standard DOM methods (`querySelector`, `addEventListener`)
- Return Promises for async user interaction
- **No refactoring needed**

#### 3.1.7 HTML Generation Methods

**No changes required** - All 12 methods generate pure HTML strings:

- `createScanProgressHTML()`
- `createParallelSearchHTML()`
- `createTVACacheHTML()`
- `createMatchSelectionHTML()`
- `createNoMatchHTML()`
- `createSearchProgressHTML()`
- `createProgressHTML()`
- `createErrorHTML()`
- And 4 other utility methods

**No refactoring needed** - Output is consumed by V2 just like V1

---

## 4. State Management

### 4.1 Instance State

**UIManager state (unchanged):**
```javascript
class UIManager {
  constructor() {
    /**
     * Main dialog instance
     * @type {UpdatableDialogV2|null}
     */
    this.mainDialog = null;
  }
}
```

**UpdatableDialogV2 state:**
```javascript
class UpdatableDialogV2 extends foundry.applications.api.DialogV2 {
  constructor(config, manager, onCloseCallback) {
    super(config);
    this._manager = manager;           // Back-reference for cleanup
    this._onCloseCallback = onCloseCallback;  // Close callback
    this._isUpdating = false;          // Update lock flag
  }
}
```

### 4.2 Lifecycle State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│ DIALOG LIFECYCLE (V2)                                           │
└─────────────────────────────────────────────────────────────────┘

1. CREATION
   UIManager.createMainDialog(content, onClose)
   ↓
   new UpdatableDialogV2(config, manager, onClose)
   ↓
   UIManager.mainDialog = dialog instance
   ↓
   dialog.render(true)  [in main.js]

2. USAGE (10-20 cycles)
   UIManager.updateDialogContent(newContent)
   ↓
   dialog.updateContent(newContent)
   ↓
   dialog._safeUpdateContent(newContent)
   ↓
   contentEl.innerHTML = newContent
   ↓
   UIManager.getDialogElement()
   ↓
   UIManager.setupMatchSelectionHandlers(dialogElement)

3. CLOSURE
   User action or UIManager.closeDialog()
   ↓
   await dialog.close()
   ↓
   dialog._onAfterClose()
   ↓
   onCloseCallback?.()
   ↓
   manager.mainDialog = null
```

### 4.3 Error State Handling

**Content update failures:**
- `updateContent()` returns `false` if dialog not rendered
- Logs warning but doesn't crash workflow
- Caller can ignore return value (existing behavior)

**Close errors:**
- `closeDialog()` catches errors from already-closed dialogs
- Manually sets `mainDialog = null` on error
- Prevents memory leaks

**Transition states:**
- `updateDialogContent()` has try/catch for transition errors
- Silent failures preserve V1 behavior
- Dialog might be mid-animation when update attempted

---

## 5. Backward Compatibility Strategy

### 5.1 Public API Compatibility

**UIManager's public API remains 100% unchanged:**

| Method | Signature | Consumer Impact |
|--------|-----------|-----------------|
| `createMainDialog(content, onClose)` | ✅ Unchanged | main.js: No changes needed |
| `updateDialogContent(content)` | ✅ Unchanged | main.js: No changes needed |
| `getDialogElement()` | ✅ Unchanged | main.js: No changes needed |
| `isDialogOpen()` | ✅ Unchanged | main.js: No changes needed |
| `closeDialog()` | ⚠️ Now async | main.js: Can call with or without `await` |

**Breaking changes:** NONE

**Behavioral changes:**
- ⚠️ `closeDialog()` is now async (but can be called sync without `await`)
- Dialog may look slightly different if V2 uses different default styling
- `rejectClose: false` means dismissal returns `null` (v13 behavior)

### 5.2 main.js Compatibility

**Existing main.js code patterns (no changes required):**

```javascript
// Pattern 1: Dialog creation
const dialog = uiManager.createMainDialog(initialContent, () => {
  console.log('Dialog closed');
});
await dialog.render(true);  // ✅ Still works (UpdatableDialogV2 extends DialogV2)

// Pattern 2: Content updates
uiManager.updateDialogContent(progressHTML);  // ✅ Still works (delegates to updateContent)

// Pattern 3: Element access for events
const dialogElement = uiManager.getDialogElement();  // ✅ Still returns HTMLElement
await uiManager.setupMatchSelectionHandlers(dialogElement);

// Pattern 4: Dialog closure
uiManager.closeDialog();  // ✅ Still works (can omit await)
// OR
await uiManager.closeDialog();  // ✅ Also works (async safe)
```

**Zero breaking changes to main.js**

### 5.3 Foundry Version Compatibility

**Supported versions:** v12, v13 (module already requires v12-v13)

**V12 vs V13 differences handled:**
- ✅ `rejectClose: false` explicitly set for consistent behavior
- ✅ DialogV2 available in both v12 and v13
- ✅ No version-specific code paths needed

**Future-proofing for v16:**
- ✅ Migration completed before V1 removal deadline
- ✅ No deprecated APIs remaining

---

## 6. CSS and Styling Compatibility

### 6.1 CSS Selector Assumptions

**Current CSS (from module CSS file):**
```css
.token-replacer-fa-dialog .dialog-content {
  /* Custom styles */
}
```

**V2 DOM structure assumption:**
```html
<div class="application token-replacer-fa-dialog">
  <div class="window-content">
    <div class="dialog-content">
      <!-- Module HTML content -->
    </div>
  </div>
</div>
```

**Risk:** V2 may generate different structure/class names

**Mitigation:**
1. Test CSS in both v12 and v13
2. Update selectors if needed (`.token-replacer-fa-dialog` should remain via `classes` option)
3. Inspect actual V2 DOM structure during testing
4. Add fallback selectors if structure differs

### 6.2 Style Testing Checklist

- [ ] Dialog width (500px) applied correctly
- [ ] Content scrolling works
- [ ] Match option grid layout intact
- [ ] Search filter input styling
- [ ] Button styling (Apply, Skip, etc.)
- [ ] Progress bar rendering
- [ ] Scan stats display
- [ ] Error state styling
- [ ] No-match category search UI
- [ ] Multi-select mode toggle appearance

---

## 7. Testing Strategy

### 7.1 Unit-Level Testing (Manual)

**Test 1: Dialog Creation**
```javascript
// In browser console
const uiManager = new UIManager();
const dialog = uiManager.createMainDialog('<p>Test content</p>', () => console.log('Closed'));
await dialog.render(true);
// Expected: Dialog appears with "Test content"
```

**Test 2: Content Updates**
```javascript
// After Test 1
uiManager.updateDialogContent('<p>Updated content</p>');
// Expected: Content changes without dialog closing
uiManager.updateDialogContent('<p>Second update</p>');
// Expected: Content changes again smoothly
```

**Test 3: Element Access**
```javascript
const el = uiManager.getDialogElement();
console.log(el);  // Expected: HTMLElement (not null)
console.log(el.querySelector('.dialog-content'));  // Expected: Found
```

**Test 4: Dialog Closure**
```javascript
await uiManager.closeDialog();
// Expected: Dialog closes, console logs "Closed" from callback
console.log(uiManager.mainDialog);  // Expected: null
```

### 7.2 Integration Testing (Full Workflow)

**Test Scenario 1:** Single token with match
1. Select token on canvas
2. Click "Replace Token Artwork" button
3. Verify TVA cache loading display
4. Verify parallel search progress
5. Verify match selection UI appears
6. Select a variant
7. Click "Apply"
8. Verify replacement progress display
9. Verify dialog closes with success message

**Test Scenario 2:** Multiple tokens (multi-select)
1. Select 3 identical tokens
2. Trigger replacement workflow
3. Verify mode toggle UI (Sequential/Random)
4. Select multiple variants
5. Toggle mode to "Random"
6. Click "Apply"
7. Verify all 3 tokens updated

**Test Scenario 3:** No match + category search
1. Select token with no matches
2. Verify "No Match" UI appears
3. Enter category search term
4. Click "Search Category"
5. Verify search progress display
6. Verify results display
7. Select variant
8. Click "Apply"

**Test Scenario 4:** Error handling
1. Disable TVA module
2. Trigger replacement workflow
3. Verify error display
4. Verify dialog remains stable

### 7.3 Cross-Version Testing Matrix

| Test Case | Foundry v12 | Foundry v13 |
|-----------|-------------|-------------|
| Dialog creation | ✅ | ✅ |
| Content updates (10x rapid) | ✅ | ✅ |
| Match selection workflow | ✅ | ✅ |
| Category search workflow | ✅ | ✅ |
| Dialog dismissal (X button) | ✅ | ✅ |
| `rejectClose: false` behavior | ✅ | ✅ |
| CSS styling intact | ✅ | ✅ |
| Browser console errors | ❌ None | ❌ None |

---

## 8. Implementation Risks and Mitigations

### 8.1 Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Content update failures** | MEDIUM | HIGH | Error handling + fallback logging |
| **CSS incompatibility** | MEDIUM | LOW | Pre-testing + selector updates |
| **Element access errors** | LOW | MEDIUM | Null checks + error handling |
| **Close callback not firing** | LOW | LOW | Lifecycle override testing |
| **V12/V13 behavioral diff** | MEDIUM | MEDIUM | Explicit `rejectClose` setting |
| **Performance degradation** | LOW | LOW | Manual DOM updates are fast |

### 8.2 Rollback Plan

**If migration fails:**
1. Git revert to v2.9.x branch (V1 implementation)
2. Identify specific failure (CSS, content updates, lifecycle, etc.)
3. Fix in isolated branch
4. Re-test before re-merging

**Success Criteria for Migration:**
- ✅ All 15 manual test scenarios pass
- ✅ No browser console errors
- ✅ CSS styling intact
- ✅ Works on both v12 and v13
- ✅ No user-reported regressions

---

## 9. Open Questions and Decisions

### 9.1 Resizable Dialog Option

**Question:** Does DialogV2 support `resizable: true` option?

**V1 Code:**
```javascript
new Dialog({ ... }, { resizable: true });
```

**Investigation needed:**
- Check ApplicationConfiguration interface for `resizable` property
- Test in v12 and v13
- If not available, accept non-resizable dialog as limitation

**Decision:** If unsupported, **accept non-resizable** - not a critical feature

### 9.2 Height: 'auto' Option

**Question:** Does V2 support `height: 'auto'` in position config?

**V1 Code:**
```javascript
new Dialog({ ... }, { height: 'auto' });
```

**V2 Equivalent:**
```javascript
new DialogV2({ position: { height: 'auto' } });
```

**Investigation needed:**
- Test if 'auto' is valid value
- Alternative: Omit height property entirely
- Alternative: Set explicit max-height with overflow scrolling

**Decision:** Test during implementation, fallback to omitting if unsupported

### 9.3 Modal Behavior

**Question:** Should dialog be modal (block background interaction)?

**Current V1:** No explicit `modal` option (defaults to non-modal)

**V2 Options:**
- `modal: true` - Block interaction with canvas/sheets
- `modal: false` - Allow background interaction

**Decision:** Set `modal: false` to preserve current behavior

---

## 10. Architecture Summary

### 10.1 Key Design Decisions

✅ **Custom subclass approach** - Only viable solution for content updates
✅ **Maintain public API** - Zero breaking changes to consumer code
✅ **Lifecycle-based cleanup** - `_onAfterClose()` replaces V1 close callback
✅ **Explicit compatibility settings** - `rejectClose: false` for v12/v13
✅ **Error-tolerant design** - Preserve V1's resilience to transition states

### 10.2 Implementation Complexity

| Component | Complexity | Lines Changed | Risk |
|-----------|-----------|---------------|------|
| **UpdatableDialogV2 class** | 🟡 MEDIUM | ~100 new | 🟡 MEDIUM |
| **createMainDialog()** | 🟢 LOW | ~15 modified | 🟢 LOW |
| **updateDialogContent()** | 🟢 LOW | ~5 modified | 🟢 LOW |
| **getDialogElement()** | 🟢 LOW | ~1 modified | 🟢 LOW |
| **closeDialog()** | 🟢 LOW | ~5 modified | 🟢 LOW |
| **Event handlers** | 🟢 NONE | 0 | 🟢 NONE |
| **HTML generators** | 🟢 NONE | 0 | 🟢 NONE |

**Total Effort Estimate:** 6-12 hours (coding + testing)

### 10.3 Success Metrics

- ✅ 100% public API compatibility
- ✅ All 15 test scenarios pass
- ✅ Works on v12 and v13
- ✅ No performance degradation
- ✅ No browser console errors
- ✅ CSS styling intact
- ✅ Zero breaking changes to main.js

---

## 11. Next Steps

### 11.1 Pre-Implementation

- [x] Research DialogV2 API ✅ Complete
- [x] Analyze V1 usage patterns ✅ Complete
- [x] Identify migration challenges ✅ Complete
- [x] Design V2 architecture ✅ Complete
- [ ] Create step-by-step implementation plan
- [ ] Define comprehensive test plan
- [ ] Set up v12 and v13 test environments

### 11.2 Implementation Phase

1. Create `UpdatableDialogV2` class in `UIManager.js`
2. Refactor `createMainDialog()` method
3. Refactor `updateDialogContent()` method
4. Update `getDialogElement()` element access
5. Update `closeDialog()` to async
6. Test all dialog operations
7. Verify CSS compatibility
8. Run full workflow testing
9. Cross-version testing (v12 + v13)

### 11.3 Validation Phase

1. Execute all 15 manual test scenarios
2. Verify browser console (no errors)
3. CSS styling verification
4. Performance testing (content updates)
5. Error handling verification
6. User acceptance testing

---

## 12. References

### 12.1 Research Documents

- `dialogv2-research.md` - V2 API documentation and patterns
- `v1-usage-analysis.md` - Current V1 Dialog usage inventory
- `migration-challenges.md` - Migration challenges and solutions

### 12.2 Implementation Documents

- `migration-plan.md` - Step-by-step implementation guide (to be created)
- `test-plan.md` - Comprehensive testing strategy (to be created)

### 12.3 Official Documentation

- [DialogV2 API Documentation (v13)](https://foundryvtt.com/api/classes/foundry.applications.api.DialogV2.html)
- [DialogV2Configuration Interface](https://foundryvtt.com/api/interfaces/foundry.DialogV2Configuration.html)
- [ApplicationV2 Conversion Guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)

---

**Document Status:** ✅ Complete
**Ready for Implementation:** Pending migration plan creation
**Estimated Implementation Time:** 6-12 hours (coding) + 4-6 hours (testing)
**Migration Risk Level:** 🟡 MEDIUM (manageable with proper testing)
