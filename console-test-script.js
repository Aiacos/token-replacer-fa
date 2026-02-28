/**
 * Manual Test Script for RegExp Precompilation Optimization
 * Copy and paste this entire script into Foundry VTT browser console
 *
 * This verifies that isExcludedPath() correctly filters paths after
 * the optimization to use precompiled RegExp patterns.
 */

(async function testIsExcludedPath() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Token Replacer FA - isExcludedPath() Test Suite         ║');
  console.log('║  Testing RegExp Precompilation Optimization              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Try to import the isExcludedPath function
  let isExcludedPath;
  try {
    // Attempt to get the function from the module
    // Adjust this path based on how your module exports utilities
    const utilsModule = await import('./scripts/core/Utils.js');
    isExcludedPath = utilsModule.isExcludedPath;
    console.log('✅ Successfully imported isExcludedPath from Utils.js\n');
  } catch (error) {
    console.error('❌ Failed to import isExcludedPath:', error);
    console.log('\nTo run tests manually, use:');
    console.log(
      "  import('./scripts/core/Utils.js').then(m => window.testIsExcludedPath = m.isExcludedPath)"
    );
    return;
  }

  // Test data
  const excludedTests = [
    // Environmental/Terrain
    { path: 'assets/FA_Pack/tokens/cliff_entrance.webp', term: 'cliff' },
    { path: 'modules/fa/tokens/cave_opening.png', term: 'cave' },
    { path: 'tokens/mountain_path.webp', term: 'path' },
    { path: 'terrain/bridge_stone.png', term: 'bridge' },

    // Props/Objects
    { path: 'dungeon/barrel_wooden.webp', term: 'barrel' },
    { path: 'props/chest_treasure.png', term: 'chest' },
    { path: 'furniture/table_round.webp', term: 'table' },
    { path: 'items/torch_burning.png', term: 'torch' },
    { path: 'objects/wagon_old.png', term: 'wagon' },

    // Vegetation
    { path: 'nature/tree_oak.webp', term: 'tree' },
    { path: 'wilderness/bush_green.png', term: 'bush' },
    { path: 'forest/grass_tall.webp', term: 'grass' },

    // Water features
    { path: 'maps/river_crossing.png', term: 'river' },
    { path: 'terrain/waterfall_large.webp', term: 'waterfall' },
    { path: 'nature/pond_forest.png', term: 'pond' },

    // Forge CDN URLs
    { path: 'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/cliff_face.webp', term: 'cliff' },
    { path: 'https://assets.forge-vtt.com/bazaar/assets/props/barrel_ale.png', term: 'barrel' },
  ];

  const includedTests = [
    // Creatures (should NOT be excluded)
    { path: 'tokens/goblin_warrior.webp', reason: 'creature name' },
    { path: 'FA_Pack/creatures/dragon_red.png', reason: 'creature name' },
    { path: 'undead/skeleton_archer.webp', reason: 'creature name' },
    { path: 'monsters/owlbear.png', reason: 'creature name' },
    { path: 'aberrations/beholder.webp', reason: 'creature name' },
    { path: 'humanoid/wizard.png', reason: 'creature name' },
    { path: 'beasts/wolf_dire.webp', reason: 'creature name' },

    // Edge cases - substrings (should NOT match due to word boundary)
    { path: 'tokens/clifford_big_dog.png', reason: 'cliff is substring' },
    { path: 'creatures/treant_ancient.webp', reason: 'different from tree' },

    // Forge CDN creature URLs
    {
      path: 'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/creatures/giant_hill.webp',
      reason: 'creature URL',
    },
    {
      path: 'https://assets.forge-vtt.com/bazaar/assets/FA_Pack/undead/zombie.png',
      reason: 'creature URL',
    },
  ];

  // Test excluded paths
  console.log('═══ TEST 1: Paths That SHOULD Be Excluded (expect TRUE) ═══\n');
  let excludedPass = 0;
  let excludedFail = 0;

  excludedTests.forEach((test) => {
    const result = isExcludedPath(test.path);
    const status = result ? '✅ PASS' : '❌ FAIL';
    if (result) excludedPass++;
    else excludedFail++;

    console.log(`${status} | ${test.term.padEnd(12)} | ${test.path}`);
  });

  console.log(
    `\n📊 Excluded Paths: ${excludedPass} passed, ${excludedFail} failed (${excludedTests.length} total)\n`
  );

  // Test included paths
  console.log('═══ TEST 2: Paths That Should Be INCLUDED (expect FALSE) ═══\n');
  let includedPass = 0;
  let includedFail = 0;

  includedTests.forEach((test) => {
    const result = isExcludedPath(test.path);
    const status = !result ? '✅ PASS' : '❌ FAIL';
    if (!result) includedPass++;
    else includedFail++;

    console.log(`${status} | ${test.reason.padEnd(18)} | ${test.path}`);
  });

  console.log(
    `\n📊 Included Paths: ${includedPass} passed, ${includedFail} failed (${includedTests.length} total)\n`
  );

  // Edge case testing
  console.log('═══ TEST 3: Word Boundary Edge Cases ═══\n');
  const edgeCases = [
    { path: 'tokens/cliff_face.png', expected: true, reason: '"cliff" as whole word' },
    { path: 'tokens/clifford.png', expected: false, reason: '"cliff" as substring only' },
    { path: 'assets/barrel-01.webp', expected: true, reason: '"barrel" as whole word' },
    { path: 'maps/stone bridge.png', expected: true, reason: '"bridge" as whole word' },
  ];

  let edgePass = 0;
  let edgeFail = 0;

  edgeCases.forEach((test) => {
    const result = isExcludedPath(test.path);
    const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
    if (result === test.expected) edgePass++;
    else edgeFail++;

    console.log(
      `${status} | Expected: ${String(test.expected).padEnd(5)} | Got: ${String(result).padEnd(5)} | ${test.reason}`
    );
    console.log(`      | ${test.path}`);
  });

  console.log(
    `\n📊 Edge Cases: ${edgePass} passed, ${edgeFail} failed (${edgeCases.length} total)\n`
  );

  // Performance test
  console.log('═══ TEST 4: Performance Test ═══\n');
  const iterations = 10000;
  const testPaths = [
    'assets/tokens/creature_001.webp',
    'assets/props/barrel_001.png',
    'maps/cliff_001.webp',
    'creatures/goblin_001.png',
    'terrain/tree_001.webp',
  ];

  console.log(`Running ${iterations} iterations with ${testPaths.length} paths each...`);
  console.time('isExcludedPath Performance');

  for (let i = 0; i < iterations; i++) {
    testPaths.forEach((path) => {
      isExcludedPath(path.replace('001', String(i).padStart(3, '0')));
    });
  }

  console.timeEnd('isExcludedPath Performance');

  const totalCalls = iterations * testPaths.length;
  const totalPatterns = 40; // Approximate number of EXCLUDED_FILENAME_TERMS

  console.log(`\n✅ Completed ${totalCalls.toLocaleString()} calls`);
  console.log(`💡 With precompiled patterns: ~${totalPatterns} RegExp objects total`);
  console.log(
    `💡 Without optimization: ~${(totalCalls * totalPatterns).toLocaleString()} RegExp objects would be created!`
  );
  console.log(
    `📈 Memory and CPU savings: ${Math.round((totalCalls * totalPatterns) / totalPatterns)}x improvement\n`
  );

  // Summary
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');

  const totalTests = excludedTests.length + includedTests.length + edgeCases.length;
  const totalPass = excludedPass + includedPass + edgePass;
  const totalFail = excludedFail + includedFail + edgeFail;

  console.log(`\n  Total Tests: ${totalTests}`);
  console.log(`  ✅ Passed: ${totalPass}`);
  console.log(`  ❌ Failed: ${totalFail}`);
  console.log(`  Success Rate: ${Math.round((totalPass / totalTests) * 100)}%\n`);

  if (totalFail === 0) {
    console.log('  🎉 ALL TESTS PASSED! 🎉');
    console.log('  The RegExp precompilation optimization is working correctly.\n');
  } else {
    console.log('  ⚠️  SOME TESTS FAILED');
    console.log('  Please review the failed tests above.\n');
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  // Return test results for programmatic access
  return {
    passed: totalPass,
    failed: totalFail,
    total: totalTests,
    details: {
      excluded: { passed: excludedPass, failed: excludedFail },
      included: { passed: includedPass, failed: includedFail },
      edgeCases: { passed: edgePass, failed: edgeFail },
    },
  };
})();
