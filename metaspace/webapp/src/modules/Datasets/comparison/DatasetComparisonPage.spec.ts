import { mount } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import DatasetComparisonPage from './DatasetComparisonPage'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'

describe('DatasetComparisonPage', () => {
  const snapshotData = jest.fn((src: any, args: any, ctx: any) => ({
    snapshot: '{"nCols":2,"nRows":1,"grid":{"0-0":"2021-04-14_07h23m35s",'
      + '"0-1":"2021-04-06_08h35m04s"}}',
  }))

  const annotationsData : any = {
    allAggregatedAnnotations: [
      {
        id: '2021-03-2021-04-14_07h23m35s',
        sumFormula: 'C10H11NO',
        ion: 'C10H11NO+Na+',
        ionFormula: 'C10H11NONa',
        database: 'HMDB',
        msmScore: 0.736404,
        rhoSpatial: 0.848534,
        rhoSpectral: 0.982476,
        rhoChaos: 0.883333,
        fdrLevel: 0.05,
        mz: 184.07324581966384,
        colocalizationCoeff: null,
        offSample: null,
        offSampleProb: null,
        isomers: [],
        isobars: [],
        countPossibleCompounds: 5,
        possibleCompounds: [],
      },
      {
        id: '2021-04-06_08h35m04s',
        sumFormula: 'C23H45NO4',
        adduct: '+H',
        ion: 'C23H45NO4+H+',
        ionFormula: 'C23H46NO4',
        database: 'HMDB',
        msmScore: 0.509524,
        rhoSpatial: 0.577076,
        rhoSpectral: 0.990214,
        rhoChaos: 0.891667,
        fdrLevel: 0.05,
        mz: 400.34209613966374,
        colocalizationCoeff: null,
        offSample: null,
        offSampleProb: null,
        isotopeImages: [
          {
            mz: 400.34209613966374,
            url: 'http://storage:9000/sm-ion-images-dev/iso/2021-03-31_11h02m28s/fd53ff218cfb420f988b9fc0723b802a',
            minIntensity: 8137228,
            maxIntensity: 11610989,
            totalIntensity: 76451200,
          },
        ],
        isomers: [],
        isobars: [],
        countPossibleCompounds: 1,
        possibleCompounds: [],
      },
    ],
  }

  const testHarness = Vue.extend({
    components: {
      DatasetComparisonPage,
    },
    render(h) {
      return h(DatasetComparisonPage, { props: this.$attrs })
    },
  })

  const graphqlWithData = () => {
    initMockGraphqlClient({
      Query: () => ({
        imageViewerSnapshot: snapshotData,
      })
    })
  }

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
    router.replace({
      name: 'datasets-comparison',
      params: {
        snapshot_id: 'xxxx',
        dataset_id: 'xxxx',
      },
    })
  })

  it('it should match snapshot', async() => {
    graphqlWithData()
    const wrapper = mount(testHarness, {
      store,
      router,
    })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should call snapshot settings query', async() => {
    graphqlWithData()
    mount(testHarness, { store, router })
    await Vue.nextTick()

    expect(snapshotData).toHaveBeenCalledTimes(1)
  })
})
