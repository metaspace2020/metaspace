import { defineComponent, nextTick, h } from 'vue'
import NewFeatureBadge, { hideFeatureBadge } from './NewFeatureBadge'
import {flushPromises, mount} from '@vue/test-utils';
import router from "@/router";
import store from "../../store";

const TestNewFeatureBadge = defineComponent({
  setup(props, { slots }) {
    return () => h(NewFeatureBadge, { ...props }, slots.default ? () => slots.default() : undefined);
  },
});

const featureKey = 'test';

describe('NewFeatureBadge', () => {
  it('should render a badge', () => {
    const wrapper = mount(TestNewFeatureBadge, {
      props: { featureKey },
      global: {
        plugins: [store],
      },
    });
    expect(wrapper.classes()).toMatchSnapshot();
  });

  it('should hide the badge', async () => {
    const wrapper = mount(TestNewFeatureBadge, {
      props: { featureKey },
      global: {
        plugins: [store],
      },
    });
    hideFeatureBadge(featureKey);
    await nextTick();
    expect(wrapper.classes()).toMatchSnapshot();
  });

  it('should not render the badge if already hidden', () => {
    hideFeatureBadge(featureKey);
    const wrapper = mount(TestNewFeatureBadge, {
      props: { featureKey },
      global: {
        plugins: [store],
      },
    });
    expect(wrapper.classes()).toMatchSnapshot();
  });

  it('should not render the badge if stale', () => {
    const spy = vi.spyOn(global.Date, 'now').mockReturnValue(new Date('2020-01-02T00:00:00.000').valueOf());
    const wrapper = mount(TestNewFeatureBadge, {
      props: { featureKey, showUntil: new Date('2020-01-01T00:00:00.000') },
      global: {
        plugins: [store],
      },
    });
    expect(wrapper.classes()).toMatchSnapshot();
    spy.mockRestore();
  });
});
