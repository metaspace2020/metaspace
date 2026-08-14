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

  describe('Copy ROIs tab', () => {
    const dsWithValues = [
      {
        id: 'd1',
        name: 'Cond2_A3_S1',
        values: { condition: 'Cond2', biologicalReplicateId: 'A3', technicalReplicateId: 'S1', batchId: 'B1' },
      },
      {
        id: 'd2',
        name: 'Cond2_A3_S2',
        values: { condition: 'Cond2', biologicalReplicateId: 'A3', technicalReplicateId: 'S2', batchId: 'B1' },
      },
      {
        id: 'd3',
        name: 'Cond1_A1_S1',
        values: { condition: 'Cond1', biologicalReplicateId: 'A1', technicalReplicateId: 'S1', batchId: 'B1' },
      },
      {
        id: 'd4',
        name: 'Cond2_A1_S1',
        values: { condition: 'Cond2', biologicalReplicateId: 'A1', technicalReplicateId: 'S1', batchId: 'B2' },
      },
    ]
    // d2 (source, 3 ROIs) and d3 (2 ROIs) already have ROIs.
    const copyRoisSources = [
      { datasetId: 'd2', name: 'Cond2_A3_S2', roiCount: 3 },
      { datasetId: 'd3', name: 'Cond1_A1_S1', roiCount: 2 },
    ]

    const mountCopy = (datasets = dsWithValues, sources = copyRoisSources) =>
      mount(BulkAssignPanel, { props: { datasets, variables, copyRoisSources: sources } })

    const openTab = async (w: any) => {
      await w.find('[data-test-key="bulk-tab-copy-rois"]').trigger('click')
    }
    const selectSource = async (w: any, id: string) => {
      w.findComponent('[data-test-key="bulk-copy-rois-source"]').vm.$emit('change', id)
      await w.vm.$nextTick()
    }

    it('hides the Copy-to section until a source is chosen', async () => {
      const w = mountCopy()
      await openTab(w)
      expect(w.find('[data-test-key="bulk-copy-to"]').exists()).toBe(false)
      await selectSource(w, 'd2')
      expect(w.find('[data-test-key="bulk-copy-to"]').exists()).toBe(true)
    })

    it('generates a scope per variable the source has a value for, plus All', async () => {
      const w = mountCopy()
      await openTab(w)
      await selectSource(w, 'd2')
      expect(w.find('[data-test-key="bulk-scope-all"]').exists()).toBe(true)
      expect(w.find('[data-test-key="bulk-scope-condition"]').exists()).toBe(true)
      expect(w.find('[data-test-key="bulk-scope-biologicalReplicateId"]').exists()).toBe(true)
      expect(w.find('[data-test-key="bulk-scope-technicalReplicateId"]').exists()).toBe(true)
      expect(w.find('[data-test-key="bulk-scope-batchId"]').exists()).toBe(true)
    })

    it('omits a scope for a variable the source has no value for', async () => {
      const partial = [
        {
          id: 's',
          name: 'S',
          values: { condition: 'Cond2', biologicalReplicateId: null, technicalReplicateId: null, batchId: null },
        },
        {
          id: 't',
          name: 'T',
          values: { condition: 'Cond2', biologicalReplicateId: null, technicalReplicateId: null, batchId: null },
        },
      ]
      const w = mountCopy(partial as any, [{ datasetId: 's', name: 'S', roiCount: 1 }])
      await openTab(w)
      await selectSource(w, 's')
      expect(w.find('[data-test-key="bulk-scope-condition"]').exists()).toBe(true)
      expect(w.find('[data-test-key="bulk-scope-batchId"]').exists()).toBe(false)
    })

    it('the Same condition scope emits exactly the matching datasets, excluding the source', async () => {
      const w = mountCopy()
      await openTab(w)
      await selectSource(w, 'd2') // Cond2 → d1, d4 (d2 is source, excluded; d3 is Cond1)
      await w.find('[data-test-key="bulk-scope-condition"]').trigger('click')
      await w.find('[data-test-key="bulk-copy-rois-confirm"]').trigger('click')
      expect(w.emitted('copy-rois')![0][0]).toEqual({ sourceDatasetId: 'd2', targetDatasetIds: ['d1', 'd4'] })
    })

    it('does not let the source chip be selected as a target', async () => {
      const w = mountCopy()
      await openTab(w)
      await selectSource(w, 'd2')
      await w.find('[data-test-key="bulk-chip-d2"]').trigger('click')
      expect(w.find('[data-test-key="bulk-copy-rois-confirm"]').attributes('disabled')).toBeDefined()
    })

    it('lets a manual chip toggle override the applied scope', async () => {
      const w = mountCopy()
      await openTab(w)
      await selectSource(w, 'd2')
      await w.find('[data-test-key="bulk-scope-condition"]').trigger('click') // d1, d4
      await w.find('[data-test-key="bulk-chip-d1"]').trigger('click') // deselect d1
      await w.find('[data-test-key="bulk-copy-rois-confirm"]').trigger('click')
      expect(w.emitted('copy-rois')![0][0]).toEqual({ sourceDatasetId: 'd2', targetDatasetIds: ['d4'] })
    })

    it('warns and marks chips only when a selected target already has ROIs', async () => {
      const w = mountCopy()
      await openTab(w)
      await selectSource(w, 'd2')
      await w.find('[data-test-key="bulk-scope-condition"]').trigger('click') // d1, d4 — no ROIs
      expect(w.find('[data-test-key="bulk-copy-rois-warn"]').exists()).toBe(false)
      expect(w.find('[data-test-key="bulk-chip-warn-d3"]').exists()).toBe(false)
      await w.find('[data-test-key="bulk-scope-all"]').trigger('click') // d1, d3, d4 — d3 has ROIs
      expect(w.find('[data-test-key="bulk-copy-rois-warn"]').exists()).toBe(true)
      expect(w.find('[data-test-key="bulk-chip-warn-d3"]').exists()).toBe(true)
      expect(w.find('[data-test-key="bulk-chip-warn-d1"]').exists()).toBe(false)
    })

    it('resets the target selection when the source changes', async () => {
      const w = mountCopy()
      await openTab(w)
      await selectSource(w, 'd2')
      await w.find('[data-test-key="bulk-scope-condition"]').trigger('click')
      await selectSource(w, 'd3') // change source → selection cleared
      expect(w.find('[data-test-key="bulk-copy-rois-confirm"]').attributes('disabled')).toBeDefined()
    })
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
