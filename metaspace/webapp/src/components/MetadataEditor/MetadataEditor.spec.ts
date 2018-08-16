import { mount, config as testConfig } from '@vue/test-utils';
import VueRouter from 'vue-router';
import ElementUI from 'element-ui';
import Vue from 'vue';
import MetadataEditor from './MetadataEditor.vue';
import router from '../../router';
import registerMockComponent from '../../../tests/utils/registerMockComponent';
import { restoreConsole, suppressConsoleWarn } from '../../../tests/utils/suppressConsole';
import { initMockGraphqlClient, provide } from '../../../tests/utils/mockGraphqlClient';
import store from '../../store';

Vue.use(ElementUI);
registerMockComponent('el-dialog'); // ElDialogs mount their content somewhere else in the DOM. Mock it out so that the snapshot includes the content.
registerMockComponent('el-popover');
registerMockComponent('el-autocomplete');
registerMockComponent('el-select');
registerMockComponent('el-option');
Vue.use(VueRouter);


describe('MetadataEditor', () => {
  const mockMetadata = {
    Data_Type: 'Imaging MS',
    Sample_Information: { Organism: 'Human', Organism_Part: 'Liver', Condition: 'Live', Sample_Growth_Conditions: 'N/A', },
    Sample_Preparation: { Sample_Stabilisation: 'foo', Tissue_Modification: 'bar', MALDI_Matrix: 'baz', MALDI_Matrix_Application: 'qux', Solvent: 'quux', },
    MS_Analysis: { Polarity: 'Positive', Ionisation_Source: 'none', Analyzer: 'none', Detector_Resolving_Power: { mz: 123, Resolving_Power: 123456 }, },
    Additional_Information: { Supplementary: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
  };
  const mockDataset = {
    molDBs: ['molecularDatabases.1.name'],
    metadataJson: JSON.stringify(mockMetadata),
  };

  beforeAll(async () => {
    testConfig.logModifiedComponents = false;
    store.replaceState({
      ...store.state,
      route: { path: '/upload', query: {} }
    })
  });

  beforeEach(() => {
    jest.resetAllMocks();
    // suppressConsoleWarn('async-validator:');
  });

  afterEach(() => {
    // restoreConsole();
  });

  it('should match snapshot', async () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => null // Prevent automatic mocking
      })
    });
    const wrapper = mount(MetadataEditor, { store, router, provide, sync: false });
    await wrapper.vm.$data.loadingPromise;

    expect(wrapper).toMatchSnapshot();
  });

  it('should be able to load an existing dataset', async () => {
    initMockGraphqlClient({
      Query: () => ({
        dataset: () => mockDataset
      })
    });
    const propsData = { datasetId: '123' };
    const wrapper = mount(MetadataEditor, { store, router, provide, propsData, sync: false });
    await wrapper.vm.$data.loadingPromise;

    expect(wrapper.vm.$data.value).toMatchSnapshot('metadata');
    expect(wrapper.vm.$data.metaspaceOptions).toMatchSnapshot('metaspaceOptions');
  });

  it('should load the user\'s last dataset when present', async () => {
    initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => mockDataset
      })
    });

    const wrapper = mount(MetadataEditor, { store, router, provide, sync: false });
    await wrapper.vm.$data.loadingPromise;

    const fieldValues: Record<string, string> = {};
    wrapper.findAll({name: 'FormField'}).wrappers
      .forEach(field => { fieldValues[field.vm.$props.name] = field.vm.$props.value; });

    expect(fieldValues['Organism']).toEqual(mockMetadata.Sample_Information.Organism);
    expect(fieldValues['Sample stabilisation']).toEqual(mockMetadata.Sample_Preparation.Sample_Stabilisation);
    expect(fieldValues['Polarity']).toEqual(mockMetadata.MS_Analysis.Polarity);
    expect(fieldValues['Supplementary']).toEqual(mockMetadata.Additional_Information.Supplementary);
  });
});
