# IndexWorker Testing

This directory contains the IndexWorker.js Web Worker implementation and testing tools.

## Quick Start

### Option 1: Standalone Testing (Fastest)

Open `test-worker.html` directly in your browser:

```bash
# From the module directory
open scripts/workers/test-worker.html
# or
firefox scripts/workers/test-worker.html
# or
chrome scripts/workers/test-worker.html
```

Then click the test buttons to verify worker functionality:
- **Test Small Dataset (500 paths)** - Fast test, completes in < 1 second
- **Test Medium Dataset (2500 paths)** - Progress updates visible
- **Test Large Dataset (10000 paths)** - Full performance test

### Option 2: Foundry VTT Testing

1. Load the module in Foundry VTT
2. Open browser DevTools console (F12)
3. Run this test script:

```javascript
(async function testWorkerIndexing() {
  console.log('=== Worker Indexing Test ===');

  const indexSvc = game.modules.get('token-replacer-fa').api.indexService;
  console.log('1. Worker available:', !!indexSvc.worker);

  // Force rebuild to test worker
  indexSvc.index = null;
  indexSvc.isBuilt = false;

  // Build with progress tracking
  const result = await indexSvc.build((processed, total, imagesFound) => {
    console.log(`Progress: ${processed}/${total} - Found: ${imagesFound}`);
  });

  console.log('2. Total images:', result);
  console.log('3. Categories:', Object.keys(indexSvc.index?.categories || {}));
  console.log('=== Test Complete ===');
})();
```

## What to Look For

### Success Indicators

✅ **Worker Initialization:**
```
token-replacer-fa | Web Worker initialized for background index building
```

✅ **Worker Usage:**
```
token-replacer-fa | Using Web Worker for background index building
```

✅ **Progress Updates:**
```
token-replacer-fa | Worker completed: 750 images from 800 paths
```

✅ **UI Responsiveness:**
- No freezing during index build
- Smooth interactions
- Tokens can be moved while indexing

### Failure Indicators

❌ **Fallback Mode:**
```
token-replacer-fa | Using fallback method (main thread with yields)
```
This means the worker failed to initialize (check browser compatibility).

❌ **Worker Errors:**
```
token-replacer-fa | Failed to initialize Web Worker: <error>
```
Check browser console for details.

## Files

- **IndexWorker.js** - Web Worker implementation
- **test-worker.html** - Standalone test harness
- **README-TESTING.md** - This file

## Browser Compatibility

Web Workers are supported in:
- ✅ Chrome 4+
- ✅ Firefox 3.5+
- ✅ Safari 4+
- ✅ Edge (all versions)
- ✅ Opera 10.6+

If your browser doesn't support workers, the module automatically falls back to the main thread implementation.

## Performance Expectations

| Dataset Size | Expected Duration | Progress Updates |
|-------------|-------------------|------------------|
| < 1000 paths | < 1 second | 0-1 updates |
| 1000-5000 paths | 1-3 seconds | 1-5 updates |
| 5000-10000 paths | 3-5 seconds | 5-10 updates |
| > 10000 paths | 5-10+ seconds | 10+ updates |

Progress is reported every 1000 items processed.

## Troubleshooting

### Worker not initializing?

Check the browser console for errors. Common issues:
- CSP (Content Security Policy) blocking worker creation
- Incorrect file path
- Browser doesn't support workers

### No progress updates?

This is normal for small datasets (< 1000 paths). The worker processes them so fast that completion happens before the first progress interval.

### "Using fallback method" message?

The worker failed to initialize or isn't supported. The module will work but won't use background processing. This is expected behavior on older browsers.

## Advanced Testing

### Test Worker Directly

```javascript
// Create worker manually
const worker = new Worker('modules/token-replacer-fa/scripts/workers/IndexWorker.js');

// Listen for messages
worker.addEventListener('message', (e) => {
  console.log('Worker message:', e.data);
});

// Ping test
worker.postMessage({ command: 'ping' });
// Should receive: { type: 'pong' }

// Terminate when done
worker.terminate();
```

### Benchmark Performance

Use the standalone test harness to compare performance:
1. Open test-worker.html
2. Click "Test Large Dataset (10000 paths)"
3. Note the duration in the statistics panel
4. Compare with the old implementation (main thread with yields)

The worker should be 2-3x faster since it doesn't yield to the main thread.

## Questions?

See the full testing guide in `.auto-claude/specs/022-use-web-workers-for-background-index-building-to-p/testing-guide-subtask-3-1.md` for detailed instructions and troubleshooting.
