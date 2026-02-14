# V1 Dialog Usage Analysis - UIManager.js

## Overview

The Token Replacer FA module currently uses Foundry VTT's deprecated V1 Dialog API exclusively through the `UIManager` class. This document provides a complete inventory of V1 Dialog usage patterns to guide migration to DialogV2.

## 1. Dialog Creation - `createMainDialog()`

**Location:** `scripts/ui/UIManager.js:837-853`

### Current Implementation

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

### Key Characteristics

- **Constructor:** Uses `new Dialog(data, options)` pattern
- **Data object:**
  - `title`: Localized string from i18n
  - `content`: HTML string (dynamic, changes frequently)
  - `buttons`: Empty object (no Foundry-managed buttons)
  - `close`: Callback function that runs cleanup
- **Options object:**
  - `classes`: Array with single custom CSS class
  - `width`: Fixed at 500px
  - `height`: Set to 'auto'
  - `resizable`: true
- **State management:** Stores instance in `this.mainDialog`
- **Return value:** Returns Dialog instance for immediate rendering

### Usage Pattern

Called once at workflow start, then content is dynamically updated throughout the replacement process. The dialog remains open for the entire workflow (scanning → searching → selection → progress).

## 2. Content Updates - `updateDialogContent()`

**Location:** `scripts/ui/UIManager.js:859-874`

### Current Implementation

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

### Key Characteristics

- **Dual update approach:**
  1. Updates `this.mainDialog.data.content` (dialog data model)
  2. Updates DOM directly via `contentEl.innerHTML` (rendered content)
- **DOM access:** Uses V1 pattern `this.mainDialog.element?.[0]` to get jQuery-wrapped element
- **Error handling:** Silent catch for transition states
- **Frequency:** Called multiple times per workflow:
  - During directory scanning (progress updates)
  - During parallel search (batch progress)
  - During category search (loading states)
  - On match/no-match display
  - During token replacement (results)

### Content Types Updated

1. **Scan progress:** `createScanProgressHTML()` - real-time directory scanning
2. **Parallel search:** `createParallelSearchHTML()` - batch search progress
3. **TVA cache loading:** `createTVACacheHTML()` - cache initialization
4. **Match selection:** `createMatchSelectionHTML()` - user choice UI
5. **No match browser:** `createNoMatchHTML()` - category search fallback
6. **Search progress:** `createSearchProgressHTML()` - category search progress
7. **Replacement progress:** `createProgressHTML()` - final results
8. **Errors:** `createErrorHTML()` - error states

## 3. Event Handler Setup

### 3.1 Match Selection Handlers - `setupMatchSelectionHandlers()`

**Location:** `scripts/ui/UIManager.js:483-599`

#### Pattern

```javascript
setupMatchSelectionHandlers(dialogElement) {
  return new Promise((resolve) => {
    const container = dialogElement.querySelector('.dialog-content');
    // ... setup event listeners ...
    // Resolve promise with user selection
  });
}
```

#### Event Types

1. **Search filter input** (lines 507-540)
   - Debounced input handler (150ms)
   - Filters visible match options
   - Updates visible count display
   - Auto-selects first visible option if none selected

2. **Mode toggle buttons** (lines 543-550)
   - Click handlers for "Sequential" / "Random" modes
   - Updates `assignmentMode` variable
   - Visual active state management

3. **Match option clicks** (lines 553-575)
   - Single click: Toggle selection (multi-select) or set selection (single-select)
   - Double click: Immediate resolve with selected path
   - Updates selection count display

4. **Action buttons** (lines 578-597)
   - "Apply" button: Resolves with selected paths and mode
   - "Skip" button: Resolves with null

#### Return Value

Promise that resolves with:
- `{ paths: string[], mode: 'sequential'|'random' }` on selection
- `null` on skip

### 3.2 No-Match Handlers - `setupNoMatchHandlers()`

**Location:** `scripts/ui/UIManager.js:610-829`

#### Pattern

```javascript
setupNoMatchHandlers(dialogElement, creatureInfo, localIndex, tokenCount, searchByCategory) {
  return new Promise((resolve) => {
    const container = dialogElement.querySelector('.dialog-content');
    // ... complex async search workflow ...
  });
}
```

#### Event Types

1. **Category search button** (lines 770-797)
   - Async click handler
   - Validates search term input
   - Displays loading state
   - Calls `searchByCategory()` with progress callback
   - Updates UI with results via `displayResults()`

2. **Category type input** (lines 800-807)
   - Enter key handler triggers search button click

3. **Dynamic result handlers** (setup in `displayResults()`, lines 680-767)
   - Mode buttons (if multi-select enabled)
   - Match option clicks (similar to match selection)
   - Category filter input (debounced, 150ms)

4. **Action buttons** (lines 810-827)
   - Same pattern as match selection handlers

#### Special Features

- **Dynamic HTML injection:** Results are injected after async search completes
- **Nested event setup:** `setupMatchOptions()` and `setupModeButtons()` called after results load
- **Progress callbacks:** Real-time search progress updates via `loadingEl.innerHTML`

### Event Handler Characteristics

- **All DOM-based:** Directly attach listeners to dialog DOM elements
- **Promise-based:** Both setup functions return Promises for async user interaction
- **Cleanup:** No explicit removeEventListener calls (rely on dialog destruction)
- **Debouncing:** Search inputs use 150ms debounce timers
- **State management:** Local variables (`assignmentMode`, `multiSelectEnabled`) track UI state

## 4. Dialog Lifecycle Management

### 4.1 Get Dialog Element - `getDialogElement()`

**Location:** `scripts/ui/UIManager.js:880-882`

```javascript
getDialogElement() {
  return this.mainDialog?.element?.[0] || null;
}
```

- Accesses V1's jQuery-wrapped element via `.element?.[0]`
- Returns native DOM element or null

### 4.2 Check Dialog State - `isDialogOpen()`

**Location:** `scripts/ui/UIManager.js:888-890`

```javascript
isDialogOpen() {
  return !!this.mainDialog;
}
```

- Simple existence check on stored instance

### 4.3 Close Dialog - `closeDialog()`

**Location:** `scripts/ui/UIManager.js:895-904`

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

- Calls V1's `.close()` method
- Error handling for already-closed state
- Manual cleanup of instance reference

### Lifecycle Flow

1. **Creation:** `createMainDialog()` → `new Dialog()` → store instance
2. **Usage:** Multiple `updateDialogContent()` calls + event handler setups
3. **Closure:** User action or `closeDialog()` → V1 `.close()` → close callback runs → instance nullified

## 5. V1-Specific Dependencies

### API Surface

1. **Constructor:** `new Dialog(data, options)`
2. **Properties:**
   - `dialog.data.content` - mutable content string
   - `dialog.element` - jQuery-wrapped DOM element (array-like)
3. **Methods:**
   - `dialog.close()` - programmatic close
4. **Callbacks:**
   - `close()` option - runs on dialog close

### DOM Structure Assumptions

```html
<div class="dialog token-replacer-fa-dialog">
  <div class="dialog-content">
    <!-- HTML content injected here -->
  </div>
</div>
```

- Relies on `.dialog-content` container existing
- V1 manages outer dialog structure
- Module only controls inner HTML

## 6. Migration Considerations

### Critical V1 Behaviors to Preserve

1. **Single persistent dialog:** One dialog instance stays open throughout workflow
2. **Dynamic content updates:** Content changes 8+ times during typical workflow
3. **Event handler continuity:** New handlers added after each content update
4. **Promise-based interaction:** UI waits for user selection via Promises
5. **Error resilience:** Silent failures during content updates (transition states)

### V2 Migration Challenges

1. **Element access:** V1's `.element?.[0]` pattern must change to V2's DOM access
2. **Content updates:** V1's direct `data.content` mutation + innerHTML pattern needs V2 equivalent
3. **Buttons:** V1 uses empty `buttons: {}` - module manages all buttons in content HTML
4. **Lifecycle callbacks:** V1's `close` callback must map to V2 event system
5. **jQuery dependency:** V1 wraps elements in jQuery; V2 may differ

### Event Handler Migration

- Current handlers are pure DOM (no V1 API dependencies)
- Event setup pattern (Promise-based) can remain unchanged
- Only dialog element access needs updating

## 7. Usage Statistics

### Method Call Frequency (Typical Workflow)

- `createMainDialog()`: 1x (at start)
- `updateDialogContent()`: 5-15x (depends on token count + searches)
- `setupMatchSelectionHandlers()`: 1x per token
- `setupNoMatchHandlers()`: 0-1x per token (only if no match)
- `getDialogElement()`: 2x per token (for event handler setup)
- `closeDialog()`: 1x (at end or user abort)

### Content Update Patterns

**Sequential workflow:**
1. TVA cache HTML → loading state
2. Parallel search HTML → progress updates (multiple)
3. Match selection HTML → per-token UI
4. Progress HTML → replacement results
5. Final progress HTML → completion summary

## 8. Key Findings Summary

1. **Minimal V1 API usage:** Only uses 4 V1 features (constructor, data.content, element, close)
2. **Content-heavy approach:** Empty buttons object, all UI in content HTML
3. **Frequent updates:** Content updated 10-20 times per typical session
4. **Pure DOM events:** Event handlers don't use V1 Dialog APIs
5. **Error tolerant:** Designed to handle dialog transition states
6. **Single dialog pattern:** One reusable dialog instance, not multiple ephemeral dialogs

## 9. Recommended Migration Approach

Based on this analysis:

1. **Preserve single dialog pattern:** Use DialogV2's content update mechanism
2. **Replace element access:** Map V1's `.element?.[0]` to V2's DOM access pattern
3. **Update content mutation:** Replace `.data.content` + innerHTML with V2's content update API
4. **Maintain event pattern:** Keep Promise-based event handler setup (no changes needed)
5. **Test error handling:** Ensure V2 handles rapid content updates gracefully

## 10. Files Affected

**Primary:**
- `scripts/ui/UIManager.js` - All dialog operations

**Callers (main.js):**
- `processTokenReplacement()` - Creates dialog, updates content, gets element for handlers
- Various workflow methods - Update content throughout process

**No changes needed:**
- HTML generation methods (lines 42-476) - Pure HTML strings
- Event handler logic (lines 483-829) - Pure DOM operations
