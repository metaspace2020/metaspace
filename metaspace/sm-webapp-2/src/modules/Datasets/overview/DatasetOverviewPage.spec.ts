import { mount } from '@vue/test-utils'
import DatasetOverviewPage from './DatasetOverviewPage'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../../store'
import router from '../../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'

jest.mock('./DatasetActionsDropdown', () => ({ default: jest.fn() }))
jest.mock('../../../components/NewFeatureBadge', () => ({ default: jest.fn() }))

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
      database_ids: [
        1,
      ],
      analysis_version: 3,
      isotope_generation: {
        adducts: [
          '+H',
        ],
        charge: 1,
        isocalc_sigma: 0.001238,
        instrument: 'Orbitrap',
        n_peaks: 4,
        neutral_losses: [],
        chem_mods: [],
      },
      fdr: {
        decoy_sample_size: 20,
        scoring_model: 'v3_default',
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

  const testHarness = Vue.extend({
    components: {
      DatasetOverviewPage,
    },
    render(h) {
      return h(DatasetOverviewPage, { props: this.$attrs })
    },
  })

  const noDatasetQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        dataset: () => null,
        currentUser: () => ({ id: 'userid', role: 'user' }),
      }),
    })
  }
  const overviewQuery = () => {
    initMockGraphqlClient({
      Query: () => ({
        dataset: () => mockDataset,
        currentUser: () => ({ id: 'userid', role: 'user' }),
      }),
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
    router.replace({
      name: 'dataset-overview',
      params: {
        dataset_id: 'dataset1',
      },
    })
  })

  it('should match snapshot when dataset exist', async() => {
    overviewQuery()
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot when dataset does not exist', async() => {
    noDatasetQuery()
    const wrapper = mount(testHarness, { store, router, apolloProvider })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })
})
