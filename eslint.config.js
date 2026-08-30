import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

// Foundry VTT global variables not in globals.browser
const foundryGlobals = {
  game: 'readonly',
  ui: 'readonly',
  canvas: 'readonly',
  Hooks: 'readonly',
  foundry: 'readonly',
  renderTemplate: 'readonly',
  loadTemplates: 'readonly',
  CONFIG: 'readonly',
  CONST: 'readonly',
  Dialog: 'readonly',
  FormApplication: 'readonly',
  Application: 'readonly',
  FilePicker: 'readonly',
  ChatMessage: 'readonly',
};

export default [
  // Main source files: browser environment + Foundry globals
  {
    files: ['scripts/**/*.js'],
    ignores: ['scripts/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...foundryGlobals,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'no-case-declarations': 'warn',
    },
  },
  // Web Worker files: worker environment (NOT browser — no window/document)
  {
    files: ['scripts/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.worker,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'no-useless-escape': 'warn',
    },
  },
  // Build/CI tooling and the test suite: Node environment, not browser.
  // Linting these matters — tools/ is release-critical code that only ever
  // runs in CI, where a typo surfaces as a failed release rather than a crash.
  {
    files: ['tools/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Test suite: jsdom plus Node, with the Foundry globals writable because the
  // mocks install them (`game = {...}`) rather than only reading them.
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
        ...Object.fromEntries(Object.keys(foundryGlobals).map((name) => [name, 'writable'])),
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Disable formatting rules that conflict with Prettier (MUST be last)
  eslintConfigPrettier,
];
