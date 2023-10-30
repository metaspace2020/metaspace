const operatorLinebreakOverrides = {};
(['=', '+=', '-=', '*=', '/=', '&=', '^=']).forEach(o => {
  operatorLinebreakOverrides[o] = 'after'
})

module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: [
    'plugin:vue/vue3-essential',
    '@vue/standard',
    '@vue/typescript/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    '@typescript-eslint/ban-ts-comment': ['off'],
    'vue/require-default-prop': ['off'], // Will props even be relevant if we shift to the Composition API?
    'vue/require-prop-types': ['off'], // Will props even be relevant if we shift to the Composition API?
    'vue/html-self-closing': ['off'], // Unnecessarily forces template style to differ from TSX
    'vue/no-v-html': ['off'],
    'no-mixed-operators': ['off'],
    '@typescript-eslint/no-explicit-any': ['off'],
    '@typescript-eslint/no-var-requires': ['off'], // Many JS files need to interop with non-ESM code

    'no-unused-vars': ['off'], // Does not work well with TypeScript
    'import/no-duplicates': ['off'], // This keeps breaking stuff: https://github.com/benmosher/eslint-plugin-import/issues/1504

    'comma-dangle': ['error', 'always-multiline'], // Opinion
    'space-before-function-paren': ['error', 'never'], // Opinion
    'operator-linebreak': ['error', 'before', { overrides: operatorLinebreakOverrides }], // Opinion
    'vue/max-len': ['warn', { // Opinion
      code: 120,
      template: 200,
      ignoreComments: true,
    }],
    'no-restricted-imports': ['error', { paths: [{ name: 'element-ui', message: 'Use src/lib/element-ui instead' }] }],
  },
  overrides: [
    {
      files: [
        '**/__tests__/*.{j,t}s?(x)',
        '**/tests/unit/**/*.spec.{j,t}s?(x)',
        '**/*.spec.{j,t}s?(x)',
        'tests/**/*',
      ],
      env: {
        jest: true,
      },
    },
  ],
}
