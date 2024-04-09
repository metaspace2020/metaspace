import DatasetOverviewPage from './DatasetOverviewPage'
import { nextTick, ref, h, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import store from '../../../store'
import router from '../../../router'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))
vi.mock('./DatasetActionsDropdown', () => ({ default: vi.fn() }))
vi.mock('../../../components/NewFeatureBadge', () => ({ default: vi.fn() }))

let graphqlMocks
describe('DatasetOverviewPage', () => {
  const mockDataset = {
    id: 'dataset1',
    name: 'JD_Sampe',
    submitter: {
      id: 'userid',
      name: 'John Doe',
      email: 'jdoe@test.com',
    },
    principalInvestigator: {
      name: 'Test',
      email: 'jdoe@test.com',
    },
    group: {
      id: 'gxxxx',
      name: 'TEST_GROUP',
      shortName: 'TG',
    },
    groupApproved: true,
    projects: [
      {
        id: 'pj1',
        name: 'Test',
        publicationStatus: 'UNPUBLISHED',
      },
    ],
    isPublic: true,
    status: 'FINISHED',
    statusUpdateDT: '2021-03-22T01:54:04.856Z',
    metadataType: 'Imaging MS',
    canEdit: true,
    canDelete: true,
    canDownload: true,
    uploadDT: '2021-03-11T14:29:21.641Z',
    metadataJson: JSON.stringify({
      Metadata_Type: 'Imaging MS',
      MS_Analysis: {
        Detector_Resolving_Power: { mz: 1234, Resolving_Power: 123456 },
      },
    }),
    configJson: JSON.stringify({
      database_ids: [1],
      analysis_version: 3,
      isotope_generation: {
        adducts: ['+H'],
        charge: 1,
        isocalc_sigma: 0.001238,
        instrument: 'Orbitrap',
        n_peaks: 4,
        neutral_losses: [],
        chem_mods: [],
      },
      fdr: {
        decoy_sample_size: 20,
        scoring_model_id: 1,
        model_type: 'catboost',
      },
      image_generation: {
        ppm: 3,
        n_levels: 30,
        min_px: 1,
        compute_unused_metrics: false,
      },
    }),
    description: JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Dataset 1.',
            },
          ],
        },
      ],
    }),
  }

  const testHarness = defineComponent({
    components: {
      DatasetOverviewPage,
    },
    setup(props, { attrs }) {
      return () => h(DatasetOverviewPage, { ...attrs, ...props })
    },
  })

  const mockGraphql = async (qyeryParams) => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => qyeryParams,
    })
    ;(useQuery as any).mockReturnValue({
      result: ref(Object.keys(qyeryParams).reduce((acc, key) => ({ ...acc, [key]: qyeryParams[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    })
  }

  const noDatasetQuery = async () => {
    await mockGraphql({
      dataset: () => null,
      currentUser: () => ({ id: 'userid', role: 'user' }),
    })
  }
  const overviewQuery = async () => {
    await mockGraphql({
      dataset: () => mockDataset,
      currentUser: () => ({ id: 'userid', role: 'user' }),
    })
  }

  beforeAll(async () => {
    await router.replace({
      name: 'dataset-overview',
      params: {
        dataset_id: 'dataset1',
      },
    })
  })

  it('should match snapshot when dataset exist', async () => {
    await overviewQuery()
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

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should match snapshot when dataset does not exist', async () => {
    await noDatasetQuery()
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

    expect(wrapper.html()).toMatchSnapshot()
  })
})
