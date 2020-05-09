const autoprefixer = require('autoprefixer')
const tailwindcss = require('tailwindcss')
const postcssPurgecss = require('@fullhuman/postcss-purgecss')
const postcss = require('postcss')

const purgecss = postcssPurgecss({
  content: [
    './public/**/*.html',
    './src/**/*.vue',
    './src/**/*.tsx',
    './src/**/*.ts',
  ],
  defaultExtractor: content => content.match(/[\w-/:%]+(?<!:)/g) || [],
})

// WORKAROUND: limit purgecss to the tailwind classes only, because purgecss has too many issues that interfere
// with the existing CSS, primarily:
// https://github.com/FullHuman/purgecss/issues/277 Attribute-based selectors are removed even when whitelisted,
// which breaks ElementUI's "[class^='el-icon']" selectors and vue-component's scoped CSS.
//
// https://github.com/FullHuman/purgecss/issues/300 It's heinously slow because it re-reads all input content files
//
const purgecssTailwindOnly = postcss.plugin('postcss-plugin-purgecss-tailwind', () => {
  return async (root, result) => {
    if (root && root.source && root.source.input && /tailwind/i.test(root.source.input.file)) {
      await purgecss(root, result)
    }
  }
})

module.exports = {
  plugins: [
    tailwindcss,
    autoprefixer,
    ...(process.env.NODE_ENV === 'production' ? [purgecssTailwindOnly] : []),
  ]
}

