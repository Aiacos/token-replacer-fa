# Token Replacer - Forgotten Adventures

A Foundry VTT module that automatically replaces NPC token art with matching tokens from Forgotten Adventures and The Forge Bazaar using fuzzy search.

## Features

- **One-click token replacement**: Adds a button to the token controls that scans all NPC tokens on the current scene
- **Fuzzy search**: Uses Fuse.js for intelligent matching based on creature type, name, and subtype
- **Multiple sources**: Searches both FA Nexus local files and The Forge Bazaar (via Token Variant Art)
- **Interactive selection**: Shows matching options and lets you choose the best match
- **Progress tracking**: Visual progress dialog with results summary
- **Configurable**: Adjustable fuzzy threshold, search priority, and auto-replace options

## Requirements

- Foundry VTT v12+ (verified on v13)
- D&D 5e System v3.0+

### Recommended Modules

- **[Token Variant Art](https://foundryvtt.com/packages/token-variants)**: Enables searching The Forge Bazaar
- **[FA Nexus](https://foundryvtt.com/packages/fa-nexus)**: Provides access to Forgotten Adventures token library

## Installation

### Manual Installation

1. Download the latest release
2. Extract to `FoundryVTT/Data/modules/token-replacer-fa/`
3. Restart Foundry VTT
4. Enable the module in your world

### Manifest URL

```
https://raw.githubusercontent.com/YOUR_USERNAME/token-replacer-fa/main/module.json
```

## Usage

1. Open a scene with NPC tokens
2. Select the **Token Controls** layer (the person icon)
3. Click the **wand** button (Replace Token Art)
4. The module will:
   - Scan all NPC tokens on the scene
   - Extract creature type and name from each token
   - Search for matching art in available sources
   - Show matching options for each token
5. Select the desired replacement or skip

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Fuzzy Search Threshold** | Lower values require closer matches (0.0 = exact, 1.0 = match anything) | 0.1 |
| **Search Priority** | Which source to search first | Both |
| **Auto Replace on Match** | Automatically replace if high-confidence match found | Off |
| **Confirm Before Replace** | Show selection dialog for each token | On |

## How It Works

### Search Terms

For each NPC token, the module extracts:
1. **Actor Name** (primary) - e.g., "Goblin Boss"
2. **Token Name** - if different from actor
3. **Creature Type** - e.g., "humanoid"
4. **Creature Subtype** - e.g., "goblinoid"
5. **Race/Custom Type** - if available

### Search Sources

1. **FA Nexus**: Scans local FA Nexus directories for token images
2. **Token Variant Art**: Uses TVA API to search configured paths including The Forge Bazaar

### Fuzzy Matching

Uses [Fuse.js](https://fusejs.io/) for intelligent fuzzy matching:
- Handles typos and abbreviations
- Scores matches by similarity
- Configurable threshold for match sensitivity

## API

The module exposes `window.TokenReplacerFA` for debugging and integration:

```javascript
// Check if modules are available
TokenReplacerFA.hasTVA      // Token Variant Art
TokenReplacerFA.hasFANexus  // FA Nexus

// Access Fuse.js instance
TokenReplacerFA.Fuse

// Get settings
TokenReplacerFA.getSetting('fuzzyThreshold')
```

## Troubleshooting

### No matches found

- Ensure Token Variant Art or FA Nexus is installed and configured
- Check that search paths are properly configured in Token Variant Art
- Try lowering the fuzzy threshold in settings

### Module not appearing

- Verify the module is enabled in your world
- Check browser console for errors
- Ensure you're logged in as GM

### Images not loading

- Check that image paths are accessible
- For Forge Bazaar, ensure you're logged into The Forge
- Check browser console for CORS or permission errors

## License

MIT License

## Credits

- [Forgotten Adventures](https://www.forgotten-adventures.net/) for the token art
- [Aedif](https://github.com/Aedif/TokenVariants) for Token Variant Art
- [Fuse.js](https://fusejs.io/) for fuzzy search
