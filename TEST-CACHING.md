# ForgeBazaarService Caching Test

This document describes how to manually test the caching implementation in ForgeBazaarService.

## Prerequisites
- Load the module in Foundry VTT
- Open the browser console (F12)

## Test 1: Category Cache

Test that category browse results are cached:

```javascript
// Get the service instance (will be available after module init)
const service = game.modules.get('token-replacer-fa')?.forgeBazaarService;

// First call - should trigger warning and cache empty result
await service.browseCategory('undead');
// Expected output: "ForgeBazaarService.browseCategory: Service not available"
// Expected output: "ForgeBazaarService.browseCategory('undead'): Not implemented - no public API"

// Second call - should use cache (FAST PATH)
await service.browseCategory('undead');
// Expected output: "ForgeBazaarService.browseCategory('undead'): Using cache (0 results)"
```

## Test 2: Search Cache

Test that search results are cached:

```javascript
const service = game.modules.get('token-replacer-fa')?.forgeBazaarService;

// First call - should trigger warning and cache empty result
await service.search('zombie');
// Expected output: "ForgeBazaarService.search: Service not available"
// Expected output: "ForgeBazaarService.search('zombie'): Not implemented - no public API"

// Second call - should use cache (FAST PATH)
await service.search('zombie');
// Expected output: "ForgeBazaarService.search('zombie'): Using cache (0 results)"
```

## Test 3: Cache Statistics

Check cache statistics:

```javascript
const service = game.modules.get('token-replacer-fa')?.forgeBazaarService;

// After running above tests
service.getCacheStats();
// Expected output:
// {
//   cacheLoaded: true,
//   isAvailable: false,
//   categoryCache: {
//     valid: 1,
//     expired: 0,
//     ttl: "24h"
//   },
//   searchCache: {
//     valid: 1,
//     expired: 0,
//     ttl: "5min"
//   }
// }
```

## Test 4: Cache Persistence

Test that category cache persists across page reloads:

```javascript
const service = game.modules.get('token-replacer-fa')?.forgeBazaarService;

// Call browseCategory
await service.browseCategory('beast');

// Reload the page (F5)
// After reload, call again
await service.browseCategory('beast');
// Expected output: "ForgeBazaarService.browseCategory('beast'): Using cache (0 results)"
// This proves localStorage persistence works
```

## Test 5: Cache Expiration

Test that search cache expires after 5 minutes:

```javascript
const service = game.modules.get('token-replacer-fa')?.forgeBazaarService;

// Call search
await service.search('dragon');

// Wait 6 minutes (or manually set timestamp in the past)
// Manually expire cache for testing:
service.searchCache.get('dragon').timestamp = Date.now() - (6 * 60 * 1000);

// Call again - should NOT use cache (expired)
await service.search('dragon');
// Expected output: "ForgeBazaarService.search: Service not available" (not "Using cache")
```

## Test 6: Clear Cache

Test that cache can be cleared:

```javascript
const service = game.modules.get('token-replacer-fa')?.forgeBazaarService;

// Add some data
await service.browseCategory('humanoid');
await service.search('elf');

// Check stats
service.getCacheStats();
// Should show: categoryCache.valid: 1, searchCache.valid: 1

// Clear cache
service.clearCache();
// Expected output: "ForgeBazaarService cache cleared"

// Check stats again
service.getCacheStats();
// Should show: categoryCache.valid: 0, searchCache.valid: 0, cacheLoaded: false
```

## Expected Behavior Summary

1. **First call**: Shows warning, caches empty result
2. **Second call**: Uses cached result (faster, no warning)
3. **Category cache**: Persists to localStorage (24h TTL)
4. **Search cache**: In-memory only (5min TTL)
5. **Cache expiration**: Automatic cleanup on load, TTL enforcement
6. **Clear cache**: Removes all cached data

## Performance Verification

The caching should make the second call significantly faster:

```javascript
const service = game.modules.get('token-replacer-fa')?.forgeBazaarService;

// First call (uncached)
console.time('First call');
await service.browseCategory('undead');
console.timeEnd('First call');

// Second call (cached)
console.time('Second call');
await service.browseCategory('undead');
console.timeEnd('Second call');

// Expected: Second call should be < 1ms, First call may be several ms
```
