# Contributing to Token Replacer FA

Thank you for your interest in contributing! This guide covers the development workflow, conventions, and testing expectations.

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Foundry VTT](https://foundryvtt.com/) v12 or v13 for manual testing
- [Token Variant Art](https://foundryvtt.com/packages/token-variants) module installed in Foundry

## Getting Started

```bash
git clone https://github.com/Aiacos/token-replacer-fa.git
cd token-replacer-fa
npm install
```

## Development Commands

| Command | Description |
|---|---|
| `npm test` | Run all tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint source files (ESLint) |
| `npm run format` | Format all files (Prettier) |
| `npm run format:check` | Check formatting without writing |
| `npm run typecheck` | Type-check JSDoc annotations (tsc --noEmit) |
| `bash build.sh` | Build release ZIP (Linux/macOS) |
| `build.bat` | Build release ZIP (Windows) |

## Project Structure

```
scripts/
  core/         Constants and utility functions (pure, no side effects)
  services/     Business logic services with constructor DI
  workers/      Web Worker for background index building
  ui/           Dialog and UI generation
templates/      Handlebars templates (.hbs)
tests/          Vitest test suites mirroring scripts/ structure
lang/           Localization files (en.json, it.json)
```

## Code Conventions

### Naming

- **Files**: PascalCase for classes (`TokenService.js`), camelCase for utilities (`main.js`)
- **Classes**: PascalCase (`SearchOrchestrator`)
- **Constants**: UPPER_SNAKE_CASE (`MODULE_ID`, `PARALLEL_BATCH_SIZE`)
- **Functions/variables**: camelCase (`loadFuse`, `creatureInfo`)
- **Private methods**: underscore prefix (`_debugLog`, `_ensureWorker`)
- **Templates**: kebab-case (`match-selection.hbs`)

### Style

- 2-space indentation
- Single quotes in JavaScript, double quotes in HTML/templates
- Semicolons required
- No default exports (all named exports)
- JSDoc on all public methods with `@param` and `@returns`

### Architecture Patterns

- **Constructor DI**: services accept dependencies via constructor with lazy defaults
- **Singleton exports**: each service file exports both the class and a singleton instance
- **Structured errors**: use `createModuleError(type, details, recoveryKeys)` from Utils.js
- **Handlebars templates**: all UI HTML in `.hbs` files, never inline in JS
- **Debug logging**: use `createDebugLogger(serviceName)` factory, never raw `console.log`

### Import Order

1. Constants (`../core/Constants.js`)
2. Utilities (`../core/Utils.js`)
3. Sibling services (`./TVACacheService.js`)

## Testing

### Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
```

### Test Structure

Tests mirror the source structure:

```
tests/
  core/
    Constants.test.js
    Utils.test.js
  services/
    TokenService.test.js
    IndexService.test.js
    StorageService.test.js
    TVACacheService.test.js
    SearchOrchestrator.test.js
    SearchService.test.js
  integration/
    SearchPipeline.test.js
```

### Writing Tests

- Use Vitest with jsdom environment
- Foundry VTT globals are mocked via `tests/setup/foundry-mocks.js`
- Mock TVA cache data is available in `tests/helpers/mock-tva-cache.js`
- Use `createMockActor()` and `addMockTokens()` helpers for token tests
- Test files should be named `{Module}.test.js` matching the source file

### What to Test

- All public methods on services
- Edge cases: empty inputs, missing dependencies, error paths
- Security-sensitive code: path sanitization, protocol rejection, input validation
- Integration tests for cross-service workflows

### Test Environment

- **Vitest + jsdom**: browser-like environment without a real browser
- **fake-indexeddb**: polyfill for IndexedDB in tests
- **MockWorker**: simulates Web Worker message passing
- **Foundry mocks**: game, canvas, ui, Hooks, and settings globals

## Manual Testing in Foundry VTT

Automated tests cover logic, but UI and Foundry integration require manual testing:

1. Symlink or copy the module to `FoundryVTT/Data/modules/token-replacer-fa/`
2. Enable the module in a world with D&D 5e
3. Open a scene with NPC tokens
4. Click the wand button in Token Controls
5. Verify search, selection dialog, and token replacement work correctly

## Localization

Localization files are in `lang/`. When adding user-facing strings:

1. Add the key to `lang/en.json` under the `TOKEN_REPLACER_FA` namespace
2. Add the Italian translation to `lang/it.json` (or leave the English string as placeholder)
3. Use `game.i18n.localize('TOKEN_REPLACER_FA.your.key')` in code

Error messages use `errors.{type}` keys. Recovery suggestions use `recovery.{key}` keys.

## Version Management

**Do not manually update version numbers in JS files.** The version is defined in `module.json` only. The build script automatically syncs it to `main.js` and `CLAUDE.md` via `sync-version.sh`.

## Submitting Changes

1. Fork the repository and create a feature branch from `develop`
2. Make your changes following the conventions above
3. Run `npm test` and ensure all tests pass
4. Run `npm run lint` and `npm run format:check`
5. Submit a Pull Request against the `develop` branch

### PR Guidelines

- Keep PRs focused on a single change
- Include a clear description of what and why
- Add tests for new functionality
- Update `lang/en.json` if adding user-facing strings
- Do not bump the version number (maintainer handles releases)

## Reporting Issues

Use [GitHub Issues](https://github.com/Aiacos/token-replacer-fa/issues) with:

- Foundry VTT version and D&D 5e system version
- Browser and OS
- Steps to reproduce
- Browser console output (F12) if relevant
- Whether you're using The Forge or self-hosted

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
