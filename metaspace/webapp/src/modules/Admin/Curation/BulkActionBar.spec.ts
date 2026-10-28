import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { BulkActionBar } from './BulkActionBar'
import { ElMessageBox } from '../../../lib/element-plus'

const button = (wrapper: any, text: string) => wrapper.findAll('button').find((b: any) => b.text().includes(text))

describe('BulkActionBar', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is hidden when nothing is selected', () => {
    const wrapper = mount(BulkActionBar, { props: { count: 0, busy: false } })
    expect(wrapper.find('.curation-bulk-bar').exists()).toBe(false)
  })

  it('shows the count, the actions and the hint', () => {
    const wrapper = mount(BulkActionBar, { props: { count: 3, busy: false } })
    const text = wrapper.text()
    expect(text).toContain('3 selected')
    expect(text).toContain('✓ Approve as new term')
    expect(text).toContain('Map to suggested')
    expect(text).toContain('Reject…')
    expect(text).toContain('Bulk actions apply the same decision to every selected row')
    expect(text).not.toContain('skipped')
  })

  it('emits approve and mapSuggested', async () => {
    const wrapper = mount(BulkActionBar, { props: { count: 3, busy: false } })
    await button(wrapper, 'Approve').trigger('click')
    await button(wrapper, 'Map to suggested').trigger('click')
    expect(wrapper.emitted('approve')).toHaveLength(1)
    expect(wrapper.emitted('mapSuggested')).toHaveLength(1)
  })

  it('Reject… prompts and emits the typed reason', async () => {
    const prompt = vi
      .spyOn(ElMessageBox, 'prompt')
      .mockResolvedValue({ value: ' not a term ', action: 'confirm' } as any)
    const wrapper = mount(BulkActionBar, { props: { count: 3, busy: false } })
    await button(wrapper, 'Reject…').trigger('click')
    await flushPromises()
    expect(prompt).toHaveBeenCalledTimes(1)
    const validator = (prompt.mock.calls[0][2] as any).inputValidator
    expect(validator('')).toBeFalsy()
    expect(validator('   ')).toBeFalsy()
    expect(validator('why')).toBeTruthy()
    expect(wrapper.emitted('reject')).toEqual([['not a term']])
  })

  it('a cancelled prompt emits nothing', async () => {
    vi.spyOn(ElMessageBox, 'prompt').mockRejectedValue('cancel')
    const wrapper = mount(BulkActionBar, { props: { count: 3, busy: false } })
    await button(wrapper, 'Reject…').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('reject')).toBeUndefined()
  })

  it('disables the buttons while busy', () => {
    const wrapper = mount(BulkActionBar, { props: { count: 3, busy: true } })
    wrapper.findAll('button').forEach((b) => expect(b.attributes('disabled')).toBeDefined())
  })

  it('shows the skipped count from the last result', () => {
    const wrapper = mount(BulkActionBar, { props: { count: 3, busy: false, skipped: 2 } })
    expect(wrapper.text()).toContain('2 skipped (no suggestion)')
  })
})
