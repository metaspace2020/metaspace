import {flushPromises, mount} from '@vue/test-utils'
import { nextTick } from 'vue'
import MetadataEditor from './MetadataEditor.vue'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import {
  mockAdductSuggestions,
  mockMolecularDatabases,
} from '../../tests/utils/mockGraphqlData'
import store from "../../store";
import router from "../../router";
import {DefaultApolloClient} from "@vue/apollo-composable";



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
  });

  beforeEach(() => {
    vi.resetAllMocks()
    // suppressConsoleWarn('async-validator:');
  });

  afterEach(() => {
    // restoreConsole();
  });

  it('should match snapshot', async() => {
    const graphqlMockClient =  initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => null, // Prevent automatic mocking
        adductSuggestions: mockAdductSuggestions,
        allMolecularDBs: mockMolecularDatabases,
      }),
    })
    const wrapper = mount(MetadataEditor, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
    });
    await wrapper.vm.state.loadingPromise
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should be able to load an existing dataset', async() => {
    const graphqlMockClient =  initMockGraphqlClient({
      Query: () => ({
        dataset: () => mockDataset,
      }),
    })
    const propsData = { datasetId: '123' }
    const wrapper = mount(MetadataEditor, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: propsData
    });
    await wrapper.vm.state.loadingPromise

    await flushPromises();
    await nextTick();

    expect(wrapper.vm.state.value).toMatchSnapshot('metadata')
    expect(wrapper.vm.state.metaspaceOptions).toMatchSnapshot('metaspaceOptions')
  });

  it('should load the user\'s last dataset when present', async() => {
    const graphqlMockClient =  initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => mockDataset,
      }),
    })
    const wrapper = mount(MetadataEditor, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      }
    });
    await wrapper.vm.state.loadingPromise

    await flushPromises();
    await nextTick();

    const fieldValues: Record<string, string> = {}
    wrapper.findAllComponents({ name: 'FormField' }).forEach((fieldWrapper) => {
      const fieldName = fieldWrapper.props('name');
      const fieldValue = fieldWrapper.props('value');
      fieldValues[fieldName] = fieldValue;
    });

    expect(fieldValues['Organism']).toEqual(mockMetadata.Sample_Information.Organism);
    expect(fieldValues['Sample stabilisation']).toEqual(mockMetadata.Sample_Preparation.Sample_Stabilisation);
    expect(fieldValues['Polarity']).toEqual(mockMetadata.MS_Analysis.Polarity);
    expect(fieldValues['Detector resolving power']).toEqual(mockMetadata.MS_Analysis.Detector_Resolving_Power);
  });

  it('should be able to load another user\'s dataset', async() => {
    const submitterId = 'submitter id'
    const mockUser = {
      id: submitterId,
      name: 'mock user',
      groups: [{ group: { id: 'group', name: 'group name' } }],
    }
    const mockUserFn = vi.fn().mockReturnValue(mockUser)
    const graphqlMockClient =  initMockGraphqlClient({
      Query: () => ({
        dataset: () => ({ ...mockDataset, submitter: { id: submitterId } }),
        user: mockUserFn,
      }),
    })
    const propsData = { datasetId: '123' }
    const wrapper = mount(MetadataEditor, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
      props: propsData
    });
    await wrapper.vm.state.loadingPromise

    await flushPromises();
    await nextTick();

    expect(mockUserFn).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.state.submitter).toMatchObject(mockUser)
  });


});
