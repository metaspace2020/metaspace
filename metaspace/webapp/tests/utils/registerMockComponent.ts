import Vue, {CreateElement, VNodeChildrenArrayContents} from 'vue';
import {flattenDeep} from 'lodash-es';

export interface MockComponentOptions {
  // If abstract is true, it prevents the children from being wrapped in a mock element. This requires
  // the default slot to contain exactly 1 element.
  abstract?: Boolean;
}

export default (name: string, options?: MockComponentOptions) => {
  const mockName = `mock-${name}`;
  Vue.config.ignoredElements.push(mockName);
  const abstractFlag = {
    abstract: options && options.abstract || false, // WORKAROUND: Vue's types don't include the abstract flag
  } as any;

  Vue.component(name, {
    name,
    ...abstractFlag,
    render(h: CreateElement) {
      const slotKeys = Object.keys(this.$slots);
      if (options && options.abstract) {
        const children = flattenDeep(Object.values(this.$slots));
        if (slotKeys.length > 1 || (slotKeys.length === 1 && slotKeys[0] !== 'default')) {
          throw new Error(`Mocked ${name} component is an abstract component and cannot have slots other than 'default'. It has these slots: ${slotKeys.join(', ')}.`);
        } else if (children.length > 1) {
          throw new Error(`Mocked ${name} component is an abstract component and cannot have more than 1 child element. It has ${children.length} children.`);
        } else {
          return children[0];
        }
      } else {
        // If there are multiple slots, wrap each in its own <div>
        // Unfortunately not much can be done to fix the indentation here
        let children: VNodeChildrenArrayContents;
        if (slotKeys.length > 1 || (slotKeys.length === 1 && slotKeys[0] !== 'default')) {
          children = slotKeys.sort().map(key => h('div', { attrs: { 'slot-key': key } }, this.$slots[key]));
        } else {
          children = [this.$slots.default]
        }
        return h(mockName, {}, children);
      }
    }
  })
}
