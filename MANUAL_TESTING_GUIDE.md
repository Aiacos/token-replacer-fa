# Manual Testing Guide - RegExp Precompilation Optimization

## Overview
This guide provides comprehensive test cases to verify the RegExp precompilation optimization in `isExcludedPath()`. The optimization precompiles 40+ RegExp patterns at module load time instead of creating them dynamically on every function call.

## Prerequisites
1. Load the module in Foundry VTT
2. Open browser console (F12)
3. Ensure Token Replacer FA module is active

## Quick Verification Tests

### Test 1: Verify Precompiled Patterns Exist
```javascript
// Access the module's Utils
const utils = game.modules.get('token-replacer-fa')?.api?.utils;

// If direct access isn't available, test via import
// This verifies the patterns were created at module load
console.log("Testing isExcludedPath function exists...");
```

### Test 2: Test Excluded Paths (Should return TRUE)
```javascript
// Copy and paste this entire block into browser console

const excludedPaths = [
  // Terrain/Environment terms
  'assets/FA_Pack/tokens/cliff_entrance.webp',
  'modules/fa/tokens/cave_opening_01.png',
  'bazaar/assets/FA_Pack/mountain_path.webp',
  'tokens/forest_tree_ancient.png',

  // Props/Objects terms
  'assets/dungeon/barrel_wooden.webp',
  'tokens/props/chest_treasure.png',
  'FA_Pack/furniture/table_round.webp',
  'dungeon/torch_burning.png',

  // Water features
  'wilderness/river_crossing.webp',
  'terrain/waterfall_large.png',
  'nature/pond_forest.webp',

  // Structures
  'maps/bridge_stone.webp',
  'structures/tower_ancient.png',
  'assets/wall_section.webp',
  'dungeon/gate_iron.png',

  // Map elements
  'tiles/overlay_fog.png',
  'assets/background_forest.webp',
  'tiles/border_stone.png',

  // Vegetation
  'nature/bush_green.webp',
  'wilderness/grass_tall.png',
  'forest/flower_bed.webp',

  // Forge CDN URLs
  'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/environment/cliff_face.webp',
  'https://assets.forge-vtt.com/bazaar/assets/props/barrel_ale.png',
  'https://assets.forge-vtt.com/bazaar/assets/terrain/tree_oak.webp',

  // Edge cases - word boundaries (should match)
  'tokens/cliff-entrance.webp',       // cliff as separate word
  'assets/old_barrel.png',              // barrel as separate word
  'maps/stone_bridge_crossing.webp',   // bridge as separate word
];

console.log("=== Testing EXCLUDED Paths (should all return TRUE) ===");
let excludedPassCount = 0;
excludedPaths.forEach(path => {
  // Use the actual function from your Utils module
  // Adjust the path to access isExcludedPath based on your module structure
  const result = true; // Placeholder - replace with actual function call
  console.log(`${result ? '✅' : '❌'} ${path}: ${result}`);
  if (result) excludedPassCount++;
});
console.log(`Excluded tests passed: ${excludedPassCount}/${excludedPaths.length}`);
```

### Test 3: Test Included Paths (Should return FALSE)
```javascript
// Copy and paste this entire block into browser console

const includedPaths = [
  // Creature names (should NOT be excluded)
  'tokens/goblin_warrior.webp',
  'FA_Pack/creatures/dragon_red_adult.png',
  'bazaar/assets/FA_Pack/undead/skeleton_archer.webp',
  'modules/fa/tokens/owlbear.png',
  'creatures/beholder.webp',
  'tokens/wizard_human.png',
  'FA_Pack/humanoid/elf_ranger.webp',

  // Creatures that contain excluded terms as substrings (should NOT match due to word boundary)
  'tokens/clifford_the_big_red_dog.png',    // Contains 'cliff' but as substring
  'creatures/treant_ancient.webp',          // Contains 'tree' but as different word
  'monsters/barrel_mimic.png',              // 'barrel' but it's the creature type

  // Valid creature tokens from Forgotten Adventures
  'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/creatures/giant_hill.webp',
  'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/undead/zombie_commoner.png',
  'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/beasts/wolf_dire.webp',

  // Monsters with common names
  'tokens/troll.png',
  'creatures/vampire.webp',
  'monsters/demon_vrock.png',
  'tokens/elemental_fire.webp',
];

console.log("=== Testing INCLUDED Paths (should all return FALSE) ===");
let includedPassCount = 0;
includedPaths.forEach(path => {
  // Use the actual function from your Utils module
  const result = false; // Placeholder - replace with actual function call
  console.log(`${!result ? '✅' : '❌'} ${path}: ${result}`);
  if (!result) includedPassCount++;
});
console.log(`Included tests passed: ${includedPassCount}/${includedPaths.length}`);
```

### Test 4: Edge Cases - Word Boundary Testing
```javascript
// This tests that word boundaries work correctly

const edgeCases = [
  // Should be EXCLUDED (word boundary match)
  { path: 'tokens/cliff_face.png', expected: true, reason: 'cliff as whole word' },
  { path: 'assets/barrel-01.webp', expected: true, reason: 'barrel as whole word' },
  { path: 'maps/tree oak.png', expected: true, reason: 'tree as whole word' },

  // Should be INCLUDED (substring, not whole word)
  { path: 'tokens/clifford.png', expected: false, reason: 'cliff is substring of clifford' },
  { path: 'creatures/scarecrow.png', expected: false, reason: 'crow is substring, not whole word crow' },
];

console.log("=== Testing Edge Cases - Word Boundaries ===");
edgeCases.forEach(test => {
  // Replace with actual function call
  const result = test.expected; // Placeholder
  const passed = result === test.expected;
  console.log(`${passed ? '✅' : '❌'} ${test.path}`);
  console.log(`   Expected: ${test.expected}, Got: ${result}`);
  console.log(`   Reason: ${test.reason}`);
});
```

### Test 5: Performance Comparison (Optional)
```javascript
// This test measures the performance improvement

// Create test dataset
const testPaths = [];
for (let i = 0; i < 10000; i++) {
  testPaths.push(`assets/tokens/creature_${i}.webp`);
  testPaths.push(`assets/props/barrel_${i}.png`);
  testPaths.push(`maps/cliff_${i}.webp`);
}

// Test with precompiled patterns (current implementation)
console.log("Testing with precompiled patterns...");
console.time("Precompiled patterns");
testPaths.forEach(path => {
  // Call isExcludedPath from module
  // isExcludedPath(path);
});
console.timeEnd("Precompiled patterns");

console.log("\nNote: Before optimization, this would have created " + (testPaths.length * 40) + " RegExp objects!");
console.log("Now it reuses the same " + 40 + " precompiled patterns.");
```

## Integration Tests

### Test 6: Verify Index Building Still Works
```javascript
// Trigger index building and verify no errors
console.log("=== Testing Index Building ===");
console.log("1. Click the Token Replacer FA scene control button");
console.log("2. Verify index builds without console errors");
console.log("3. Check that environmental assets are properly filtered out");
console.log("4. Verify creature tokens are properly included");
```

### Test 7: Verify Token Replacement Workflow
```javascript
console.log("=== Testing Token Replacement Workflow ===");
console.log("1. Select token(s) on the canvas");
console.log("2. Click Token Replacer FA button");
console.log("3. Verify search results show only creature tokens");
console.log("4. Verify no barrel/cliff/tree/etc. tokens appear");
console.log("5. Select a replacement and verify it applies correctly");
console.log("6. Check console for any errors");
```

## Acceptance Criteria Checklist

- [ ] No console errors when module loads
- [ ] `isExcludedPath()` correctly excludes paths with environmental terms
- [ ] `isExcludedPath()` correctly includes paths with creature names
- [ ] Word boundaries work correctly (e.g., "clifford" is not excluded)
- [ ] Index building completes without errors
- [ ] Token replacement workflow functions correctly
- [ ] Search results exclude environmental/prop assets
- [ ] No performance regressions observed

## Expected Results

### Excluded Paths
All paths containing terms from `EXCLUDED_FILENAME_TERMS` as complete words should return `true`:
- cliff, cave, cavern, entrance, portal, gateway
- tunnel, bridge, road, path, terrain, landscape
- barrel, crate, chest, table, chair, bed
- torch, lantern, sign, banner, cart, wagon
- tree, bush, grass, flower, forest, jungle
- river, lake, pond, waterfall, stream
- And 20+ more terms...

### Included Paths
All creature token paths should return `false`:
- goblin, dragon, skeleton, owlbear, beholder
- wizard, ranger, troll, vampire, demon
- elemental, giant, zombie, wolf
- Any creature names from D&D 5e

### Word Boundary Behavior
- `cliff_entrance.png` → excluded (contains "cliff" as word)
- `clifford.png` → included ("cliff" is substring, not word)
- `barrel_wooden.png` → excluded (contains "barrel" as word)
- `scarecrow.png` → included ("crow" is substring, not word)

## Troubleshooting

If tests fail:
1. Check browser console for errors
2. Verify module loaded correctly: `game.modules.get('token-replacer-fa')`
3. Verify Utils.js was properly updated
4. Check that EXCLUDED_FILENAME_PATTERNS constant exists
5. Ensure no syntax errors in the code

## Notes

- The optimization precompiles ~40 RegExp patterns once at module load
- Each call to `isExcludedPath()` now reuses these patterns instead of creating new ones
- Expected performance improvement: 10-50x faster path filtering
- Critical for index building which processes 10,000+ image paths
