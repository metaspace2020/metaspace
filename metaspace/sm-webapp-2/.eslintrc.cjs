/* eslint-env node */
require('@rushstack/eslint-patch/modern-module-resolution')

module.exports = {
  rules: {
    'vue/multi-word-component-names': 'off',
    'vue/no-v-text-v-html-on-component': 'off',
  },
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true,
  },
  root: true,
  'extends': [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
    '@vue/eslint-config-typescript',
    '@vue/eslint-config-prettier/skip-formatting'
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
      files: [
        '**/__tests__/*.{cy,spec}.{js,ts,jsx,tsx}',
        'cypress/e2e/**/*.{cy,spec}.{js,ts,jsx,tsx}'
      ],
      'extends': [
        'plugin:cypress/recommended'
      ]
    }
  ],
  parserOptions: {
    ecmaVersion: 'latest'
  }
}
