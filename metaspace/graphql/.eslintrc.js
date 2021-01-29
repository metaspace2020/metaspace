const operatorLinebreakOverrides = {};
(['=', '+=', '-=', '*=', '/=', '&=', '^=']).forEach(o => {
  operatorLinebreakOverrides[o] = 'after'
})

module.exports = {
  root: true,
  env: {
    node: true,
  },
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'eslint-config-standard',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    'no-mixed-operators': ['off'],
    'no-unneeded-ternary': ['off'],
    'comma-dangle': ['error', 'always-multiline'], // Opinion
    'space-before-function-paren': ['error', 'never'], // Opinion
    'operator-linebreak': ['error', 'before', { overrides: operatorLinebreakOverrides }], // Opinion
    'max-len': ['warn', { // Opinion
      code: 120,
      ignoreComments: true,
    }],
    'lines-between-class-members': ['off'], // Opinion
    camelcase: ['off'], // camelcase disabled due to https://github.com/eslint/eslint/issues/13021
    'no-use-before-define': ['off'], // Buggy with types. TypeScript checks it anyway.
    '@typescript-eslint/explicit-module-boundary-types': ['off'], // Would be great, but it'll be a mission to implement
    '@typescript-eslint/restrict-template-expressions': ['off'], // Already extensively violated, questionable value
    // Unban TypeScript's escape hatches, because they're already explicit enough
    '@typescript-eslint/no-explicit-any': ['off'],
    '@typescript-eslint/no-unsafe-member-access': ['off'],
    '@typescript-eslint/no-unsafe-return': ['off'],
    '@typescript-eslint/no-unsafe-assignment': ['off'],
    '@typescript-eslint/no-unsafe-call': ['off'],
    '@typescript-eslint/ban-ts-comment': ['off'],
    '@typescript-eslint/no-non-null-assertion': ['off'],
    // TODO: These need to be manually checked after autofix because the autofix sometimes causes bad formatting
    curly: 0,
    'array-bracket-spacing': 0,
    'brace-style': 0,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
    },
    project: ['./tsconfig.json'],
    createDefaultProgram: true,
  },
  ignorePatterns: [
    'src/binding.ts', // auto-generated
    'src/migrations', // mostly auto-generated
  ],
  overrides: [
    {
      files: [
        '**/*.spec.{j,t}s?(x)',
        'tests/**/*',
      ],
      env: {
        jest: true,
      },
      rules: {
        'max-len': ['warn', { code: 200 }], // Allow for test data to be on long lines
        'import/first': ['off'], // Allow jest.mock calls, etc. in more readable places
      },
    },
    {
      files: ['**/*.js'],
      rules: {
        '@typescript-eslint/no-var-requires': ['off'], // Many JS files need to interop with non-ESM code
      },
    },
  ],
}
