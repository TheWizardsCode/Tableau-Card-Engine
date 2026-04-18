module.exports = [
  // Ignore patterns (replaces .eslintignore)
  {
    ignores: ['node_modules/**', 'dist/**', 'tmp/**', '.tmp/**', 'public/assets/**', '**/*.d.ts'],
  },
  // Typescript files
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'example-games/**/*.ts', 'example-games/**/*.tsx', 'tests/**/*.ts', 'tests/**/*.tsx', 'scripts/**/*.ts', 'tools/**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    rules: {
      'no-unused-vars': 'off',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  // Allow console uses in scripts/tools
  {
    files: ['scripts/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
