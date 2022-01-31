import { mount } from '@vue/test-utils'
import router from '../../../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../../../tests/utils/mockGraphqlClient'
import Diagnostics from './Diagnostics.vue'
import store from '../../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import * as reportErrorModule from '../../../../lib/reportError'

Vue.use(Vuex)
sync(store, router)

describe('Diagnostics', () => {
  const peakChartData = JSON.stringify({
    mz_grid: { min_mz: 99.9, max_mz: 101.1 },
    theor: {
      centroid_mzs: [100, 101],
      mzs: [99.9, 100, 100.1, 100.9, 101, 101.1],
      ints: [0, 1, 0, 0, 0.5, 0],
    },
    ppm: 3,
    sampleData: {
      mzs: [100, 101],
      ints: [1, 0.6],
    },
  })

  const metrics = {
    chaos: 0.9976041666666666,
    spatial: 0.005921380836044965,
    spectral: 0.7906196869421936,
  }
  const metricsJson = JSON.stringify(metrics)
  const baseAnnotation = {
    id: '2019-10-15_17h02m31s_7277991',
    ion: 'C19H18N2O7S2-H+',
    ionFormula: 'C19H19N2O7S2',
    mz: 449.0482267014823,
    fdrLevel: 0.1,
    msmScore: 0.657486,
    rhoSpatial: 0.686362,
    rhoSpectral: 0.959122,
    rhoChaos: 0.998756,
    peakChartData,
    possibleCompounds: [
      { name: 'C.I. Food Red 6', information: [{ databaseId: 'HMDB0032738' }] },
    ],
    dataset: {
      id: '2019-02-12_15h55m06s',
      name: 'Untreated_3_434',
      scoringModel: null,
      configJson: JSON.stringify({
        fdr: { scoring_model: null },
      }),
    },
    databaseDetails: {
      id: 24,
    },
    offSample: false,
    offSampleProb: 0.03,
    isobars: [
      {
        ion: 'C8H10S2-H-',
        ionFormula: 'C8H9S2',
        peakNs: [[1, 1], [3, 3]],
        shouldWarn: true,
      },
    ],
    isotopeImages: [
      {
        mz: 100,
        url: '/fs/iso_images/img1',
        minIntensity: 0,
        maxIntensity: 100,
        totalIntensity: 5000,
      },
      {
        mz: 101,
        url: '/fs/iso_images/img2',
        minIntensity: 100,
        maxIntensity: 200,
        totalIntensity: 10000,
      },
    ],
    metricsJson,
  }
  const isobarAnnotation = {
    ...baseAnnotation,
    id: '15_17h02m31s_7277992',
    ion: 'C8H10S2-H-',
    ionFormula: 'C8H9S2',
    offSample: true,
    offSampleProb: 0.87654,
  }

  const props = {
    annotation: baseAnnotation,
    colormap: 'Viridis',
    imageLoaderSettings: {
      annotImageOpacity: 1,
      opacityMode: 'constant',
      imagePosition: { zoom: 1, xOffset: 0, yOffset: 0 },
      opticalSrc: null,
      opticalTransform: null,
      pixelAspectRatio: 1,
    },
  }

  const stubs = ['ImageLoader']

  const W = 200
  const H = 300

  beforeEach(() => {
    // Set HTMLElements to have non-zero dimensions
    // @ts-ignore
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() =>
      ({ left: 200, right: 200 + W, top: 100, bottom: 100 + H, width: W, height: H }))
    jest.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => W)
    jest.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => H)
  })

  it('should match snapshot (no isobars)', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => ([]),
        annotation: ({ id }: {id: string}) => ({ ...baseAnnotation, id, peakChartData }),
      }),
    })
    const propsData = {
      ...props,
      annotation: {
        ...baseAnnotation,
        isobars: [],
      },
    }
    const wrapper = mount(Diagnostics, { store, router, apolloProvider, stubs, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot (with isobar)', async() => {
    initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => ([isobarAnnotation]),
        annotation: (_: any, { id }: {id: string}) => ({
          ...(id === isobarAnnotation.id ? isobarAnnotation : baseAnnotation),
          id,
          peakChartData,
        }),
      }),
    })
    const reportErrorFunc = jest.spyOn(reportErrorModule, 'default')

    const wrapper = mount(Diagnostics, { store, router, apolloProvider, stubs, propsData: props })
    await Vue.nextTick()
    wrapper.setData({ comparisonIonFormula: isobarAnnotation.ionFormula })
    await Vue.nextTick()

    expect(reportErrorFunc).not.toBeCalled() // "Inconsistent annotations" warning should fail the test
    expect(wrapper).toMatchSnapshot()
  })
})
