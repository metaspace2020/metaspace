import { ref, nextTick, defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { ElTableColumn } from '../../../lib/element-plus'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

vi.mock('vue-echarts', () => ({
  default: defineComponent({ name: 'echarts', props: ['option'], render: () => null }),
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ ScatterChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  MarkLineComponent: {},
  MarkAreaComponent: {},
}))

import ResultsStage from './ResultsStage'
import VolcanoPlot from '../charts/VolcanoPlot'
import IntensityStripPlot from '../charts/IntensityStripPlot'

const mockRows = [
  {
    ion: { id: 1, ion: 'C6H12O6+H', formula: 'C6H12O6', adduct: '+H' },
    labelGroupName: 'lg1',
    lfc: 1.2,
    pValue: 0.001,
    fdr: 0.01,
    detectionRateA: 0.9,
    detectionRateB: 0.4,
    nA: 5,
    nB: 5,
    condA: 'control',
    condB: 'treated',
    meanA: 10,
    meanB: 30,
  },
  {
    ion: { id: 2, ion: 'C5H10O5+H', formula: 'C5H10O5', adduct: '+H' },
    labelGroupId: 'lg1',
    lfc: 0.5,
    pValue: 0.05,
    fdr: 0.1,
    detectionRateA: 0.7,
    detectionRateB: 0.5,
    nA: 5,
    nB: 5,
    condA: 'control',
    condB: 'treated',
    meanA: 10,
    meanB: 30,
  },
  {
    ion: { id: 3, ion: 'C12H22O11+Na', formula: 'C12H22O11', adduct: '+Na' },
    labelGroupId: 'lg1',
    lfc: -0.4,
    pValue: 0.04,
    fdr: 0.12,
    detectionRateA: 0.6,
    detectionRateB: 0.8,
    nA: 5,
    nB: 5,
    condA: 'control',
    condB: 'treated',
    meanA: 10,
    meanB: 30,
  },
  {
    ion: { id: 4, ion: 'C3H6O3+H', formula: 'C3H6O3', adduct: '+H' },
    labelGroupId: 'lg1',
    lfc: -1.0,
    pValue: 0.0001,
    fdr: 0.005,
    detectionRateA: 0.3,
    detectionRateB: 0.95,
    nA: 5,
    nB: 5,
    condA: 'control',
    condB: 'treated',
    meanA: 10,
    meanB: 30,
  },
  {
    ion: { id: 5, ion: 'C4H8O4+H', formula: 'C4H8O4', adduct: '+H' },
    labelGroupId: 'lg1',
    lfc: 0.1,
    pValue: null,
    fdr: 0.6,
    detectionRateA: 0.5,
    detectionRateB: 0.5,
    nA: 5,
    nB: 5,
    condA: 'control',
    condB: 'treated',
    meanA: 10,
    meanB: 30,
  },
]

describe('ResultsStage', () => {
  let mockClient: any
  let lastVariables: any

  beforeAll(async () => {
    mockClient = await initMockGraphqlClient({ Query: () => ({}) })
  })

  beforeEach(() => {
    lastVariables = null
    ;(useQuery as any).mockImplementation((doc: any, variablesFn: any) => {
      const vars = typeof variablesFn === 'function' ? variablesFn() : variablesFn
      const opName = doc?.definitions?.[0]?.name?.value
      if (opName === 'experimentResults') {
        lastVariables = vars
        return {
          result: ref({ experimentResults: mockRows }),
          loading: ref(false),
          error: ref(null),
        }
      }
      return {
        result: ref({ experimentIonIntensities: [] }),
        loading: ref(false),
        error: ref(null),
      }
    })
  })

  const mountStage = () =>
    mount(ResultsStage, {
      props: { experimentId: 'e1' },
      global: {
        provide: { [DefaultApolloClient]: mockClient },
      },
    })

  it('renders the volcano plot using only non-null pValue rows', async () => {
    const wrapper = mountStage()
    await flushPromises()
    await nextTick()

    const volcano = wrapper.findComponent(VolcanoPlot)
    expect(volcano.exists()).toBe(true)
    const passedRows = volcano.props('rows') as any[]
    expect(passedRows).toHaveLength(5)
    const echart = volcano.findComponent({ name: 'echarts' }) as any
    const totalPoints = echart.props('option').series.reduce((n: number, s: any) => n + s.data.length, 0)
    expect(totalPoints).toBe(4)
  })

  it('renders 5 rows with the expected columns', async () => {
    const wrapper = mountStage()
    await flushPromises()
    await nextTick()

    const html = wrapper.html()
    expect(html).toContain('Annotation')
    expect(html).toContain('LFC')
    expect(html).toContain('p-Value')
    expect(html).toContain('FDR')
    expect(html).toContain('det. A')
    expect(html).toContain('det. B')
  })

  it('starts with orderBy "fdr ASC" matching the resolver contract', async () => {
    mountStage()
    await flushPromises()
    await nextTick()
    // Resolver was extended to honour direction; the page sends "<col>
    // ASC|DESC" so clicking the same column's arrow flips the order.
    expect(lastVariables.orderBy).toBe('fdr ASC')
  })

  it('omits the n A / n B columns by default', async () => {
    const wrapper = mountStage()
    await flushPromises()
    await nextTick()

    const cols = wrapper.findAllComponents(ElTableColumn)
    const labels = cols.map((c) => c.props('label'))
    expect(labels).not.toContain('n A')
    expect(labels).not.toContain('n B')
  })

  it('formats pValue as scientific notation and renders n/a when null', async () => {
    const wrapper = mountStage()
    await flushPromises()
    await nextTick()
    const cols = wrapper.findAllComponents(ElTableColumn)
    const pValueCol = cols.find((c) => c.props('prop') === 'pValue')!
    const fmt = pValueCol.props('formatter') as (row: any) => string
    expect(typeof fmt).toBe('function')
    // Values in the [0.001, 1000) range render as fixed-3, outside as scientific.
    expect(fmt(mockRows[0])).toBe('0.001')
    expect(fmt(mockRows[4])).toBe('—')
  })

  it('formats lfc to 2 decimals (matches diff-analysis table)', async () => {
    const wrapper = mountStage()
    await flushPromises()
    await nextTick()
    const cols = wrapper.findAllComponents(ElTableColumn)
    const lfcCol = cols.find((c) => c.props('prop') === 'lfc')!
    const fmt = lfcCol.props('formatter') as (row: any) => string
    expect(fmt({ lfc: 0.08225768 })).toBe('0.08')
  })

  it('formats det.A and det.B as percentages', async () => {
    const wrapper = mountStage()
    await flushPromises()
    await nextTick()
    const cols = wrapper.findAllComponents(ElTableColumn)
    const detACol = cols.find((c) => c.props('prop') === 'detectionRateA')!
    const detBCol = cols.find((c) => c.props('prop') === 'detectionRateB')!
    const fmtA = detACol.props('formatter') as (row: any) => string
    const fmtB = detBCol.props('formatter') as (row: any) => string
    expect(fmtA({ detectionRateA: 0.9 })).toBe('90%')
    expect(fmtB({ detectionRateB: 0.4 })).toBe('40%')
  })

  it('renders omnibus rows with "—" for null pair-scoped fields', async () => {
    const omnibusRow = {
      ion: { id: 99, ion: 'C2H4O+H', formula: 'C2H4O', adduct: '+H' },
      labelGroupName: 'lg1',
      condA: null,
      condB: null,
      lfc: null,
      pValue: 0.01,
      fdr: 0.03,
      nA: null,
      nB: null,
      meanA: null,
      meanB: null,
      detectionRateA: null,
      detectionRateB: null,
    }
    ;(useQuery as any).mockImplementation((doc: any) => {
      const opName = doc?.definitions?.[0]?.name?.value
      if (opName === 'experimentResults') {
        return { result: ref({ experimentResults: [omnibusRow] }), loading: ref(false), error: ref(null) }
      }
      return { result: ref({ experimentIonIntensities: [] }), loading: ref(false), error: ref(null) }
    })

    const wrapper = mountStage()
    await flushPromises()
    await nextTick()

    const cols = wrapper.findAllComponents(ElTableColumn)
    const lfcCol = cols.find((c) => c.props('prop') === 'lfc')!
    const detACol = cols.find((c) => c.props('prop') === 'detectionRateA')!
    const detBCol = cols.find((c) => c.props('prop') === 'detectionRateB')!
    expect((lfcCol.props('formatter') as any)(omnibusRow)).toBe('—')
    expect((detACol.props('formatter') as any)(omnibusRow)).toBe('—')
    expect((detBCol.props('formatter') as any)(omnibusRow)).toBe('—')
  })

  it('shows contrast selector when conditions count >= 3', async () => {
    const rowsK3 = [
      { ...mockRows[0], ion: { id: 11, ion: 'X', formula: 'X', adduct: '' }, condA: 'a', condB: 'b' },
      { ...mockRows[0], ion: { id: 12, ion: 'Y', formula: 'Y', adduct: '' }, condA: 'a', condB: 'c' },
      { ...mockRows[0], ion: { id: 13, ion: 'Z', formula: 'Z', adduct: '' }, condA: 'b', condB: 'c' },
    ]
    ;(useQuery as any).mockImplementation((doc: any) => {
      const opName = doc?.definitions?.[0]?.name?.value
      if (opName === 'experimentResults') {
        return { result: ref({ experimentResults: rowsK3 }), loading: ref(false), error: ref(null) }
      }
      return { result: ref({ experimentIonIntensities: [] }), loading: ref(false), error: ref(null) }
    })

    const wrapper = mountStage()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test-key="contrast-selector"]').exists()).toBe(true)
  })

  it('hides contrast selector for K=2 experiments (single pair)', async () => {
    const rowsK2 = mockRows.map((r) => ({ ...r, condA: 'ctrl', condB: 'trt' }))
    ;(useQuery as any).mockImplementation((doc: any) => {
      const opName = doc?.definitions?.[0]?.name?.value
      if (opName === 'experimentResults') {
        return { result: ref({ experimentResults: rowsK2 }), loading: ref(false), error: ref(null) }
      }
      return { result: ref({ experimentIonIntensities: [] }), loading: ref(false), error: ref(null) }
    })

    const wrapper = mountStage()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test-key="contrast-selector"]').exists()).toBe(false)
  })

  it('volcano select wires the strip plot with the matching ion id', async () => {
    const wrapper = mountStage()
    await flushPromises()
    await nextTick()

    const volcano = wrapper.findComponent(VolcanoPlot)
    volcano.vm.$emit('select', 4)
    await nextTick()

    const strip = wrapper.findComponent(IntensityStripPlot)
    expect(strip.exists()).toBe(true)
    expect(strip.props('ionId')).toBe(4)
    expect(strip.props('fdr')).toBe(0.005)
  })
})
