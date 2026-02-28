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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Web Worker files: dedicatedWorker environment (NOT browser)
  {
    files: ['scripts/workers/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.dedicatedWorker,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Disable formatting rules that conflict with Prettier (MUST be last)
  eslintConfigPrettier,
];
