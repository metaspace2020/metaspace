import { ref, nextTick, defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery, useMutation } from '@vue/apollo-composable'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'

vi.mock('vue-echarts', () => ({
  default: defineComponent({ name: 'echarts', props: ['option'], render: () => null }),
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ BarChart: {}, BoxplotChart: {}, ScatterChart: {} }))
vi.mock('echarts/components', () => ({
  GridComponent: {},
  TooltipComponent: {},
  LegendComponent: {},
  TitleComponent: {},
  MarkLineComponent: {},
  MarkAreaComponent: {},
}))

import ExperimentResultsPage from './ExperimentResultsPage'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const actual: any = await vi.importActual('vue-router')
  return {
    ...actual,
    useRoute: () => ({ params: { id: 'e1', projectId: 'p1' }, query: {} }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  }
})

const buildExperiment = (
  status = 'RUNNING',
  overrides: { filters?: any; excludedSamples?: string[]; generation?: number } = {}
) => ({
  experiment: {
    id: 'e1',
    name: 'My experiment',
    project: { id: 'p1' },
    run: {
      status,
      stage: 'TEST',
      generation: overrides.generation ?? 0,
      error: null,
      inferredTest: null,
      filters: overrides.filters ?? null,
      excludedSamples: overrides.excludedSamples ?? [],
      startedAt: null,
      finishedAt: null,
    },
  },
})

describe('ExperimentResultsPage', () => {
  let mockClient: any
  let resultRef: any
  let resultsRef: any
  let stopPolling: any
  let startPolling: any
  let runExperimentStatsMock: any
  let runExperimentMock: any

  beforeAll(async () => {
    mockClient = await initMockGraphqlClient({ Query: () => ({}) })
  })

  beforeEach(() => {
    resultRef = ref(buildExperiment('RUNNING'))
    resultsRef = ref<{ experimentResults: any[] } | null>({ experimentResults: [] })
    stopPolling = vi.fn()
    startPolling = vi.fn()
    ;(useQuery as any).mockImplementation((doc: any) => {
      const docName = doc?.definitions?.[0]?.name?.value ?? ''
      if (docName === 'experimentRunStatus') {
        return { result: resultRef, loading: ref(false), stopPolling, startPolling }
      }
      if (docName === 'experimentResults') {
        return { result: resultsRef, loading: ref(false), stopPolling: vi.fn(), startPolling: vi.fn() }
      }
      return { result: ref(null), loading: ref(false), stopPolling: vi.fn(), startPolling: vi.fn() }
    })
    runExperimentStatsMock = vi.fn().mockResolvedValue({})
    runExperimentMock = vi.fn().mockResolvedValue({})
    ;(useMutation as any).mockImplementation((doc: any) => {
      const docName = doc?.definitions?.[0]?.name?.value ?? ''
      if (docName === 'runExperimentStats') {
        return { mutate: runExperimentStatsMock, loading: ref(false) }
      }
      return { mutate: runExperimentMock, loading: ref(false) }
    })
  })

  const mountPage = () =>
    mount(ExperimentResultsPage, {
      global: { provide: { [DefaultApolloClient]: mockClient } },
    })

  it('renders all 3 stage names and starts on Stage 1', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    const html = wrapper.html()
    expect(html).toContain('Sample QC')
    expect(html).toContain('Explore')
    expect(html).toContain('Results')
    expect(wrapper.find('[data-test-key="experiment-stepper"]').exists()).toBe(true)
    expect(wrapper.find('[data-test-key="stage-card-0"]').exists()).toBe(true)
    expect(wrapper.find('[data-test-key="stage-card-2"]').exists()).toBe(true)
    // Stage 1 (SampleQcStage) should be the active panel
    expect(html).toContain('Sample quality control')
  })

  it('stops polling when run.status transitions from RUNNING to FINISHED', async () => {
    mountPage()
    await flushPromises()
    await nextTick()

    expect(stopPolling).not.toHaveBeenCalled()

    resultRef.value = buildExperiment('FINISHED')
    await nextTick()
    await flushPromises()

    expect(stopPolling).toHaveBeenCalled()
  })

  describe('initial-stage selection', () => {
    const visitedKey = 'metaspace:experiment:e1:visitedStage3'
    beforeEach(() => {
      try {
        localStorage.removeItem(visitedKey)
      } catch {
        /* ignore */
      }
    })
    afterEach(() => {
      try {
        localStorage.removeItem(visitedKey)
      } catch {
        /* ignore */
      }
    })

    it('lands on Stage 3 (idx=2) when status=FINISHED, results exist, AND st3 is set', async () => {
      localStorage.setItem(visitedKey, '1')
      resultRef.value = buildExperiment('FINISHED', { filters: {}, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      expect((wrapper.vm as any).currentStage).toBe(2)
    })

    it('lands on Stage 1 (idx=0) on first-ever visit even when runStatus=FINISHED and results (no St3)', async () => {
      resultRef.value = buildExperiment('FINISHED', { filters: {}, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      expect((wrapper.vm as any).currentStage).toBe(0)
    })

    it('persists the visitedStage3 flag once the user reaches Stage 3', async () => {
      resultRef.value = buildExperiment('FINISHED', { filters: { fdrMax: 0.1 }, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      expect(localStorage.getItem(visitedKey)).toBeNull()
      ;(wrapper.vm as any).currentStage = 2
      await nextTick()
      expect(localStorage.getItem(visitedKey)).toBe('1')
    })

    it('lands on Stage 1 (idx=0) when runStatus=FINISHED but results count is 0', async () => {
      resultRef.value = buildExperiment('FINISHED', { filters: {}, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      expect((wrapper.vm as any).currentStage).toBe(0)
    })

    it('lands on Stage 1 (idx=0) when runStatus is QUEUED', async () => {
      resultRef.value = buildExperiment('QUEUED', { filters: {}, excludedSamples: [] })
      resultsRef.value = { experimentResults: [] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      expect((wrapper.vm as any).currentStage).toBe(0)
    })
  })

  describe('isResultsDirty', () => {
    it('is true when the Stage-2 filter diverges from saved', async () => {
      resultRef.value = buildExperiment('FINISHED', { filters: { fdrMax: 0.1 }, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      ;(wrapper.vm as any).handleFilterChange({ fdrMax: 0.05 })
      await nextTick()
      expect((wrapper.vm as any).isResultsDirty).toBe(true)
    })

    it('is true when the excluded-samples list diverges from saved', async () => {
      resultRef.value = buildExperiment('FINISHED', { filters: {}, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      ;(wrapper.vm as any).handleExcludedSamplesChange(['s1'])
      await nextTick()
      expect((wrapper.vm as any).isResultsDirty).toBe(true)
    })

    it('is false when current state equals saved', async () => {
      resultRef.value = buildExperiment('FINISHED', {
        filters: { fdrMax: 0.1 },
        excludedSamples: ['s1'],
        generation: 1,
      })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      ;(wrapper.vm as any).handleFilterChange({ fdrMax: 0.1 })
      ;(wrapper.vm as any).handleExcludedSamplesChange(['s1'])
      await nextTick()
      expect((wrapper.vm as any).isResultsDirty).toBe(false)
    })
  })

  describe('onClickNext on Stage 2 (idx=1)', () => {
    it('fires runExperimentStats when dirty and sets pendingAdvanceToResults', async () => {
      resultRef.value = buildExperiment('FINISHED', { filters: {}, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      ;(wrapper.vm as any).currentStage = 1
      await nextTick()
      await flushPromises()
      ;(wrapper.vm as any).handleFilterChange({ fdrMax: 0.05 })
      await (wrapper.vm as any).onClickNext()
      expect(runExperimentStatsMock).toHaveBeenCalled()
      const variables = runExperimentStatsMock.mock.calls[0][0]
      expect(variables).toMatchObject({
        id: 'e1',
        filter: { fdrMax: 0.05 },
        excludedSamples: [],
      })
      expect((wrapper.vm as any).pendingAdvanceToResults).toBe(true)
    })

    it('advances without mutation when not dirty', async () => {
      resultRef.value = buildExperiment('FINISHED', {
        filters: { fdrMax: 0.1 },
        excludedSamples: [],
        generation: 1,
      })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      ;(wrapper.vm as any).currentStage = 1
      ;(wrapper.vm as any).handleFilterChange({ fdrMax: 0.1 })
      await nextTick()
      await (wrapper.vm as any).onClickNext()
      expect(runExperimentStatsMock).not.toHaveBeenCalled()
      expect((wrapper.vm as any).currentStage).toBe(2)
    })
  })

  describe('runStatus watcher', () => {
    it('flips to Stage 3 on RUNNING_STATS -> FINISHED with pendingAdvanceToResults', async () => {
      resultRef.value = buildExperiment('RUNNING_STATS', { filters: {}, excludedSamples: [], generation: 1 })
      resultsRef.value = { experimentResults: [{ ion: { id: 1 } }] }
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      ;(wrapper.vm as any).currentStage = 1
      ;(wrapper.vm as any).handleFilterChange({ fdrMax: 0.1 })
      ;(wrapper.vm as any).pendingAdvanceToResults = true
      await nextTick()
      resultRef.value = buildExperiment('FINISHED', { filters: { fdrMax: 0.1 }, excludedSamples: [], generation: 1 })
      await nextTick()
      await flushPromises()
      expect((wrapper.vm as any).currentStage).toBe(2)
      expect((wrapper.vm as any).pendingAdvanceToResults).toBe(false)
    })
  })
})
