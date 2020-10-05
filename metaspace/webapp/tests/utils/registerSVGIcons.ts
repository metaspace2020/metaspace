import Vue, { CreateElement, VNode } from 'vue'

const fs = require('fs')
const path = require('path')

const relativePath = '../../src/assets/inline/refactoring-ui'
const files = fs.readdirSync(path.resolve(__dirname, relativePath))

export default () => {
  for (const file of files) {
    const name = `${file.split('.')[0]}-icon`
    const mockName = `svg-${name}`
    Vue.config.ignoredElements.push(mockName)
    Vue.component(name, {
      name,
      render(h: CreateElement): VNode {
        return h(mockName)
      },
    })
  }
}
