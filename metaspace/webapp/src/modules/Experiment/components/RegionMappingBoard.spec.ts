import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import RegionMappingBoard from './RegionMappingBoard'

const columns = [
  {
    datasetId: 'ds1',
    name: 'Dataset 1',
    regions: [
      { regionKey: 'r1a', label: 'Cluster 0', color: '#1f77b4' },
      { regionKey: 'r1b', label: 'Cluster 1', color: '#2ca02c' },
    ],
  },
  {
    datasetId: 'ds2',
    name: 'Dataset 2',
    regions: [{ regionKey: 'r2a', label: 'Roi 0', color: '#2ca02c' }],
  },
]

describe('RegionMappingBoard', () => {
  it('emits add-edge when two regions in different columns are clicked', async () => {
    const w = mount(RegionMappingBoard, { props: { columns, edges: [] } })
    await w.find('[data-test-key="region-cell-r1b"]').trigger('click')
    await w.find('[data-test-key="region-cell-r2a"]').trigger('click')
    expect(w.emitted('add-edge')?.[0]).toEqual([{ from: 'r1b', to: 'r2a' }])
  })

  it('emits add-edge when two regions in the same column are clicked', async () => {
    const w = mount(RegionMappingBoard, { props: { columns, edges: [] } })
    await w.find('[data-test-key="region-cell-r1a"]').trigger('click')
    await w.find('[data-test-key="region-cell-r1b"]').trigger('click')
    expect(w.emitted('add-edge')?.[0]).toEqual([{ from: 'r1a', to: 'r1b' }])
  })

  it('renders one arrow per edge', () => {
    const w = mount(RegionMappingBoard, {
      props: { columns, edges: [{ from: 'r1b', to: 'r2a' }] },
    })
    expect(w.findAll('[data-test-key^="edge-"]')).toHaveLength(1)
  })
})
