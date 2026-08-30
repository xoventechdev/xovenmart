// ESLint config for the NestJS API.
// Uses @typescript-eslint's recommended ruleset + Prettier integration.
// Tested with eslint 8.57.x.

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    '.eslintrc.cjs',
    'dist/**',
    'node_modules/**',
    'coverage/**',
    // generated / smoke / scripts directories (not part of the production build)
    'scripts/**',
  ],
  rules: {
    // Allow unused vars that start with `_` (common pattern for NestJS params)
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Allow `any` in test fixtures and quick prototypes
    '@typescript-eslint/no-explicit-any': 'off',
    // Allow non-null assertions (`!`) — NestJS providers often need them
    '@typescript-eslint/no-non-null-assertion': 'off',
    // Empty interfaces are fine for DTOs that extend shared types
    '@typescript-eslint/no-empty-interface': 'off',
    // Decorators are a NestJS primitive
    '@typescript-eslint/no-extraneous-class': 'off',
    // Many NestJS controllers have one job — let the framework pattern win
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    // Prettier handles formatting, so disable conflicting style rules
    'prettier/prettier': 'warn',
  },
};