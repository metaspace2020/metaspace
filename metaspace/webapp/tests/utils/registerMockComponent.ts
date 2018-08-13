import Vue, { VNodeChildrenArrayContents } from 'vue';

export default (name: string) => {
  const mockName = `mock-${name}`;
  Vue.config.ignoredElements.push(mockName);
  Vue.component(name, {
    name,
    render(h) {
      const slotKeys = Object.keys(this.$slots);
      // If there are multiple slots, wrap each in its own <div>
      // Unfortunately not much can be done to fix the indentation here
      let children: VNodeChildrenArrayContents;
      if (slotKeys.length > 1 || (slotKeys.length === 1 && slotKeys[0] !== 'default')) {
        children = slotKeys.sort().map(key =>  h('div', {attrs: {'slot-key': key}}, this.$slots[key]));
      } else {
        children = [this.$slots.default]
      }

      return h(mockName, {}, children);
    }
  })
}
