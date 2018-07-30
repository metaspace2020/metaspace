import Vue from 'vue';

export default (name: string) => {
  const mockName = `mock-${name}`;
  Vue.config.ignoredElements.push(mockName);
  Vue.component(name, {
    name,
    render(h) {
      return h(mockName, {}, this.$slots.default);
    }
  })
}
