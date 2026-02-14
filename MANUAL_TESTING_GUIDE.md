# Manual Testing Guide - Skeleton Loaders

## Overview
This guide provides step-by-step instructions to manually test the skeleton loader feature implementation in Foundry VTT.

## What Was Implemented

### CSS Animations (styles/styles.css)
- `.skeleton-loader` - Base wrapper class with gradient background
- `@keyframes skeleton-shimmer` - Animated shimmer effect
- `@keyframes skeleton-pulse` - Subtle pulse animation on the ::after pseudo-element
- `.skeleton-52` - 52px × 52px size variant (token preview images)
- `.skeleton-72` - 72px × 72px size variant (match grid images)
- `.loaded` state - Hides skeleton and reveals image when loaded

### Template Updates
1. **match-selection.hbs** (lines 2-4, 40-42)
   - Token preview image: wrapped in `skeleton-loader skeleton-52`
   - Match grid images: wrapped in `skeleton-loader skeleton-72`

2. **no-match.hbs** (lines 2-4)
   - Token preview image: wrapped in `skeleton-loader skeleton-52`

3. **UIManager.js** (displayResults method, lines 625-641)
   - Dynamic category search results: wrapped in `skeleton-loader skeleton-72`

## Testing Prerequisites

1. **Foundry VTT Setup:**
   - Foundry VTT v12 or v13 installed
   - D&D 5e system enabled
   - Token Variant Art (TVA) module installed and active
   - Token Replacer FA module installed and active

2. **Test Environment:**
   - Modern browser (Chrome, Firefox, or Edge)
   - Browser DevTools available
   - Test scene with NPC tokens

## Test Procedures

### Test 1: Match Selection Dialog - Skeleton Loaders

**Purpose:** Verify skeleton loaders appear on both preview and match grid images

**Steps:**
1. Open Foundry VTT and load a D&D 5e world
2. Open a scene with NPC tokens
3. Open browser DevTools (F12)
4. Go to Network tab and enable throttling to "Slow 3G" or "Fast 3G"
5. Select one or more NPC tokens on the canvas
6. Click the Token Replacer FA scene control button
7. Wait for the match selection dialog to appear

**Expected Results:**
- ✅ Token preview image (top left, 52×52px) shows shimmer animation while loading
- ✅ Match grid images (bottom grid, 72×72px each) show shimmer animation while loading
- ✅ Shimmer effect is smooth and visible (gradient moving left to right)
- ✅ Subtle pulse effect visible on skeleton placeholders
- ✅ Images fade in smoothly when loaded (opacity transition)
- ✅ Skeleton disappears completely when image loads
- ✅ No layout shift or visual jump when skeleton transitions to image
- ✅ Dark theme colors match (#1a1a1a background, #252525-#333333 gradient)

**Checkpoint:**
- Open DevTools Console
- Verify no errors or warnings
- Check Network tab - images should load successfully

### Test 2: No-Match Dialog - Skeleton Loader

**Purpose:** Verify skeleton loader on token preview when no matches found

**Steps:**
1. Keep network throttling enabled ("Slow 3G")
2. Select an NPC token that likely has no matches (obscure creature type)
3. Click Token Replacer FA button
4. Observe the no-match dialog

**Expected Results:**
- ✅ Token preview image (52×52px) shows shimmer animation while loading
- ✅ Shimmer effect is smooth and matches the dark theme
- ✅ Image fades in smoothly when loaded
- ✅ Skeleton disappears when image loads

### Test 3: Category Search Results - Dynamic HTML

**Purpose:** Verify skeleton loaders on dynamically generated category search results

**Steps:**
1. Keep network throttling enabled
2. From a no-match dialog, enter a category type (e.g., "Humanoid" or "Dragon")
3. Click "Search Category" button
4. Observe the category results grid as it loads

**Expected Results:**
- ✅ Each result image (72×72px) shows shimmer animation while loading
- ✅ Multiple skeletons animate independently (some may finish before others)
- ✅ Shimmer effect visible on all images before they load
- ✅ Images fade in smoothly as they complete loading
- ✅ All skeletons disappear when respective images load

### Test 4: Image Load Fallback

**Purpose:** Verify fallback behavior when images fail to load

**Steps:**
1. Open browser DevTools
2. Go to Network tab
3. Right-click on an image request and select "Block request URL" (or use ad blocker)
4. Refresh and trigger token replacement dialog
5. Observe behavior when some images fail

**Expected Results:**
- ✅ Skeleton loader appears initially
- ✅ On image error, fallback icon (mystery-man.svg) appears
- ✅ No console errors or broken image icons
- ✅ Layout remains intact

### Test 5: Performance Check

**Purpose:** Verify animations are smooth and don't impact performance

**Steps:**
1. Disable network throttling
2. Open a match selection dialog with many results (10+ tokens)
3. Observe animation performance

**Expected Results:**
- ✅ Shimmer animation is smooth (no stuttering or lag)
- ✅ Pulse animation is smooth
- ✅ Multiple skeleton loaders don't cause performance issues
- ✅ Dialog remains responsive during loading
- ✅ CPU usage in DevTools Performance tab is reasonable

### Test 6: Visual Consistency

**Purpose:** Verify skeleton loaders match the module's dark theme

**Steps:**
1. Open any dialog with skeleton loaders
2. Inspect visual appearance

**Expected Results:**
- ✅ Background color matches dialog background (#1a1a1a)
- ✅ Gradient colors blend with dark theme (#252525 → #333333)
- ✅ Border radius matches existing image styles (4-6px)
- ✅ Size matches exactly (52px or 72px, no overflow/underflow)
- ✅ Positioning is pixel-perfect (no gaps or overlaps)

### Test 7: Multi-Select Mode

**Purpose:** Verify skeleton loaders work in multi-select mode

**Steps:**
1. Select multiple NPC tokens of the same type
2. Open Token Replacer FA dialog
3. Observe match selection with multi-select UI

**Expected Results:**
- ✅ All skeleton loaders work correctly
- ✅ Selection checkmarks appear properly over loaded images
- ✅ No visual conflicts between skeleton and selection UI

## Test Checklist

Complete this checklist during testing:

- [ ] Match selection dialog - token preview skeleton (52px)
- [ ] Match selection dialog - match grid skeletons (72px)
- [ ] No-match dialog - token preview skeleton (52px)
- [ ] Category search results - dynamic skeletons (72px)
- [ ] Shimmer animation is smooth and visible
- [ ] Pulse animation is subtle and smooth
- [ ] Images fade in smoothly when loaded
- [ ] Skeletons disappear completely after load
- [ ] Fallback icons work when images fail
- [ ] No layout shifts or visual jumps
- [ ] No console errors
- [ ] Dark theme colors are consistent
- [ ] Performance is acceptable with many images
- [ ] Multi-select mode works correctly

## Troubleshooting

### Issue: Skeleton loaders not visible
- **Check:** Network throttling is enabled (otherwise images load too fast)
- **Check:** CSS file is loaded correctly
- **Check:** Browser cache is cleared

### Issue: Skeleton doesn't disappear
- **Check:** `onload` handler is present on img tags
- **Check:** `.loaded` class is being added (inspect element in DevTools)
- **Check:** CSS transitions are not disabled

### Issue: Layout shifts when image loads
- **Check:** Skeleton loader has exact same dimensions as image
- **Check:** `.skeleton-52` is 52×52px, `.skeleton-72` is 72×72px
- **Check:** No padding or margin differences

### Issue: Console errors
- **Check:** Image paths are valid
- **Check:** No JavaScript syntax errors
- **Check:** All template files are properly formatted

## Acceptance Criteria

All of the following must be true to pass testing:

✅ Skeleton loaders appear on all token images before loading
✅ Skeleton loaders disappear smoothly when images load
✅ No visual layout shifts during image loading
✅ Fallback icons still work when images fail to load
✅ No console errors in Foundry VTT
✅ Skeleton animation is smooth and matches dark theme

## Reporting Results

After completing all tests, document results in `build-progress.txt`:

```
=== MANUAL TESTING RESULTS (Session X) ===

Test 1 (Match Selection): [PASS/FAIL] - Notes: ...
Test 2 (No-Match Dialog): [PASS/FAIL] - Notes: ...
Test 3 (Category Search): [PASS/FAIL] - Notes: ...
Test 4 (Fallback): [PASS/FAIL] - Notes: ...
Test 5 (Performance): [PASS/FAIL] - Notes: ...
Test 6 (Visual Consistency): [PASS/FAIL] - Notes: ...
Test 7 (Multi-Select): [PASS/FAIL] - Notes: ...

Overall: [PASS/FAIL]
Issues Found: [None/List issues]
```

## Next Steps

If all tests pass:
1. Mark subtask-1-5 as completed in implementation_plan.json
2. Update QA signoff status
3. Prepare for release

If tests fail:
1. Document specific failures in build-progress.txt
2. Create bug fix subtasks if needed
3. Re-test after fixes
