// Import necessary Vue 3 and Vuex 4 functionalities
import { defineComponent, nextTick, h } from 'vue';
import { mount } from '@vue/test-utils';
import NewFeatureBadge, {hideFeatureBadge} from './NewFeatureBadge';

const TestNewFeatureBadge = defineComponent({
  name: 'TestNewFeatureBadge',
  props: {
    featureKey: String,
  },
  setup(props, { slots }) {
    return () =>
      h(NewFeatureBadge, { ...props }, {
        default: () => h('span', {}, 'Badge Content'),
        // Include other named slots if necessary
      });
  },
});

const featureKey = 'test';

describe('NewFeatureBadge', () => {
  it('should render a badge', async () => {
    const wrapper = mount(TestNewFeatureBadge, { propsData: { featureKey } })
    expect(wrapper.classes()).toMatchSnapshot()
  })

  it('should hide the badge', async() => {
    const wrapper = mount(TestNewFeatureBadge, { propsData: { featureKey } })
    hideFeatureBadge(featureKey)
    await nextTick();
    expect(wrapper.classes()).toMatchSnapshot()
  })

  it('should not render the badge if already hidden', () => {
    hideFeatureBadge(featureKey)
    const wrapper = mount(TestNewFeatureBadge, { propsData: { featureKey } })
    expect(wrapper.classes()).toMatchSnapshot()
  })

  it('should not render the badge if stale', () => {
    const originalDateNow = Date.now;
    Date.now = vi.fn(() => new Date('2020-01-02T00:00:00.000').valueOf());

    const wrapper = mount(TestNewFeatureBadge, {
      props: { featureKey, showUntil: new Date('2020-01-01T00:00:00.000') },
    });

    expect(wrapper.classes()).toMatchSnapshot();

    // Restore the original Date.now() function
    Date.now = originalDateNow;
  });
});
