import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Empty catch blocks are an intentional idiom here (e.g. doctor tolerating a malformed file).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Allow intentionally-unused args (prefix with _) and leading unused args before a used one.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', args: 'after-used', caughtErrors: 'none' }],
    },
  },
];
