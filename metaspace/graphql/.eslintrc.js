module.exports = {
  'root': true,
  'env': {
    'node': true,
  },
  'extends': [
    'eslint:recommended',
  ],
  'rules': {
    // 'array-bracket-spacing': [2, 'never'],
    // 'object-curly-spacing': [2, 'never'],
    'no-unused-vars': 0,
    'max-len': 0
  },
  parser: '@typescript-eslint/parser',
  "parserOptions": {
    "ecmaVersion": 6,
    "sourceType": "module",
    "ecmaFeatures": {
      "modules": true
    }
  },
  'overrides': [
    {
      'files': [
        '**/*.spec.{j,t}s?(x)',
        'tests/**/*',
      ],
      'env': {
        'jest': true,
      },
    },
  ],
}
