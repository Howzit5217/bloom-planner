// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'scripts/*'],
  },
  {
    rules: {
      // JSX text in React Native isn't HTML; apostrophes are fine.
      'react/no-unescaped-entities': 'off',
      // Style preference only.
      '@typescript-eslint/array-type': 'off',
      // TypeScript already checks named imports (and knows re-exported enums).
      'import/namespace': 'off',
    },
  },
]);
