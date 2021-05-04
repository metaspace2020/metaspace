import { mount } from '@vue/test-utils'
import Vue from 'vue'
import { DatasetComparisonAnnotationTable } from './DatasetComparisonAnnotationTable'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../../store'
import router from '../../../router'

describe('DatasetComparisonAnnotationTable', () => {
  const mockHandleRowChange = jest.fn((idx: number) => { return idx })
  const propsData = {
    isLoading: false,
    annotations: [
      {
        id: '2021-03-31_11h02m28s_5230',
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
        id: '2021-03-31_11h02m28s_5175',
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
    onRowChange: mockHandleRowChange,
  }

  const testHarness = Vue.extend({
    components: {
      DatasetComparisonAnnotationTable,
    },
    render(h) {
      return h(DatasetComparisonAnnotationTable, { props: this.$attrs })
    },
  })

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('it should match snapshot', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should match total count with number of annotations', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper.find('#annot-count').text())
      .toBe(`${propsData.annotations.length} matching records`)
  })
})
