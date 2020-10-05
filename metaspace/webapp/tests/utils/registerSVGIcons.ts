import Vue, { CreateElement, VNode } from 'vue'

const fs = require('fs')
const path = require('path')

export default () => {
  const relativePath = '../../src/assets/inline/refactoring-ui'
  fs.readdir(path.resolve(__dirname, relativePath), (err: Error, files: string[]) => {
    if (err) {
      throw err
    }
    for (const file of files) {
      const name = `${file.split('.')[0]}-icon`
      const mockName = `svg-${name}`
      Vue.config.ignoredElements.push(mockName)
      Vue.component(name, {
        name,
        render(h: CreateElement): VNode {
          return h(mockName, {}, [this.$slots.default])
        },
      })
    }
  })
}
