// const autoprefixer = require('autoprefixer')
// const tailwindcss = require('tailwindcss')
// const postcssPurgecss = require('@fullhuman/postcss-purgecss')
// const postcss = require('postcss')
//
//
//
// const purgecss = postcssPurgecss({
//   content: [
//     './public/**/*.html',
//     './src/**/*.vue',
//     './src/**/*.tsx',
//     './src/**/*.ts',
//   ],
//   defaultExtractor: content => content.match(/[\w-/:%]+(?<!:)/g) || [],
// })
//
// // WORKAROUND: limit purgecss to the tailwind classes only, because purgecss has too many issues that interfere
// // with the existing CSS, primarily:
// // https://github.com/FullHuman/purgecss/issues/277 Attribute-based selectors are removed even when whitelisted,
// // which breaks ElementUI's "[class^='el-icon']" selectors and vue-component's scoped CSS.
// //
// // https://github.com/FullHuman/purgecss/issues/300 It's heinously slow because it re-reads all input content files
// //
// const purgecssTailwindOnly = () => {
//   return {
//     postcssPlugin: 'postcss-plugin-purgecss-tailwind',
//     Once(root) {
//       if (root.source?.input?.file?.match(/tailwind/i)) {
//         const purgeProcessor = postcss([purgecss]);
//         purgeProcessor.process(root, { from: undefined }).then(purgedResult => {
//           root.removeAll();
//           root.append(purgedResult.css);
//         });
//       }
//     }
//   }
// };
//
// purgecssTailwindOnly.postcss = true;
//
// module.exports = {
//   plugins: [
//     tailwindcss,
//     autoprefixer,
//     ...(process.env.NODE_ENV === 'production' ? [purgecssTailwindOnly] : []),
//   ]
// }
//
// postcss.config.js
module.exports = {
  plugins: [
    require('tailwindcss'),
    require('autoprefixer'),
    require('cssnano')({
      preset: 'default',
    }),
  ],
}
