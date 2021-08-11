import { mount } from '@vue/test-utils'
import Vue from 'vue'
import SimpleIonImageViewer from './SimpleIonImageViewer'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import store from '../../../store'
import router from '../../../router'

describe('SimpleIonImageViewer', () => {
  const propsData = {
    annotation: {
      id: '2021-05-10_16h11m35s_40994',
      sumFormula: 'C34H46O11',
      adduct: '+H',
      ion: 'C34H46O11+H+',
      ionFormula: 'C34H47O11',
      database: 'ChEBI',
      msmScore: 0.00000276404,
      rhoSpatial: 0.00000313589,
      rhoSpectral: 0.881923,
      rhoChaos: 0.99943,
      fdrLevel: 0.5,
      mz: 631.3112495016694,
      colocalizationCoeff: null,
      offSample: null,
      offSampleProb: null,
      isotopeImages: [
        {
          mz: 631.3112495016694,
          url: 'blob:http://localhost:8999/8e5542e8-2f21-40fc-8562-152c627f2a91',
          minIntensity: 0,
          maxIntensity: 4848650,
          totalIntensity: 66381492,
        },
      ],
      isomers: [],
      isobars: [],
      countPossibleCompounds: 1,
      possibleCompounds: [
        {
          name: 'ajugatakasin A',
          imageURL: '/mol-images/ChEBI/CHEBI:69876.svg',
          information: [
            {
              database: 'ChEBI',
              url: 'nullCHEBI:69876',
            },
          ],
        },
      ],
    },
    ionImageUrl: 'blob:http://localhost:8999/8e5542e8-2f21-40fc-8562-152c627f2a91',
    pixelSizeX: 100,
    pixelSizeY: 100,
  }
  const testHarness = Vue.extend({
    components: {
      SimpleIonImageViewer,
    },
    render(h) {
      return h(SimpleIonImageViewer, { props: this.$attrs })
    },
  })

  beforeAll(() => {
    Vue.use(Vuex)
    sync(store, router)
  })

  it('it should match snapshot when empty', async() => {
    const wrapper = mount(testHarness, {
      store,
      router,
      propsData: {
        isEmpty: true,
        isLoading: false,
      },
    })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })

  it('it should match snapshot when loading chart data', async() => {
    const wrapper = mount(testHarness, {
      store,
      router,
      propsData,
    })
    await Vue.nextTick()

    expect(wrapper.element).toMatchSnapshot()
  })
})
