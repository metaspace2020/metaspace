import { flushPromises, mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import ElapsedTime from './ElapsedTime'
import { defineComponent, h, nextTick } from 'vue'

const TestElapsedTime = defineComponent({
  components: {
    ElapsedTime,
  },
  props: ['date'],
  setup(props) {
    return () => h(ElapsedTime, { ...props })
  },
})

describe('ElapsedTime', () => {
  it('should render correctly', async () => {
    const spy = vi.spyOn(global.Date, 'now').mockImplementation(() => new Date('2020-01-03T00:00:00.000Z').valueOf())

    await flushPromises()
    await nextTick()

    const wrapper = mount(TestElapsedTime, { props: { date: '2020-01-02T00:00:00.000Z' } })
    await flushPromises()
    await nextTick()

    expect(wrapper.text()).toEqual('a day ago')
    expect(wrapper.attributes().title).toEqual('2020/01/02, 01:00')

    spy.mockRestore()
  })

  it('should render placeholder content when date is not provided', () => {
    const wrapper = mount(TestElapsedTime, { props: { date: '' } })

    expect(wrapper.text()).toEqual('some time ago')
    expect(wrapper.attributes().title).toEqual('Date unavailable')
  })
})
