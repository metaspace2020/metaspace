/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/no-v-text-v-html-on-component': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'vue/require-default-prop': 'off', // Will props even be relevant if we shift to the Composition API?
    'vue/require-prop-types': 'off', // Will props even be relevant if we shift to the Composition API?
    'vue/html-self-closing': ['off'], // Unnecessarily forces template style to differ from TSX
    'vue/no-v-html': ['off'],
    'no-mixed-operators': ['off'],

    'no-unused-vars': ['off'], // Does not work well with TypeScript
    'import/no-duplicates': ['off'], // This keeps breaking stuff: https://github.com/benmosher/eslint-plugin-import/issues/1504

    'space-before-function-paren': ['off'], // Opinion
    'vue/max-len': [
      'warn',
      {
        // Opinion
        code: 120,
        template: 200,
        ignoreComments: true,
      },
    ],
  },
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  root: true,
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript',
    'plugin:prettier/recommended',
  ],
  overrides: [
    {
      files: ['*.vue', '*.tsx'],
      rules: {
        // Disable the rule that conflicts with your `onUpdate:modelValue` syntax
        '@typescript-eslint/ban-ts-comment': 'off',
        'vue/valid-v-model': 'off', // If you get errors about v-model on components
      },
    },
    {
      files: ['**/__tests__/*.{cy,spec}.{js,ts,jsx,tsx}', 'cypress/e2e/**/*.{cy,spec}.{js,ts,jsx,tsx}'],
      extends: ['plugin:cypress/recommended'],
    },
  ],
  parserOptions: {
    ecmaVersion: 'latest',
  },
}
