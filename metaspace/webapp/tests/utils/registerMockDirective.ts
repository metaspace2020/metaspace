import Vue from 'vue'

export default (name: string) => {
  const mockName = `mock-v-${name}`
  Vue.config.ignoredElements.push(mockName)
  Vue.directive(name, (el, { value, arg, modifiers }) => {
    const modifierString = Object.keys(modifiers).join('.')
    const directiveSuffix = (arg ? `:${arg}` : '') + (modifierString ? `.${modifierString}` : '')

    el.setAttribute(mockName + directiveSuffix, value)
  })
}
