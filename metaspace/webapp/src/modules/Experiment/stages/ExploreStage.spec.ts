import { ref, nextTick, defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'

vi.mock('vue-echarts', () => ({
  default: defineComponent({ name: 'echarts', props: ['option'], render: () => null }),
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ BarChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  TitleComponent: {},
  MarkLineComponent: {},
}))

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

import ExploreStage from './ExploreStage'

describe('ExploreStage', () => {
  let mockClient: any

  beforeAll(async () => {
    mockClient = await initMockGraphqlClient({ Query: () => ({}) })
  })

  const setQueryResult = (value: any) => {
    ;(useQuery as any).mockReturnValue({ result: ref(value), loading: ref(false) })
  }

  const filterChain = [
    { name: 'all', count: 1000, droppedFromPrev: null },
    { name: 'fdr<=0.1', count: 600, droppedFromPrev: 400 },
    { name: 'minDR>=0.5', count: 420, droppedFromPrev: 180 },
  ]
  const coverage = {
    'region-0': { detected: 80, total: 100 },
    'region-1': { detected: 50, total: 100 },
  }
  const samples = [
    {
      regionKey: 'region-0',
      sampleId: 'ds_001',
      condition: 'treated',
      tic: 1,
      detectionRate: 0.9,
      cv: 0.1,
      pcaPC1: 0,
      pcaPC2: 0,
    },
    {
      regionKey: 'region-1',
      sampleId: 'ds_002',
      condition: 'control',
      tic: 1,
      detectionRate: 0.5,
      cv: 0.1,
      pcaPC1: 0,
      pcaPC2: 0,
    },
  ]

  it('auto-emits update:filters on mount with the initial filter values', async () => {
    setQueryResult({ experimentRunQc: { filterChain, coverage, samples } })
    const wrapper = mount(ExploreStage, {
      props: {
        experimentId: 'e1',
        initialFilters: { fdr: 0.05, minDetectionRate: 0.2, databases: ['HMDB'], adducts: ['+H'] },
      },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()

    const events = wrapper.emitted('update:filters')
    expect(events).toBeTruthy()
    expect(events!.length).toBeGreaterThanOrEqual(1)
    expect(events![0][0]).toMatchObject({
      fdrMax: 0.05,
      minDetectionRate: 0.2,
      adducts: ['+H'],
    })
  })

  it('renders the ions-entering-test stat with the last filterChain count', async () => {
    setQueryResult({ experimentRunQc: { filterChain, coverage, samples } })
    const wrapper = mount(ExploreStage, {
      props: { experimentId: 'e1' },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()

    const stat = wrapper.find('[data-test-key="ions-entering-test"]')
    expect(stat.exists()).toBe(true)
    expect(stat.text()).toContain('420')
  })

  it('renders FilterChainWaterfall and CoverageBars children when QC data is present', async () => {
    setQueryResult({ experimentRunQc: { filterChain, coverage, samples } })
    const wrapper = mount(ExploreStage, {
      props: { experimentId: 'e1' },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()
    expect(wrapper.findComponent({ name: 'FilterChainWaterfall' }).exists()).toBe(true)
    const coverageBars = wrapper.findComponent({ name: 'CoverageBars' })
    expect(coverageBars.exists()).toBe(true)
    const passedRows = coverageBars.props('rows') as any[]
    expect(passedRows).toHaveLength(2)
    expect(passedRows[0]).toMatchObject({ regionKey: 'region-0', sampleId: 'ds_001', detected: 80, total: 100 })
    expect(passedRows[1]).toMatchObject({ regionKey: 'region-1', sampleId: 'ds_002', detected: 50, total: 100 })
  })

  it('recomputes the filter chain client-side from allIons when form changes', async () => {
    const allIons = [
      // 6 ions at fdr <= 0.05, 4 more between 0.05 and 0.10, etc.
      { ion_id: 1, fdr: 0.01, adduct: '+H', moldb_id: 9, moldb_name: 'HMDB', detection_rate: 1.0 },
      { ion_id: 2, fdr: 0.02, adduct: '+H', moldb_id: 9, moldb_name: 'HMDB', detection_rate: 0.9 },
      { ion_id: 3, fdr: 0.03, adduct: '+Na', moldb_id: 9, moldb_name: 'HMDB', detection_rate: 0.8 },
      { ion_id: 4, fdr: 0.04, adduct: '+H', moldb_id: 9, moldb_name: 'HMDB', detection_rate: 0.7 },
      { ion_id: 5, fdr: 0.05, adduct: '-H', moldb_id: 9, moldb_name: 'HMDB', detection_rate: 0.6 },
      { ion_id: 6, fdr: 0.05, adduct: '+H', moldb_id: 9, moldb_name: 'HMDB', detection_rate: 0.5 },
      { ion_id: 7, fdr: 0.08, adduct: '+H', moldb_id: 10, moldb_name: 'LipidMaps', detection_rate: 0.4 },
      { ion_id: 8, fdr: 0.09, adduct: '+H', moldb_id: 10, moldb_name: 'LipidMaps', detection_rate: 0.3 },
      { ion_id: 9, fdr: 0.1, adduct: '+H', moldb_id: 10, moldb_name: 'LipidMaps', detection_rate: 0.2 },
      { ion_id: 10, fdr: 0.3, adduct: '+K', moldb_id: 10, moldb_name: 'LipidMaps', detection_rate: 0.1 },
    ]
    setQueryResult({ experimentRunQc: { filterChain, coverage, samples, allIons } })
    const wrapper = mount(ExploreStage, {
      props: { experimentId: 'e1', initialFilters: { fdr: 0.05 } },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()

    // With FDR <= 0.05 and no other filters: All=10, then 6 survive.
    const waterfall = wrapper.findComponent({ name: 'FilterChainWaterfall' })
    expect(waterfall.exists()).toBe(true)
    const steps = waterfall.props('steps') as Array<{ name: string; count: number }>
    expect(steps[0]).toMatchObject({ name: 'All annotated ions', count: 10 })
    expect(steps[steps.length - 1].count).toBe(6)
    expect(wrapper.find('[data-test-key="ions-entering-test"]').text()).toContain('6')
  })

  it('falls back to precomputed filterChain when allIons is missing', async () => {
    setQueryResult({ experimentRunQc: { filterChain, coverage, samples } })
    const wrapper = mount(ExploreStage, {
      props: { experimentId: 'e1' },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-test-key="ions-entering-test"]').text()).toContain('420')
  })

  it('renders empty-state when experimentRunQc is null', async () => {
    setQueryResult(null)
    const wrapper = mount(ExploreStage, {
      props: { experimentId: 'e1' },
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[data-test-key="explore-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-test-key="ions-entering-test"]').text()).toContain('0')
  })
})
