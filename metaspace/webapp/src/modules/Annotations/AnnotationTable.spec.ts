import { mount, config as testConfig } from '@vue/test-utils'
import AnnotationTable from './AnnotationTable.vue'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import store from '../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import * as FileSaver from 'file-saver'
import { merge } from 'lodash-es'
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

// HACK: Prevent AnnotationTable from waiting before loading data
delete (AnnotationTable as any).options.apollo.annotations.debounce

describe('AnnotationTable', () => {
  const mockAnnotation = {
    id: '2019-02-12_15h55m06s_HMDB-v4_2018-04-09_C19H18N2O7S2_minus_H',
    sumFormula: 'C19H18N2O7S2',
    adduct: '-H',
    ion: 'C19H18N2O7S2-H+',
    msmScore: 0.657486,
    rhoSpatial: 0.686362,
    rhoSpectral: 0.959122,
    rhoChaos: 0.998756,
    fdrLevel: 0.1,
    mz: 449.0482267014823,
    dataset: {
      id: '2019-02-12_15h55m06s',
      name: 'Untreated_3_434',
      polarity: 'POSITIVE',
      group: {
        id: '20efa10e-d765-11e8-b529-8b73ec16f26e',
        name: 'Laboratory of European Molecular Biology',
      },
      groupApproved: true,
    },
    possibleCompounds: [
      { name: 'C.I. Food Red 6', information: [{ databaseId: 'HMDB0032738' }] },
    ],
    colocalizationCoeff: 0.840809,
    offSample: false,
    offSampleProb: 0.03,
  }
  const propsData = { hideColumns: ['OffSampleProb'] }

  it('should match snapshot', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => ([
          mockAnnotation,
        ]),
        countAnnotations: () => 1,
      }),
    })
    const wrapper = mount(AnnotationTable, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot when loading snapshot', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => ([
          mockAnnotation,
        ]),
        countAnnotations: () => 1,
      }),
    })
    router.replace({
      name: 'annotations',
      query: {
        viewId: 'xxxx',
        ds: '2019-02-12_15h55m06s',
      },
    })
    const wrapper = mount(AnnotationTable, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should be able to export a CSV', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allAnnotations: (_: any, { offset }: any) => {
          return [
            merge({}, mockAnnotation, { id: `AnnotationId_${offset + 1}`, mz: offset + 1 }),
            merge({}, mockAnnotation, {
              dataset: { groupApproved: false },
              id: `AnnotationId_${offset + 2}`,
              mz: offset + 2,
            }),
          ]
        },
        countAnnotations: () => 4,
      }),
    })
    const wrapper = mount(AnnotationTable, { store, router, apolloProvider, propsData })
    wrapper.setData({ csvChunkSize: 2 })
    await new Promise(resolve => setTimeout(resolve, 1))

    await (wrapper.vm as any).startExport()
    expect(mockFileSaver.saveAs).toBeCalled()
    const blob: Blob = mockFileSaver.saveAs.mock.calls[0][0]
    const csv = await blobToText(blob)
    const csvWithoutDateHeader = csv.replace(/# Generated at .*\n/, '')

    expect(csvWithoutDateHeader).toMatchSnapshot()
  })
})
