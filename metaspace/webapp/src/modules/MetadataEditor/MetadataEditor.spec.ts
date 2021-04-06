import { mount } from '@vue/test-utils'
import MetadataEditor from './MetadataEditor.vue'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import store from '../../store/index'
import {
  mockAdductSuggestions,
  mockMolecularDatabases,
} from '../../../tests/utils/mockGraphqlData'
import Vue from 'vue'

describe('MetadataEditor', () => {
  /* eslint-disable vue/max-len */
  const mockMetadata = {
    Data_Type: 'Imaging MS',
    Sample_Information: { Organism: 'Human', Organism_Part: 'Liver', Condition: 'Live', Sample_Growth_Conditions: 'N/A' },
    Sample_Preparation: { Sample_Stabilisation: 'foo', Tissue_Modification: 'bar', MALDI_Matrix: 'baz', MALDI_Matrix_Application: 'qux', Solvent: 'quux' },
    MS_Analysis: { Polarity: 'Positive', Ionisation_Source: 'none', Analyzer: 'none', Detector_Resolving_Power: { mz: 123, Resolving_Power: 123456 } },
    Additional_Information: { Supplementary: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
  }
  /* eslint-enable vue/max-len */

  const mockDataset = {
    databases: [{ id: mockMolecularDatabases()[0].id }],
    metadataJson: JSON.stringify(mockMetadata),
  }

  beforeAll(async() => {
    store.replaceState({
      ...store.state,
      // @ts-ignore
      route: { path: '/upload', query: {} },
    })
  })

  beforeEach(() => {
    jest.resetAllMocks()
    // suppressConsoleWarn('async-validator:');
  })

  afterEach(() => {
    // restoreConsole();
  })

  it('should match snapshot', async() => {
    initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => null, // Prevent automatic mocking
        adductSuggestions: mockAdductSuggestions,
        allMolecularDBs: mockMolecularDatabases,
      }),
    })
    const wrapper = mount(MetadataEditor, { store, router, apolloProvider })
    await wrapper.vm.$data.loadingPromise
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should be able to load an existing dataset', async() => {
    initMockGraphqlClient({
      Query: () => ({
        dataset: () => mockDataset,
      }),
    })
    const propsData = { datasetId: '123' }
    const wrapper = mount(MetadataEditor, { store, router, apolloProvider, propsData })
    await wrapper.vm.$data.loadingPromise

    expect(wrapper.vm.$data.value).toMatchSnapshot('metadata')
    expect(wrapper.vm.$data.metaspaceOptions).toMatchSnapshot('metaspaceOptions')
  })

  it('should load the user\'s last dataset when present', async() => {
    initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => mockDataset,
      }),
    })

    const wrapper = mount(MetadataEditor, { store, router, apolloProvider })
    await wrapper.vm.$data.loadingPromise

    const fieldValues: Record<string, string> = {}
    wrapper.findAllComponents({ name: 'FormField' }).wrappers
      .forEach(field => { fieldValues[field.vm.$props.name] = field.vm.$props.value })

    expect(fieldValues.Organism).toEqual(mockMetadata.Sample_Information.Organism)
    expect(fieldValues['Sample stabilisation']).toEqual(mockMetadata.Sample_Preparation.Sample_Stabilisation)
    expect(fieldValues.Polarity).toEqual(mockMetadata.MS_Analysis.Polarity)
    expect(fieldValues['Detector resolving power']).toEqual(mockMetadata.MS_Analysis.Detector_Resolving_Power)
  })

  it('should be able to load another user\'s dataset', async() => {
    const submitterId = 'submitter id'
    const mockUser = {
      id: submitterId,
      name: 'mock user',
      groups: [{ group: { id: 'group', name: 'group name' } }],
    }
    const mockUserFn = jest.fn((src: any, args: any, ctx: any) => mockUser)
    initMockGraphqlClient({
      Query: () => ({
        dataset: () => ({ ...mockDataset, submitter: { id: submitterId } }),
        user: mockUserFn,
      }),
    })
    const propsData = { datasetId: '123' }
    const wrapper = mount(MetadataEditor, { store, router, apolloProvider, propsData })
    await wrapper.vm.$data.loadingPromise

    expect(mockUserFn).toHaveBeenCalledTimes(1)
    expect(mockUserFn.mock.calls[0][1]).toEqual({ userId: submitterId })
    expect(wrapper.vm.$data.submitter).toMatchObject(mockUser)
  })
})
