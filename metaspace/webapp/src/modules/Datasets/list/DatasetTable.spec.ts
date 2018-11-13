import { mount, config as testConfig } from '@vue/test-utils';
import DatasetTable from './DatasetTable.vue';
import router from '../../../router';
import { initMockGraphqlClient, provide } from '../../../../tests/utils/mockGraphqlClient';
import store from '../../../store/index';
import Vue from 'vue';
import Vuex from 'vuex';
import { sync } from 'vuex-router-sync';
jest.mock('file-saver');
import * as FileSaver from 'file-saver';
const mockFileSaver = FileSaver as jest.Mocked<typeof FileSaver>;

Vue.use(Vuex);
sync(store, router);

const blobToText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => { resolve(reader.result) });
  reader.addEventListener('error', (e) => { reject((e as any).error) });
  reader.readAsText(blob);
});

describe('DatasetTable', () => {
  const mockMetadataJson = JSON.stringify({
    Metadata_Type: "Imaging MS",
    MS_Analysis: {
      Detector_Resolving_Power: {mz: 1234, Resolving_Power: 123456}
    },
  });
  const mockFdrCounts = {
    dbName: 'HMDB-v2.5',
    levels: [0.05, 0.1, 0.5],
    counts: [1, 2, 20],
  };
  const mockDataset = {
    id: 'REPLACEME',
    status: 'FINISHED',
    metadataJson: mockMetadataJson,
    molDBs: ['HMDB-v2.5', 'HMDB-v4', 'CHEBI'],
    polarity: 'POSITIVE',
    fdrCounts: mockFdrCounts,
    groupApproved: true,
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should match snapshot', async () => {
    initMockGraphqlClient({
      Query: () => ({
        allDatasets: (_: any, {filter:{status}}: any) => {
          return [{...mockDataset, id: `${status}1`, status}]
        },
        countDatasets: () => 1,
      })
    });
    const wrapper = mount(DatasetTable, { store, router, provide, sync: false });
    await wrapper.vm.$data.loadingPromise;
    await Vue.nextTick();

    expect(wrapper).toMatchSnapshot();
  });

  it('should be able to export a CSV', async () => {
    initMockGraphqlClient({
      Query: () => ({
        allDatasets: (_: any, {filter:{status}, offset}: any) => {
          return [
            {...mockDataset, id: `${status}${offset+1}`, status},
            {...mockDataset, groupApproved: false, id: `${status}${offset+2}`, status}
          ]
        },
        countDatasets: () => 4,
      })
    });
    const wrapper = mount(DatasetTable, { store, router, provide, sync: false });
    wrapper.setData({csvChunkSize: 2});
    await Vue.nextTick();

    await (wrapper.vm as any).startExport();
    expect(mockFileSaver.saveAs).toBeCalled();
    const blob: Blob = mockFileSaver.saveAs.mock.calls[0][0];
    const csv = await blobToText(blob);
    const csvWithoutDateHeader = csv.replace(/# Generated at .*\n/, '');

    expect(csvWithoutDateHeader).toMatchSnapshot();
  });
});
