// https://vue-svg-loader.js.org/faq.html#how-to-use-this-loader-with-jest

const path = require('path')
const vueJest = require('vue-jest/lib/template-compiler')

module.exports = {
  process(content, filepath) {
    const filename = path.basename(filepath)
    const name = filename.split('.')[0]
    const { render } = vueJest({
      content: `<svg data-icon="${name}" />`,
      attrs: {
        functional: false,
      },
    })
    return `module.exports = { render: ${render} }`
  },
}
