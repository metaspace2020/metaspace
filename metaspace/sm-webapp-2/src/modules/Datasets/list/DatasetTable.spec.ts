import {nextTick} from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DatasetTable from './DatasetTable.vue';
import * as FileSaver from 'file-saver';
import { merge } from 'lodash-es';
import router from "../../../router";
import store from "../../../store";
import {DefaultApolloClient} from "@vue/apollo-composable";
import {flushPromises, mount} from '@vue/test-utils';
import {initMockGraphqlClient} from "../../../tests/utils/mockGraphqlClient";

vi.mock('file-saver', () => ({
  saveAs: vi.fn()
}));


const blobToText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = (e) => reject(e.target.error);
  reader.readAsText(blob);
});

describe('DatasetTable', () => {
  const mockMetadataJson = JSON.stringify({
    Metadata_Type: 'Imaging MS',
    MS_Analysis: {
      Detector_Resolving_Power: { mz: 1234, Resolving_Power: 123456 },
    },
  })
  const mockFdrCounts = {
    databaseId: 6,
    dbName: 'HMDB',
    dbVersion: 'v2.5',
    levels: [10],
    counts: [20],
  }
  const mockDataset = {
    id: 'REPLACEME',
    status: 'FINISHED',
    metadataJson: mockMetadataJson,
    description: null,
    databases: [
      { name: 'CHEBI', version: '', id: 2 },
      { name: 'HMDB', version: 'v2.5', id: 6 },
      { name: 'HMDB', version: 'v4', id: 22 },
    ],
    polarity: 'POSITIVE',
    fdrCounts: mockFdrCounts,
    groupApproved: true,
    canEdit: false,
    canDelete: false,
  }



  afterEach(() => {
    vi.useRealTimers();
  });


  it('should match snapshot', async () => {
    const graphqlMockClient =  initMockGraphqlClient({
      Query: () => ({
        allDatasets: () => {
          return [
            { ...mockDataset, id: 'ANNOTATING1', status: 'ANNOTATING' },
            { ...mockDataset, id: 'QUEUED1', status: 'QUEUED' },
            { ...mockDataset, id: 'FINISHED1', status: 'FINISHED' },
          ]
        },
        countDatasetsPerGroup: () => ({
          counts: [
            { fieldValues: ['QUEUED'], count: 2 },
            { fieldValues: ['ANNOTATING'], count: 1 },
            { fieldValues: ['FINISHED'], count: 20 },
          ],
        }),
      }),
    })

    const wrapper = mount(DatasetTable, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
    });

    await flushPromises()
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  });


  it('should be able to export a CSV', async () => {
    const graphqlMockClient =  initMockGraphqlClient({
      Query: () => ({
        allDatasets: (_: any, params: any) => {
          const offset = params?.offset || 0
          const filter = params?.filter
          const status = filter?.status || 'FINISHED'

          return [
            merge({}, mockDataset, { principalInvestigator: null, id: `${status}1`, status }),
            merge({}, mockDataset, { principalInvestigator: null, groupApproved: false, id: `${status}2`, status }),
            merge({}, mockDataset, {
              principalInvestigator: null,
              group: { adminNames: ['group', 'admin', 'names'] },
              id: `${status}3`,
              status,
            }),
            merge({}, mockDataset, {
              principalInvestigator: { name: 'principal investigator' },
              id: `${status}4`,
              status,
            }),
          ].slice(offset, offset + 2)
        },
        countDatasets: () => 4,
      }),
    })


    const wrapper = mount(DatasetTable, {
      global: {
        plugins: [router, store],
        provide: {
          [DefaultApolloClient]: graphqlMockClient
        }
      },
    });

    wrapper.vm.state.csvChunkSize = 2
    await new Promise(resolve => setTimeout(resolve, 1))

    await flushPromises();
    await nextTick();

    await (wrapper.vm as any).startExport()
    expect(FileSaver.saveAs).toBeCalled()
    const blob: Blob = (FileSaver.saveAs as any).mock.calls[0][0]
    const csv = await blobToText(blob)
    const csvWithoutDateHeader = csv.replace(/# Generated at .*\n/, '')

    expect(csvWithoutDateHeader).toMatchSnapshot()
  });



});
