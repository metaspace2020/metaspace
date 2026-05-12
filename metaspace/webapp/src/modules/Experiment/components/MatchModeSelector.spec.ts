import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import MatchModeSelector from './MatchModeSelector'

describe('MatchModeSelector', () => {
  it('emits update:modelValue when mode changes', async () => {
    const w = mount(MatchModeSelector, { props: { modelValue: 'MANUAL' } })
    const select: any = w.findComponent({ name: 'ElSelectMock' }) ?? w.findComponent({ name: 'ElSelect' })
    select.vm.$emit('change', 'NAME')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['NAME'])
  })
})
