# Token Replacer - Forgotten Adventures

A Foundry VTT module that automatically replaces NPC token art with matching tokens from Forgotten Adventures and The Forge Bazaar using fuzzy search.

## Features

- **One-click token replacement**: Adds a button to the token controls that scans all NPC tokens on the current scene
- **Fuzzy search**: Uses Fuse.js for intelligent matching based on creature type, name, and subtype
- **Multiple sources**: Searches both FA Nexus local files and The Forge Bazaar (via Token Variant Art)
- **Category-based optimization**: Automatically filters search by creature type (e.g., searches "undead" folder for zombies)
- **Parallel search**: Processes multiple creature types simultaneously for faster results
- **Interactive selection**: Shows matching options with preview images and lets you choose the best match
- **Progress tracking**: Visual progress dialogs with real-time results summary
- **Batch processing**: Identical creatures share search results for efficient processing
- **Configurable**: Adjustable fuzzy threshold, search priority, fallback options, and custom paths
- **Localization**: Available in English and Italian

## Requirements

- Foundry VTT v12+ (verified on v13)
- D&D 5e System v3.0+

### Recommended Modules

- **[Token Variant Art](https://foundryvtt.com/packages/token-variants)**: Enables searching The Forge Bazaar
- **[FA Nexus](https://foundryvtt.com/packages/fa-nexus)**: Provides access to Forgotten Adventures token library

## Installation

### Manifest URL (Recommended)

```
https://github.com/Aiacos/token-replacer-fa/releases/latest/download/module.json
```

### Manual Installation

1. Download the latest release from [GitHub Releases](https://github.com/Aiacos/token-replacer-fa/releases)
2. Extract to `FoundryVTT/Data/modules/token-replacer-fa/`
3. Restart Foundry VTT
4. Enable the module in your world

## Usage

1. Open a scene with NPC tokens
2. Select the **Token Controls** layer (the person icon)
3. Click the **wand** button (Replace Token Art)
4. The module will:
   - Scan local directories for token artwork
   - Group identical creatures for batch processing
   - Search for matching art using fuzzy search
   - Show matching options for each creature type
5. Select the desired replacement, skip, or cancel

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Fuzzy Search Threshold** | Lower values require closer matches (0.0 = exact, 1.0 = match anything) | 0.1 |
| **Search Priority** | Which source to search first (FA Nexus, Forge Bazaar, or Both) | Both |
| **Auto Replace on Match** | Automatically replace if high-confidence match found | Off |
| **Confirm Before Replace** | Show selection dialog for each creature type | On |
| **Fallback to Full Search** | Search entire index if no matches in creature category | Off |
| **Additional Search Paths** | Comma-separated custom paths to search for tokens | Empty |
| **Use TVA Cache** | Use Token Variant Art's pre-built cache instead of manual scanning | On |
| **Refresh TVA Cache** | Force refresh TVA cache before searching (for new images) | Off |

## How It Works

### Search Process

1. **Directory Scan**: Scans local directories for token images (FA Nexus, user folders, custom paths)
2. **Token Analysis**: Extracts creature information from each NPC token
3. **Category Filtering**: Filters images by creature type folder (e.g., "beast", "undead", "humanoid")
4. **Fuzzy Search**: Performs intelligent name matching within filtered results
5. **Result Display**: Shows best matches with preview images for user selection

### Search Terms

For each NPC token, the module extracts:
1. **Actor Name** (primary) - e.g., "Goblin Boss"
2. **Token Name** - if different from actor
3. **Creature Type** - e.g., "humanoid"
4. **Creature Subtype** - e.g., "goblinoid"
5. **Race/Custom Type** - if available

### Creature Type Mappings

The module maps D&D 5e creature types to common folder names:

| Creature Type | Matched Folders |
|--------------|-----------------|
| Aberration | aberration, mind flayer, beholder |
| Beast | beast, animal |
| Celestial | celestial, angel |
| Construct | construct, golem, robot |
| Dragon | dragon, drake, wyrm |
| Elemental | elemental, genie |
| Fey | fey, fairy, sprite, pixie |
| Fiend | fiend, demon, devil |
| Giant | giant, ogre, troll |
| Humanoid | humanoid, human, npc, goblin, orc, elf, dwarf |
| Monstrosity | monstrosity, monster |
| Ooze | ooze, slime |
| Plant | plant, fungus |
| Undead | undead, zombie, skeleton, ghost, vampire, lich |

### Search Sources

1. **Local Directories**:
   - FA Nexus module paths
   - User data folders containing "token", "assets", or "forgotten"
   - Custom paths configured in settings

2. **Token Variant Art**:
   - Uses TVA API to search configured sources
   - Includes The Forge Bazaar if configured

### Fuzzy Matching

Uses [Fuse.js](https://fusejs.io/) for intelligent fuzzy matching:
- Handles typos and abbreviations
- Scores matches by similarity (lower = better)
- Configurable threshold for match sensitivity
- Weighted search prioritizing name over filename

## API

The module exposes `window.TokenReplacerFA` for debugging and integration:

```javascript
// Check if modules are available
TokenReplacerFA.hasTVA      // Token Variant Art available
TokenReplacerFA.hasFANexus  // FA Nexus available

// Access Fuse.js instance
TokenReplacerFA.Fuse

// Get settings
TokenReplacerFA.getSetting('fuzzyThreshold')
TokenReplacerFA.getSetting('searchPriority')
TokenReplacerFA.getSetting('fallbackFullSearch')

// Localization
TokenReplacerFA.i18n('dialog.title')

// Check processing state
TokenReplacerFA.isProcessing
```

## Troubleshooting

### No matches found

- Ensure Token Variant Art or FA Nexus is installed and configured
- Check that search paths are properly configured
- Try enabling "Fallback to Full Search" in settings
- Try increasing the fuzzy threshold (e.g., 0.3)
- Add custom paths in the "Additional Search Paths" setting

### Module not appearing

- Verify the module is enabled in your world
- Check browser console (F12) for errors
- Ensure you're logged in as GM
- Refresh the browser and try again

### Images not loading

- Check that image paths are accessible
- For Forge Bazaar, ensure you're logged into The Forge
- Check browser console for CORS or permission errors
- Verify the image files exist at the reported paths

### Browser freezing

- The module uses yielding to prevent freezing
- Large directories may take longer to scan
- Progress dialogs show current scanning status

### Console Debugging

Enable browser console (F12) to see detailed logs:
```
token-replacer-fa | Found token path: modules/fa-nexus/tokens
token-replacer-fa | Found 1234 images in local directories
token-replacer-fa | TVA search for "goblin" found 15 valid results
token-replacer-fa | Optimized search: Found 50 images in humanoid category
```

## Changelog

### v1.1.0
- **Major Performance Optimization**: Added TVA cache integration
  - Skips manual directory scanning when Token Variant Art is available
  - Leverages TVA's pre-built image index for much faster searches
  - New "Use TVA Cache" setting (enabled by default)
  - New "Refresh TVA Cache Before Search" setting for fresh image detection
- Uses TVA's `updateTokenImage()` API to apply custom token configurations (scale, lighting, effects)
- Improved search logic when TVA cache mode is enabled

### v1.0.9
- Fixed UI glitching caused by multiple dialog windows
- Refactored to use single dialog throughout entire replacement process
- Added inline selection buttons for match selection
- Improved error handling for missing dependencies
- Better user feedback when no tokens or matches are found

### v1.0.8
- Code cleanup and removal of unused variables
- Added missing localization strings
- Removed verbose debug logging
- Updated documentation

### v1.0.7
- Fixed TVA API path extraction (paths no longer show as numeric indices)
- Fixed dialog auto-sizing issues
- Added result validation to filter invalid paths
- Added extensive debug logging for TVA responses
- Added missing localization strings

### v1.0.6
- Made fallback full search optional (default: off)
- Added "Fallback to Full Search" setting

### v1.0.5
- Added category-based search optimization
- Creature type now filters search to relevant folders first
- Improved performance for large token libraries

### v1.0.4
- Added parallel search for multiple creature types
- Identical creatures now share search results
- Real-time progress display during processing

### v1.0.3
- Fixed browser freezing during directory scan
- Added yielding to prevent UI blocking
- Throttled UI updates for better performance

### v1.0.2
- Fixed multiple dialog windows appearing
- Added safe dialog closing mechanism

### v1.0.1
- Fixed settings localization
- Fixed Foundry v12/v13 compatibility for scene controls
- Added XSS protection

### v1.0.0
- Initial release

## License

MIT License

## Credits

- **Author**: [Aiacos](https://github.com/Aiacos)
- [Forgotten Adventures](https://www.forgotten-adventures.net/) for the amazing token art
- [Aedif](https://github.com/Aedif/TokenVariants) for Token Variant Art module
- [Fuse.js](https://fusejs.io/) for fuzzy search library

## Support

- Report issues on [GitHub Issues](https://github.com/Aiacos/token-replacer-fa/issues)
- Contributions welcome via Pull Requests
