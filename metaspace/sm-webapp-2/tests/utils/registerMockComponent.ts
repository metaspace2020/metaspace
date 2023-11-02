import { defineComponent, h, PropType } from 'vue';
import { flattenDeep } from 'lodash-es';

export interface MockComponentOptions {
  // If abstract is true, it prevents the children from being wrapped in a mock element. This requires
  // the default slot to contain exactly 1 element.
  abstract?: Boolean;

  // Path for `jest.doMock`, useful for tsx components
  path?: string;
}
type Options = Partial<MockComponentOptions>;

export default (name: string, options?: Options) => {
  const mockName = `mock-${name}`;

  const componentDefinition = defineComponent({
    name,
    props: {
      default: {
        type: Array as PropType<any[]>,
        default: () => [],
      },
    },
    setup(props) {
      const slotContent = props.default;
      if (options && options.abstract) {
        if (slotContent.length > 1) {
          throw new Error(`Mocked ${name} component is an abstract component `
            + `and cannot have more than 1 child element. It has ${slotContent.length} children.`);
        } else {
          return () => slotContent[0];
        }
      } else {
        return () => h(mockName, slotContent);
      }
    },
  });

  if (options && options.path) {
    jest.doMock(options.path, () => componentDefinition);
  }

  return componentDefinition;
};
