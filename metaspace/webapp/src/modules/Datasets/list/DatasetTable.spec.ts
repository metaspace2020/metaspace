import { mount } from '@vue/test-utils'
import DatasetTable from './DatasetTable.vue'
import router from '../../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import * as FileSaver from 'file-saver'
import { merge } from 'lodash-es'
import { mockGenerateId, resetGenerateId } from '../../../../tests/utils/mockGenerateId'
jest.mock('file-saver')
const mockFileSaver = FileSaver as jest.Mocked<typeof FileSaver>

Vue.use(Vuex)
sync(store, router)

const blobToText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.addEventListener('load', () => { resolve(reader.result as string) })
  reader.addEventListener('error', (e) => { reject((e as any).error) })
  reader.readAsText(blob)
})

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
    jest.useRealTimers()
    resetGenerateId()
  })

  it('should match snapshot', async() => {
    mockGenerateId(123)
    initMockGraphqlClient({
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
    const wrapper = mount(DatasetTable, { parentComponent: { store, router }, apolloProvider })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })

  it('should be able to export a CSV', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allDatasets: (_: any, { filter: { status }, offset }: any) => {
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
    const wrapper = mount(DatasetTable, { parentComponent: { store, router }, apolloProvider })
    wrapper.setData({ csvChunkSize: 2 })
    await Vue.nextTick()

    await (wrapper.vm as any).startExport()
    expect(mockFileSaver.saveAs).toBeCalled()
    const blob: Blob = mockFileSaver.saveAs.mock.calls[0][0]
    const csv = await blobToText(blob)
    const csvWithoutDateHeader = csv.replace(/# Generated at .*\n/, '')

    expect(csvWithoutDateHeader).toMatchSnapshot()
  })
})
