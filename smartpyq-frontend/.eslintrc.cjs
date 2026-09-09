// ESLint 8 (eslintrc) config for the React/Vite frontend.
// Deliberately lenient: catches real defects (undefined vars, hook misuse,
// refresh-export mistakes) without drowning the codebase in style noise.
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'coverage'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off', // JSX quotes/apostrophes are fine
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    // memo-wrapped arrow components get their name from the variable — rule
    // can't see it; not worth a refactor across the codebase
    'react/display-name': 'off',
  },
};
