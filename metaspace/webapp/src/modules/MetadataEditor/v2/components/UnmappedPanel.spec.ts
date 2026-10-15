import { mount } from '@vue/test-utils'
import { UnmappedPanel } from './UnmappedPanel'

const global = {
  stubs: {
    ElDropdown: { name: 'ElDropdown', template: '<div><slot /><slot name="dropdown" /></div>' },
    ElDropdownMenu: { template: '<div><slot /></div>' },
    ElDropdownItem: { template: '<div><slot /></div>' },
  },
}

const rows = [
  {
    legacyKey: 'Sample_Information.Condition',
    label: 'Condition',
    raw: 'Wildtype',
    hint: 'Suggested: …',
    targets: ['disease', 'genetic_background'] as any,
    safeToDismiss: false,
  },
  {
    legacyKey: 'Sample_Information.Sample_Growth_Conditions',
    label: 'Sample growth conditions',
    raw: 'None',
    hint: 'Placeholder value — safe to dismiss',
    targets: ['protocol_description'] as any,
    safeToDismiss: true,
  },
]

describe('UnmappedPanel', () => {
  it('lists rows with value, hint and actions; emits copy and dismiss', async () => {
    const w = mount(UnmappedPanel, { props: { rows, copied: [], dismissed: [], copiedTargets: {} }, global })
    expect(w.text()).toContain('2 legacy values not mapped to the new schema')
    expect(w.findAll('.v2-unmapped__row')).toHaveLength(2)
    expect(w.find('.v2-unmapped__row code').text()).toBe('Wildtype')
    expect(w.findAll('.v2-unmapped__target').map((t) => t.text())).toContain('Disease')
    w.findAllComponents({ name: 'ElDropdown' })[0].vm.$emit('command', 'disease')
    expect(w.emitted('copy')).toEqual([['Sample_Information.Condition', 'disease']])
    await w.findAll('button.v2-unmapped__dismiss')[1].trigger('click')
    expect(w.emitted('dismiss')![0]).toEqual(['Sample_Information.Sample_Growth_Conditions'])
  })
  it('pluralises the heading', () => {
    const one = mount(UnmappedPanel, {
      props: { rows, copied: [], dismissed: ['Sample_Information.Condition'], copiedTargets: {} },
      global,
    })
    expect(one.text()).toContain('1 legacy value not mapped to the new schema')
    expect(one.text()).not.toContain('1 legacy values')
  })
  it('collapses to a summary when everything is handled and can show again', async () => {
    const w = mount(UnmappedPanel, {
      props: {
        rows,
        copied: ['Sample_Information.Condition'],
        dismissed: ['Sample_Information.Sample_Growth_Conditions'],
        copiedTargets: { 'Sample_Information.Condition': 'disease' },
      },
      global,
    })
    expect(w.text()).toContain('All legacy values handled — 1 copied, 1 dismissed.')
    await w.find('button.v2-unmapped__show').trigger('click')
    expect(w.findAll('.v2-unmapped__row')).toHaveLength(2)
    await w.find('button.v2-unmapped__undo').trigger('click')
    expect(w.emitted('undo')![0]).toEqual(['disease'])
    await w.find('button.v2-unmapped__restore').trigger('click')
    expect(w.emitted('restore')![0]).toEqual(['Sample_Information.Sample_Growth_Conditions'])
  })
})
