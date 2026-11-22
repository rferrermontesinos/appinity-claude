import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
      'packages/database/drizzle/**',
      '.data/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }],
      'no-console': 'off',
    },
  },
  {
    // Nest necesita los tipos como valores para inyectar dependencias (emitDecoratorMetadata).
    files: ['apps/api/src/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // El motor de afinidad y la consolidación no dependen de proveedores ni de infraestructura (§8).
    files: ['packages/algorithms/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@appinity/integrations',
                '@appinity/integrations/*',
                '@appinity/catalog',
                '@appinity/database',
                '@appinity/ingestion',
                'drizzle-orm',
                'pg',
                'bullmq',
                'ioredis',
                '**/steam/**',
                '**/tmdb/**',
                '**/lastfm/**',
              ],
              message: 'Los algoritmos solo dependen de datos normalizados (@appinity/shared).',
            },
          ],
        },
      ],
    },
  },
);
