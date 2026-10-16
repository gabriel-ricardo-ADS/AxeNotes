import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'playwright-report',
      'test-results',
      'blob-report',
      '.screenshots',
      'axenotes-kit',
      'docs/reference',
      'src/components/ui', // código gerado pelo shadcn/ui
      'src/lib/database.types.ts', // gerado pelo Supabase CLI
    ],
  },
  {
    files: [
      'src/**/*.{ts,tsx}',
      'e2e/**/*.ts',
      'supabase/tests/**/*.ts',
      '*.config.ts',
      'vitest.setup.ts',
    ],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    // Scripts Node em JavaScript (sem checagem de tipos).
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
  },
)
