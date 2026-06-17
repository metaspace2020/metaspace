import { mount } from '@vue/test-utils'
import BulkAssignPanel from './BulkAssignPanel'
import { emptyVariables } from '../composables/experimentVariables'

describe('BulkAssignPanel', () => {
  const datasets = [
    { id: 'd1', name: 'Cond2_A3_S1' },
    { id: 'd2', name: 'Cond2_A3_S2' },
  ]
  const variables = { ...emptyVariables(), condition: ['Cond1', 'Cond2'], biologicalReplicateId: ['A3'] }

  it('shows progress and a value chip per value of the active tab', () => {
    const wrapper = mount(BulkAssignPanel, { props: { datasets, variables, assignedCount: 1 } })
    expect(wrapper.find('[data-test-key="bulk-progress"]').text()).toContain('1 / 2')
    expect(wrapper.find('[data-test-key="bulk-value-Cond1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test-key="bulk-value-Cond2"]').exists()).toBe(true)
  })

  it('emits assign for all selected datasets when a value chip is clicked', async () => {
    const wrapper = mount(BulkAssignPanel, { props: { datasets, variables } })
    await wrapper.find('[data-test-key="bulk-chip-d1"]').trigger('click')
    await wrapper.find('[data-test-key="bulk-chip-d2"]').trigger('click')
    await wrapper.find('[data-test-key="bulk-value-Cond1"]').trigger('click')
    expect(wrapper.emitted('assign')).toBeTruthy()
    expect(wrapper.emitted('assign')![0][0]).toEqual({ key: 'condition', value: 'Cond1', datasetIds: ['d1', 'd2'] })
  })

  it('does not emit assign when nothing is selected', async () => {
    const wrapper = mount(BulkAssignPanel, { props: { datasets, variables } })
    await wrapper.find('[data-test-key="bulk-value-Cond1"]').trigger('click')
    expect(wrapper.emitted('assign')).toBeFalsy()
  })

  it('clears the dataset selection after a value is assigned', async () => {
    const wrapper = mount(BulkAssignPanel, { props: { datasets, variables } })
    await wrapper.find('[data-test-key="bulk-chip-d1"]').trigger('click')
    await wrapper.find('[data-test-key="bulk-value-Cond1"]').trigger('click')
    expect(wrapper.emitted('assign')).toHaveLength(1)
    // Selection was reset, so clicking another value assigns nothing.
    await wrapper.find('[data-test-key="bulk-value-Cond2"]').trigger('click')
    expect(wrapper.emitted('assign')).toHaveLength(1)
  })

  it('switches the value chips when a different tab is clicked', async () => {
    const wrapper = mount(BulkAssignPanel, { props: { datasets, variables } })
    await wrapper.find('[data-test-key="bulk-tab-biologicalReplicateId"]').trigger('click')
    expect(wrapper.find('[data-test-key="bulk-value-A3"]').exists()).toBe(true)
    expect(wrapper.find('[data-test-key="bulk-value-Cond1"]').exists()).toBe(false)
  })

  it('colours a dataset chip to match its assigned value for the active tab', () => {
    const withValues = [
      {
        id: 'd1',
        name: 'Cond2_A3_S1',
        values: { condition: 'Cond2', biologicalReplicateId: null, batchId: null, technicalReplicateId: null },
      },
    ]
    const wrapper = mount(BulkAssignPanel, { props: { datasets: withValues, variables } })
    // The 'Cond2' value chip and the dataset assigned 'Cond2' must share the same colour.
    const valueStyle = wrapper.find('[data-test-key="bulk-value-Cond2"]').attributes('style') || ''
    const chipStyle = wrapper.find('[data-test-key="bulk-chip-d1"]').attributes('style') || ''
    const border = (valueStyle.match(/border-color:\s*([^;]+)/) || [])[1]
    expect(border).toBeTruthy()
    expect(chipStyle).toContain(`border-color: ${border.trim()}`)
  })

  it('shows a clear × only on datasets with a value and emits an empty assign for that dataset', async () => {
    const withValues = [
      {
        id: 'd1',
        name: 'D1',
        values: { condition: 'Cond2', biologicalReplicateId: null, batchId: null, technicalReplicateId: null },
      },
      {
        id: 'd2',
        name: 'D2',
        values: { condition: null, biologicalReplicateId: null, batchId: null, technicalReplicateId: null },
      },
    ]
    const wrapper = mount(BulkAssignPanel, { props: { datasets: withValues, variables } })
    // d1 has a condition -> shows ×; d2 has none -> no ×
    expect(wrapper.find('[data-test-key="bulk-chip-clear-d1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test-key="bulk-chip-clear-d2"]').exists()).toBe(false)

    await wrapper.find('[data-test-key="bulk-chip-clear-d1"]').trigger('click')
    expect(wrapper.emitted('assign')).toBeTruthy()
    expect(wrapper.emitted('assign')![0][0]).toEqual({ key: 'condition', value: '', datasetIds: ['d1'] })
  })
})
