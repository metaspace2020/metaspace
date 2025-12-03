import { flushPromises, mount } from '@vue/test-utils'
import AnnotationTable from './AnnotationTable.vue'
import { nextTick } from 'vue'
import store from '../../store'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { vi, expect } from 'vitest'
import router from '../../router'
import * as FileSaver from 'file-saver'
import ElementPlus from '../../lib/element-plus'
import { merge } from 'lodash-es'

vi.mock('../../lib/util', async () => {
  const actual: any = await vi.importActual('../../lib/util')
  return {
    ...actual,
    getJWT: vi.fn().mockResolvedValue({ text: vi.fn() }), // Mock getJWT to return a resolved p
  }
})

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}))

const blobToText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      resolve(reader.result as string)
    })
    reader.addEventListener('error', (e) => {
      reject((e as any).error)
    })
    reader.readAsText(blob)
  })
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
  metricsJson: '{"mz_err_abs": 0.0012345}',
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
  possibleCompounds: [{ name: 'C.I. Food Red 6', information: [{ databaseId: 'HMDB0032738' }] }],
  colocalizationCoeff: 0.840809,
  offSample: false,
  offSampleProb: 0.03,
}

describe('AnnotationTable', () => {
  const propsData = { hideColumns: ['OffSampleProb'] }

  it('should match snapshot', async () => {
    const graphqlMockClient = await initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => [mockAnnotation],
        countAnnotations: () => 1,
      }),
    })
    const wrapper = mount(AnnotationTable, {
      global: {
        plugins: [store, router, ElementPlus],
        provide: {
          [DefaultApolloClient]: graphqlMockClient,
        },
      },
      props: propsData,
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should match snapshot when loading snapshot', async () => {
    const graphqlMockClient = await initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => [mockAnnotation],
        countAnnotations: () => 1,
      }),
    })
    await router.replace({
      name: 'annotations',
      query: {
        viewId: 'xxxx',
        ds: '2019-02-12_15h55m06s',
      },
    })
    const wrapper = mount(AnnotationTable, {
      global: {
        plugins: [store, router, ElementPlus],
        provide: {
          [DefaultApolloClient]: graphqlMockClient,
        },
      },
      props: propsData,
    })

    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should be able to export a CSV', async () => {
    const graphqlMockClient = await initMockGraphqlClient({
      Query: () => ({
        allAnnotations: (_: any, params: any) => {
          const offset = params?.offset || 0
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
    await router.replace({
      name: 'annotations',
      query: {
        viewId: 'xxxx',
        ds: '2019-02-12_15h55m06s',
      },
    })
    const wrapper = mount(AnnotationTable, {
      global: {
        plugins: [store, router, ElementPlus],
        provide: {
          [DefaultApolloClient]: graphqlMockClient,
        },
      },
      props: propsData,
    })

    wrapper.vm.state.csvChunkSize = 2
    await new Promise((resolve) => setTimeout(resolve, 1))

    await flushPromises()
    await nextTick()

    await (wrapper.vm as any).startExport()
    expect(FileSaver.saveAs).toBeCalled()
    const blob: Blob = (FileSaver.saveAs as any).mock.calls[0][0]
    const csv = await blobToText(blob)
    const csvWithoutDateHeader = csv.replace(/# Generated at .*\n/, '')

    expect(csvWithoutDateHeader).toMatchSnapshot()
  })
})
