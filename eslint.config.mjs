// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores (must be its own config block).
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.nx/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/.husky/_/**',
      'tools/**/*.js',
      'apps/docs/.source/**',
    ],
  },

  // Base JS recommended for everything we lint.
  eslint.configs.recommended,

  // ESLint-comments plugin applies to ALL files - bans every disable directive.
  eslintComments.recommended,

  // Disable formatting rules that conflict with Prettier.
  prettier,

  // Type-checked rules apply to .ts/.tsx ONLY. Root config .mjs files don't
  // belong to a tsconfig program, so we don't subject them to the type-aware passes.
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // The eslint-comments plugin's own rules (re-stated here so config order
  // can't accidentally weaken them via later rule overrides).
  {
    rules: {
      '@eslint-community/eslint-comments/no-use': ['error', { allow: [] }],
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
    },
  },

  // Tests may use `any` for mock flexibility - narrow exception per spec.
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
