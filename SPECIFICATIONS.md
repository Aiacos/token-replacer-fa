# Token Replacer - Forgotten Adventures

## Specifications & Requirements Document

**Module ID:** `token-replacer-fa`
**Version:** 2.0.4
**Last Updated:** 2026-01-09

---

## 1. Overview

Token Replacer FA automatically replaces NPC token artwork in Foundry VTT with matching tokens from Forgotten Adventures and The Forge Bazaar using fuzzy search.

### 1.1 Purpose
- Automate the tedious process of finding and applying token art for NPCs
- Leverage existing token libraries (FA Nexus, TVA cache, The Forge)
- Provide intelligent matching based on creature type and subtype

---

## 2. Requirements

### 2.1 System Requirements

| Requirement | Value |
|-------------|-------|
| Foundry VTT | v12 minimum, v13 verified |
| Game System | D&D 5e (dnd5e) v3.0.0+ |

### 2.2 Module Dependencies

| Module | Type | Purpose |
|--------|------|---------|
| `token-variants` (TVA) | **Required** | Image search API and caching |
| `fa-nexus` | Optional | Forgotten Adventures token library |

### 2.3 External Dependencies

| Library | Source | Purpose |
|---------|--------|---------|
| Fuse.js v7.0.0 | CDN | Fuzzy search matching |

---

## 3. Features

### 3.1 Core Features

#### 3.1.1 Automatic Token Search
- [x] Search by actor name
- [x] Search by creature type (humanoid, beast, undead, etc.)
- [x] Search by creature subtype (elf, dwarf, monk, etc.)
- [x] Fuzzy matching with configurable threshold
- [x] Process only selected tokens (if any selected), otherwise all NPC tokens

#### 3.1.2 Search Sources
- [x] Token Variant Art (TVA) cache
- [x] Local directory scanning
- [x] The Forge hosting (`forge://` URIs)

#### 3.1.3 Creature Type Detection
- [x] Extract type from `actor.system.details.type`
- [x] Support string format (legacy)
- [x] Support object format `{ value, subtype, custom }`
- [x] Fallback to `creatureType` property

#### 3.1.4 AND Logic for Subtypes
- [x] Parse multiple subtypes: "Dwarf, Monk" → ["dwarf", "monk"]
- [x] Filter results requiring ALL terms present
- [x] Support delimiters: comma, semicolon, slash, ampersand

#### 3.1.5 Generic Subtype Detection
- [x] Recognize generic indicators: "any", "any race", "various", "mixed", "all"
- [x] Show all category results when subtype is generic
- [x] Treat empty/null subtype as generic

### 3.2 UI Features

#### 3.2.1 Main Dialog
- [x] Progress bar during scanning/searching
- [x] Real-time status updates
- [x] Results summary (replaced/failed/skipped)
- [x] Resizable dialog

#### 3.2.2 Match Selection
- [x] Grid view of matching tokens
- [x] Image preview with name and score
- [x] Multi-select for multiple tokens
- [x] Double-click to apply immediately

#### 3.2.3 Search Filter (AND Logic)
- [x] Text input for filtering results
- [x] Supports multiple terms with AND logic
- [x] Delimiters: space, comma, colon
- [x] Debounced input (150ms)

#### 3.2.4 No Match Handling
- [x] Search bar for creature type (with autocomplete)
- [x] Subtype search buttons
- [x] Progress bar during category search
- [x] Enter key to trigger search

#### 3.2.5 Multi-Token Assignment
- [x] Sequential mode: assign variants in order
- [x] Random mode: shuffle variants randomly
- [x] Selection count display

### 3.3 Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `fuzzyThreshold` | Number (0-1) | 0.1 | Fuse.js match threshold (lower = stricter) |
| `searchPriority` | Choice | both | faNexus / forgeBazaar / both |
| `autoReplace` | Boolean | false | Auto-apply best match |
| `confirmReplace` | Boolean | true | Show confirmation dialog |
| `fallbackFullSearch` | Boolean | false | Search all when no category match (**NOT IMPLEMENTED**) |
| `useTVACache` | Boolean | true | Use TVA's pre-built cache |
| `refreshTVACache` | Boolean | false | Refresh cache before search |
| `additionalPaths` | String | "" | Extra directories to scan |

---

## 4. Technical Specifications

### 4.1 Architecture

```
scripts/
├── core/
│   ├── Constants.js    # Module ID, creature mappings, defaults
│   └── Utils.js        # Helper functions, path extraction
├── services/
│   ├── TokenService.js    # Token extraction and grouping
│   ├── SearchService.js   # TVA and local search
│   └── ScanService.js     # Directory scanning
├── ui/
│   └── UIManager.js    # Dialog and HTML generation
└── main.js             # Entry point, hooks, settings
```

### 4.2 TVA API Integration

#### 4.2.1 Search Call
```javascript
tvaAPI.doImageSearch(searchTerm, {
  searchType: 'Portrait',
  simpleResults: false
});
```

#### 4.2.2 Result Formats Supported
- Direct array of results
- Map with key-value pairs
- Object with nested properties
- Tuple format `[path, config]`

#### 4.2.3 Path Properties
Extraction checks these properties in order:
- `path`, `route`, `img`, `src`, `image`, `url`, `thumb`, `thumbnail`, `uri`
- Nested `.data` property
- Recursive nested object checking

#### 4.2.4 URI Schemes Supported
- `http://`, `https://`
- `forge://` (The Forge hosting)
- Relative paths with `/` or `.`

### 4.3 Creature Type Mappings

14 creature categories supported:
1. **humanoid** - 72 terms (human, elf, dwarf, classes, NPCs...)
2. **beast** - 80+ terms (wolf, bear, snake, spider...)
3. **undead** - 35+ terms (skeleton, zombie, vampire...)
4. **fiend** - 45+ terms (demon, devil, imp...)
5. **dragon** - 25+ terms (dragon, drake, wyvern...)
6. **elemental** - 25+ terms (elemental, mephit, genie...)
7. **fey** - 20+ terms (fairy, pixie, hag...)
8. **celestial** - 12+ terms (angel, deva, unicorn...)
9. **construct** - 20+ terms (golem, animated, modron...)
10. **aberration** - 25+ terms (beholder, mind flayer...)
11. **monstrosity** - 40+ terms (owlbear, griffon, medusa...)
12. **giant** - 17+ terms (giant, ogre, troll...)
13. **plant** - 18+ terms (treant, myconid, blight...)
14. **ooze** - 11 terms (ooze, slime, jelly...)

### 4.4 Performance Optimizations

- [x] O(1) duplicate checking with Set
- [x] Parallel search (MAX_CONCURRENT = 4)
- [x] Token grouping by creature type
- [x] Search result caching
- [x] Debounced filter input
- [x] Yield to main thread every 3 searches

### 4.5 Foundry VTT Compatibility

#### v12 Support
- `onClick` handler for scene controls
- V1 Dialog API

#### v13 Support
- `onChange` handler for scene controls
- Array and object format for controls

#### Known Deprecations
- V1 Application framework (Dialog) - deadline v16
- Requires migration to ApplicationV2 for v16+

---

## 5. Test Cases

### 5.1 Basic Functionality

| Test | Steps | Expected Result |
|------|-------|-----------------|
| TC-001 | Click token replacer button with NPC tokens on scene | Dialog opens, search begins |
| TC-002 | Search for "humanoid" creature type | Returns 600+ results from TVA |
| TC-003 | Search for specific actor name | Returns matching tokens |
| TC-004 | No matches found | Shows category browser UI |
| TC-005 | Select 2 NPC tokens, click button | Only selected tokens processed |
| TC-006 | No tokens selected, click button | All NPC tokens processed |

### 5.2 Creature Type Detection

| Test | Actor Type Data | Expected |
|------|-----------------|----------|
| TC-101 | `{ value: "humanoid", subtype: "elf" }` | Type: humanoid, Subtype: elf |
| TC-102 | `"humanoid"` (string) | Type: humanoid |
| TC-103 | `{ value: "humanoid", subtype: "any race" }` | Generic subtype (show all) |
| TC-104 | `{ value: "humanoid", subtype: "" }` | Generic subtype (show all) |

### 5.3 AND Logic

| Test | Input | Expected |
|------|-------|----------|
| TC-201 | Subtype: "Dwarf, Monk" | Filter for BOTH dwarf AND monk |
| TC-202 | Filter: "female warrior" | Show only results with both terms |
| TC-203 | Filter: "elf:archer" | Show only results with both terms |

### 5.4 TVA Integration

| Test | Condition | Expected |
|------|-----------|----------|
| TC-301 | TVA available | Use TVA cache for search |
| TC-302 | TVA returns Map | Parse correctly |
| TC-303 | TVA returns array | Parse correctly |
| TC-304 | Result has `.data.path` | Extract path correctly |
| TC-305 | Result has `route` property | Extract path correctly |
| TC-306 | Path starts with `forge://` | Accept as valid |

### 5.5 Multi-Token

| Test | Steps | Expected |
|------|-------|----------|
| TC-401 | 3 identical NPCs, select 2 variants | Variants assigned to tokens |
| TC-402 | Sequential mode | Tokens get variants in order |
| TC-403 | Random mode | Tokens get variants randomly |

### 5.6 UI

| Test | Steps | Expected |
|------|-------|----------|
| TC-501 | Type in search bar, press Enter | Search triggers |
| TC-502 | Type "humanoid" | Autocomplete shows suggestion |
| TC-503 | Double-click match | Applies immediately |
| TC-504 | Click Skip | Token skipped, moves to next |

---

## 6. Error Handling

### 6.1 Graceful Degradation

| Condition | Behavior |
|-----------|----------|
| TVA not installed | Show error, suggest installation |
| TVA search fails | Log warning, return empty array |
| No tokens on scene | Show info notification |
| Fuse.js load fails | Try window.Fuse fallback |
| Image load fails | Show mystery-man.svg placeholder |

### 6.2 Logging

| Level | Usage |
|-------|-------|
| `console.log` | Progress updates, initialization |
| `console.warn` | Non-fatal errors, missing data |
| `console.error` | Fatal errors, load failures |

---

## 7. Localization

### 7.1 Supported Languages
- English (en)
- Italian (it)

### 7.2 Localization Keys
All UI strings use `TOKEN_REPLACER_FA.*` namespace.

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.4 | 2026-01-09 | TVA compatibility fixes (route, uri, forge://, .data) |
| 2.0.3 | 2026-01-09 | Critical fixes (TVA params, onChange, search bar) |
| 2.0.2 | 2026-01-09 | Code review, O(1) optimizations |
| 2.0.1 | 2026-01-09 | Creature type extraction fix |
| 2.0.0 | 2026-01-09 | OOP refactoring, modular architecture |
| 1.4.x | 2026-01-09 | AND logic, progress bar, search filter |

---

## 9. Known Issues

| Issue | Status | Workaround |
|-------|--------|------------|
| Dialog V1 deprecation warning | Deferred | Functional until v16 |
| Large result sets slow UI | Open | Virtualization planned |
| `fallbackFullSearch` setting not implemented | Open | Use category browser manually |

---

## 10. Future Improvements

- [ ] Migrate to ApplicationV2/DialogV2
- [ ] Virtual scrolling for large result sets
- [ ] Implement `fallbackFullSearch` setting
- [ ] Batch apply to all tokens
- [ ] Custom token scaling options
- [ ] Token ring/border support
- [ ] Wildcard search support
