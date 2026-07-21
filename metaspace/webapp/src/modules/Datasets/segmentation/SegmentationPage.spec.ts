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
import { proFeatureWhitelistQuery } from '../../../api/plan'
import { getActiveUserSubscriptionQuery } from '../../../api/subscription'
import { currentUserRoleQuery } from '../../../api/user'

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

  // Real-shaped SEGMENTATION diagnostic, so that a page which wrongly falls through the Pro gate
  // renders its full content rather than the "No segmentation data available" placeholder. Without
  // this the regression test below could pass for the wrong reason.
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

  interface ProOptions {
    whitelist?: string[]
    isActive?: boolean | null
    role?: string | null
    // A plain boolean applies to every Pro query; an object sets each query independently
    // (omitted queries default to settled) so mixed in-flight states can be expressed.
    loading?: boolean | { whitelist?: boolean; subscription?: boolean; user?: boolean }
  }

  const mockQueryResult = (result: any, loading = false) => ({
    result: ref(result),
    loading: ref(loading),
    error: ref(null),
    refetch: vi.fn(),
    onResult: vi.fn(),
  })

  // Routes each useQuery call to a canned result based on which document was passed, so the page's
  // own queries and the `useProFeatures` entitlement queries can be set independently. Any query
  // this spec does not know about throws, so a future query fails loudly instead of silently
  // returning undefined.
  const mockQueries = ({ whitelist = [], isActive = null, role = null, loading = false }: ProOptions = {}) => {
    const isLoading = (key: 'whitelist' | 'subscription' | 'user') =>
      typeof loading === 'boolean' ? loading : loading[key] ?? false
    ;(useQuery as any).mockImplementation((query: any) => {
      // Queries owned by SegmentationPage itself
      if (query === getDatasetByIdQuery) {
        return mockQueryResult({ dataset: { id: datasetId, name: 'JD_Sample' } })
      }
      if (query === getSegmentationsQuery) {
        return mockQueryResult({ segmentations: [] })
      }
      if (query === getDatasetDiagnosticsQuery) {
        return mockQueryResult(mockDiagnostics)
      }
      if (query === opticalImagesQuery) {
        return mockQueryResult({ dataset: { id: datasetId, opticalImages: [] } })
      }
      if (query === getSegmentationIonProfilesWithImagesQuery) {
        return mockQueryResult({ segmentationIonProfiles: [] })
      }
      // Entitlement queries owned by useProFeatures
      if (query === proFeatureWhitelistQuery) {
        return mockQueryResult({ proFeatureWhitelist: whitelist }, isLoading('whitelist'))
      }
      if (query === getActiveUserSubscriptionQuery) {
        return mockQueryResult(
          { activeUserSubscription: isActive === null ? null : { isActive } },
          isLoading('subscription')
        )
      }
      if (query === currentUserRoleQuery) {
        return mockQueryResult(
          { currentUser: role === null ? null : { id: 'u1', name: 'Test', role } },
          isLoading('user')
        )
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

  const mountPage = async (pro: ProOptions) => {
    mockQueries(pro)

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

  // Regression guard: the gate must fail CLOSED. `useProFeatures` puts the subscription query on
  // `cache-and-network`, so `loading` is true on every mount, and resolving a non-Pro user who
  // belongs to groups takes seconds (one billing-API call per group). Gating on
  // `!canUse(...) && !proLoading.value` made this whole window render the full page to a user who
  // is not entitled.
  it('should not render segmentation content to an unentitled user while entitlement is still loading', async () => {
    const wrapper = await mountPage({ role: 'user', loading: { subscription: true } })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
    expect(wrapper.find('.page-header').exists()).toBe(false)
    expect(wrapper.find('.segmentation-info-wrapper').exists()).toBe(false)
  })

  it('should show the Pro upsell to an unentitled user once entitlement has settled', async () => {
    const wrapper = await mountPage({ role: 'user' })

    expect(wrapper.text()).toContain('METASPACE Pro feature')
    expect(wrapper.find('.page-header').exists()).toBe(false)
  })

  it('should render segmentation content for a whitelisted user who is not pro', async () => {
    const wrapper = await mountPage({ whitelist: ['segmentation'], role: 'user' })

    expect(wrapper.find('.page-header').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('METASPACE Pro feature')
  })

  // The mirror of the regression above: an entitled user must not be blocked by the same
  // `cache-and-network` refetch that keeps `proLoading` true.
  it('should render segmentation content for a pro user while entitlement is refetching', async () => {
    const wrapper = await mountPage({ isActive: true, role: 'user', loading: { subscription: true } })

    expect(wrapper.find('.page-header').exists()).toBe(true)
    expect(wrapper.find('.loading-container').exists()).toBe(false)
  })
})
