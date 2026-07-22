import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import RegionMappingGroups from './RegionMappingGroups'

const datasets = [
  {
    datasetId: 'ds1',
    name: 'DS1',
    regions: [
      { regionKey: 'r1a', label: 'ROI 1', labelGroupName: 'urban' },
      { regionKey: 'r1b', label: 'ROI 2', labelGroupName: null },
    ],
  },
  {
    datasetId: 'ds2',
    name: 'DS2',
    regions: [{ regionKey: 'r2a', label: 'ROI 1', labelGroupName: 'urban' }],
  },
]
const labelGroups = [{ name: 'urban', color: '#1f77b4' }]

describe('RegionMappingGroups', () => {
  it('renders one card per labelGroup plus the add card', () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    expect(w.findAll('[data-test-key^="group-card-"]')).toHaveLength(1)
    expect(w.find('[data-test-key="add-group-card"]').exists()).toBe(true)
  })

  it('lists each group member with dataset badge and region label', () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    const rows = w.findAll('[data-test-key="group-card-urban"] [data-test-key^="member-row-"]')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('DS1')
    expect(rows[0].text()).toContain('ROI 1')
    expect(rows[1].text()).toContain('DS2')
  })

  it('emits rename-group when title is edited and Enter pressed', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    await w.find('[data-test-key="group-card-urban"] [data-test-key="group-title"]').trigger('click')
    const input = w.find('[data-test-key="group-card-urban"] [data-test-key="group-title-input"]')
    expect(input.exists()).toBe(true)
    await input.setValue('downtown')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('rename-group')?.[0]).toEqual([{ oldName: 'urban', newName: 'downtown' }])
  })

  it('does not emit rename-group when name is unchanged or empty', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    await w.find('[data-test-key="group-card-urban"] [data-test-key="group-title"]').trigger('click')
    const input = w.find('[data-test-key="group-card-urban"] [data-test-key="group-title-input"]')
    await input.setValue('   ')
    await input.trigger('keydown', { key: 'Enter' })
    await w.find('[data-test-key="group-card-urban"] [data-test-key="group-title"]').trigger('click')
    const input2 = w.find('[data-test-key="group-card-urban"] [data-test-key="group-title-input"]')
    await input2.setValue('urban')
    await input2.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('rename-group')).toBeUndefined()
  })

  it('emits remove-region-from-group when × is clicked', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    await w.find('[data-test-key="member-remove-r1a"]').trigger('click')
    expect(w.emitted('remove-region-from-group')?.[0]).toEqual([{ regionKey: 'r1a' }])
  })

  it('shows ungrouped + other-group regions in the per-card add-region select', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    const card = w.find('[data-test-key="group-card-urban"]')
    const options = card.findAll('[data-test-key^="add-region-option-"]')
    // Only r1b is not in 'urban'; r1a and r2a are already in this group and excluded.
    expect(options.map((o) => o.attributes('data-test-key'))).toEqual(['add-region-option-r1b'])
  })

  it('add-group-card lists only ungrouped regions and emits create-group-with-region', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    const addCard = w.find('[data-test-key="add-group-card"]')
    const opts = addCard.findAll('[data-test-key^="add-cluster-option-"]')
    expect(opts.map((o) => o.attributes('data-test-key'))).toEqual(['add-cluster-option-r1b'])
    const select: any = addCard.findComponent({ name: 'ElSelectMock' }) ?? addCard.findComponent({ name: 'ElSelect' })
    select.vm.$emit('change', 'r1b')
    expect(w.emitted('create-group-with-region')?.[0]).toEqual([{ regionKey: 'r1b' }])
  })

  it('emits add-region-to-group with chosen region and target group', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    // Find the ElSelect inside the urban card and emit 'change'.
    // ElSelect is stubbed as 'ElSelectMock' in the test env, so find by stub name.
    const card = w.find('[data-test-key="group-card-urban"]')
    const select: any = card.findAllComponents({ name: 'ElSelectMock' })[0]
    select.vm.$emit('change', 'r1b')
    expect(w.emitted('add-region-to-group')?.[0]).toEqual([{ groupName: 'urban', regionKey: 'r1b' }])
  })

  it('emits delete-group when × in header is clicked', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    await w.find('[data-test-key="group-delete-urban"]').trigger('click')
    expect(w.emitted('delete-group')?.[0]).toEqual([{ name: 'urban' }])
  })

  it('renders an Unmapped card listing all ungrouped regions', () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups } })
    const card = w.find('[data-test-key="unmapped-card"]')
    expect(card.exists()).toBe(true)
    const rows = card.findAll('[data-test-key^="unmapped-row-"]')
    expect(rows.map((r) => r.attributes('data-test-key'))).toEqual(['unmapped-row-r1b'])
    expect(rows[0].text()).toContain('DS1')
    expect(rows[0].text()).toContain('ROI 2')
  })

  it('readonly mode hides delete, ×, add-region, add-group-card, unmapped-card', async () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups, readonly: true } })
    expect(w.find('[data-test-key="group-delete-urban"]').exists()).toBe(false)
    expect(w.find('[data-test-key="member-remove-r1a"]').exists()).toBe(false)
    expect(w.find('[data-test-key="add-group-card"]').exists()).toBe(false)
    expect(w.find('[data-test-key="unmapped-card"]').exists()).toBe(false)
    // Title click should not enter edit mode.
    await w.find('[data-test-key="group-card-urban"] [data-test-key="group-title"]').trigger('click')
    expect(w.find('[data-test-key="group-card-urban"] [data-test-key="group-title-input"]').exists()).toBe(false)
  })

  it('readonly mode still renders group cards with members', () => {
    const w = mount(RegionMappingGroups, { props: { datasets, labelGroups, readonly: true } })
    expect(w.find('[data-test-key="group-card-urban"]').exists()).toBe(true)
    expect(w.findAll('[data-test-key="group-card-urban"] [data-test-key^="member-row-"]')).toHaveLength(2)
  })

  it('Unmapped card stays empty when every region is grouped', () => {
    const allGroupedDatasets = [
      { datasetId: 'ds1', name: 'DS1', regions: [{ regionKey: 'a', label: 'X', labelGroupName: 'urban' }] },
      { datasetId: 'ds2', name: 'DS2', regions: [{ regionKey: 'b', label: 'Y', labelGroupName: 'urban' }] },
    ]
    const w = mount(RegionMappingGroups, { props: { datasets: allGroupedDatasets, labelGroups } })
    expect(w.findAll('[data-test-key^="unmapped-row-"]')).toHaveLength(0)
    expect(w.find('[data-test-key="unmapped-card"]').exists()).toBe(true)
  })
})
