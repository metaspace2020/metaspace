import { nextTick, ref, h, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store'
import SegmentationPage from './SegmentationPage'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import {
  getDatasetByIdQuery,
  getDatasetDiagnosticsQuery,
  getSegmentationsQuery,
  opticalImagesQuery,
  getSegmentationIonProfilesWithImagesQuery,
} from '../../../api/dataset'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

// echarts cannot initialise a renderer under jsdom; the charts are not what this spec asserts on.
vi.mock('vue-echarts', () => ({ default: vi.fn() }))
vi.mock('echarts', () => ({ default: vi.fn() }))
vi.mock('echarts/core', () => ({ default: vi.fn(), use: vi.fn() }))

// setupTests only stubs SVGs loaded through `defineAsyncComponent`; this page imports two
// statically, which Vitest resolves to URL strings that cannot be used as components.
vi.mock('../../../assets/inline/material/aspect-ratio.svg', () => ({
  default: defineComponent({ template: '<svg />' }),
}))
vi.mock('../../../assets/inline/refactoring-ui/icon-monitor.svg', () => ({
  default: defineComponent({ template: '<svg />' }),
}))

let graphqlMocks: any

describe('SegmentationPage', () => {
  const datasetId = '2021-03-11_08h29m21s'

  // Real-shaped SEGMENTATION diagnostic so the page renders its full content rather than the
  // "No segmentation data available" placeholder.
  const mockSegmentationData = {
    algorithm: 'kmeans',
    map_type: 'segmentation',
    n_segments: 2,
    parameters_used: {
      n_components: 2,
      variance_threshold: 0.9,
      k: 2,
      k_range: [2, 4],
      criterion: 'bic',
    },
    segment_summary: [
      { id: 0, size_px: 120, coverage_fraction: 0.6, top_ions: ['C1H2'] },
      { id: 1, size_px: 80, coverage_fraction: 0.4, top_ions: ['C3H4'] },
    ],
    diagnostics: {
      bic_curve: null,
      explained_variance: [0.7, 0.2],
      spatial_weights: null,
    },
  }

  const mockDiagnostics = {
    dataset: {
      id: datasetId,
      diagnostics: [
        {
          id: 'diag1',
          type: 'SEGMENTATION',
          data: JSON.stringify(mockSegmentationData),
          images: [],
        },
      ],
    },
  }

  const mockQueryResult = (result: any, loading = false) => ({
    result: ref(result),
    loading: ref(loading),
    error: ref(null),
    refetch: vi.fn(),
    onResult: vi.fn(),
  })

  // Routes each useQuery call to a canned result based on which document was passed. Any query
  // this spec does not know about throws, so a future query fails loudly instead of silently
  // returning undefined.
  const mockQueries = ({ diagnosticsLoading = false }: { diagnosticsLoading?: boolean } = {}) => {
    ;(useQuery as any).mockImplementation((query: any) => {
      if (query === getDatasetByIdQuery) {
        return mockQueryResult({ dataset: { id: datasetId, name: 'JD_Sample' } })
      }
      if (query === getSegmentationsQuery) {
        return mockQueryResult({ segmentations: [] })
      }
      if (query === getDatasetDiagnosticsQuery) {
        return mockQueryResult(mockDiagnostics, diagnosticsLoading)
      }
      if (query === opticalImagesQuery) {
        return mockQueryResult({ dataset: { id: datasetId, opticalImages: [] } })
      }
      if (query === getSegmentationIonProfilesWithImagesQuery) {
        return mockQueryResult({ segmentationIonProfiles: [] })
      }
      throw new Error('Unexpected query passed to useQuery')
    })
  }

  const testHarness = defineComponent({
    components: {
      SegmentationPage,
    },
    setup(props, { attrs }) {
      return () => h(SegmentationPage, { ...attrs, ...props })
    },
  })

  const mountPage = async (options: { diagnosticsLoading?: boolean } = {}) => {
    mockQueries(options)

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })

    await flushPromises()
    await nextTick()

    return wrapper
  }

  beforeAll(async () => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => ({}),
    })
    await router.replace({
      name: 'dataset-segmentation',
      params: { dataset_id: datasetId },
    })
  })

  // Segmentation is no longer Pro-gated: any user may view the page. Free users' usage
  // limits are enforced server-side when a segmentation job is submitted.
  it('should render segmentation content without requiring a Pro subscription', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('.page-header').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('METASPACE Pro feature')
  })

  it('should show the loading state while diagnostics are loading', async () => {
    const wrapper = await mountPage({ diagnosticsLoading: true })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
    expect(wrapper.find('.page-header').exists()).toBe(false)
  })
})
