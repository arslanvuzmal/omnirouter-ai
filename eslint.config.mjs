import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * eslint-config-next 16 ships flat configs directly, so it is imported rather
 * than adapted through FlatCompat — the compatibility shim cannot serialise
 * Next's plugin graph under ESLint 10 and throws on a circular reference.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'lib/database/generated/**',
      'prisma/migrations/**',
      'playwright-report/**',
      'test-results/**',
      'portfolio/**',
    ],
  },
  ...nextCoreWebVitals,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Scripts and seeds are operator tools; console output is their interface.
    files: ['scripts/**/*.{ts,mjs}', 'prisma/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
