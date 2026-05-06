import { ref, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery, useMutation } from '@vue/apollo-composable'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
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

const buildExperiment = (status = 'RUNNING') => ({
  experiment: {
    id: 'e1',
    name: 'My experiment',
    project: { id: 'p1' },
    run: {
      status,
      stage: 'TEST',
      generation: 0,
      error: null,
      inferredTest: null,
      filters: null,
      excludedSamples: [],
      startedAt: null,
      finishedAt: null,
    },
  },
})

describe('ExperimentResultsPage', () => {
  let mockClient: any
  let resultRef: any
  let stopPolling: any
  let startPolling: any

  beforeAll(async () => {
    mockClient = await initMockGraphqlClient({ Query: () => ({}) })
  })

  beforeEach(() => {
    resultRef = ref(buildExperiment('RUNNING'))
    stopPolling = vi.fn()
    startPolling = vi.fn()
    ;(useQuery as any).mockImplementation((doc: any) => {
      const docName = doc?.definitions?.[0]?.name?.value ?? ''
      if (docName === 'experimentRunStatus') {
        return { result: resultRef, loading: ref(false), stopPolling, startPolling }
      }
      return { result: ref(null), loading: ref(false), stopPolling: vi.fn(), startPolling: vi.fn() }
    })
    ;(useMutation as any).mockReturnValue({ mutate: vi.fn().mockResolvedValue({}), loading: ref(false) })
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
    expect(html).toContain('Stage 1: Sample QC')
    expect(html).toContain('Stage 2: Explore')
    expect(html).toContain('Stage 3: Results')
    expect(wrapper.find('[data-test-key="experiment-stepper"]').exists()).toBe(true)
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
})
