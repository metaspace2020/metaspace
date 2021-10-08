import { mount } from '@vue/test-utils'
import RelatedMolecules from './RelatedMolecules.vue'
import { initMockGraphqlClient, apolloProvider } from '../../../../tests/utils/mockGraphqlClient'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import config from '../../../lib/config'
import router from '../../../router'

Vue.use(Vuex)
sync(store, router)

const testCompound = (name: string, id: string) => ({
  name,
  imageURL: `/mol-images/HMDB/${id}.svg`,
  information: [{
    databaseId: id,
    database: 'HMDB-v4',
    url: `http://www.hmdb.ca/metabolites/${id}`,
  }],
})

const referenceAnnotation = {
  id: '2019-02-12_15h55m06s_HMDB-v4_2018-04-09_C10H11NO_plus_Na',
  ion: 'C10H11NO+Na+',
  fdrLevel: 0.1,
  dataset: { id: '2019-02-12_15h55m06s' },
  possibleCompounds: [testCompound('Tryptophanol', 'HMDB0003447')],
}
const relatedAnnotation = {
  ...referenceAnnotation,
  id: '2019-02-12_15h55m06s_HMDB-v4_2018-04-09_C10H13NO2_minus_H2O_plus_Na',
  ion: 'C10H13NO2-H2O+Na+',
  fdrLevel: 0.2,
  possibleCompounds: [
    testCompound('Maltoxazine', 'HMDB0030372'),
    testCompound('Salsolinol', 'HMDB0042012'),
  ],
}

describe('RelatedMolecules', () => {
  const propsData = { annotation: referenceAnnotation, databaseId: 22 }

  it('should match snapshot', async() => {
    config.features.isomers = true
    config.features.isobars = false
    initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => ([
          relatedAnnotation,
          referenceAnnotation,
        ]),
      }),
    })
    const wrapper = mount(RelatedMolecules, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()

    expect(wrapper.findAll('.ion-link').wrappers.map(el => el.text())).toEqual([
      expect.stringContaining('C10H11NO'),
      expect.stringContaining('C10H13NO2'),
    ])
    expect(wrapper.findAll('.compound').wrappers.map(el => el.text())).toEqual([
      expect.stringContaining('Tryptophanol'),
      expect.stringContaining('Maltoxazine'),
      expect.stringContaining('Salsolinol'),
    ])
  })

  it('should hide the isomer when the feature flag is off', async() => {
    config.features.isomers = false
    config.features.isobars = false
    initMockGraphqlClient({
      Query: () => ({
        allAnnotations: () => ([
          relatedAnnotation,
          referenceAnnotation,
        ]),
      }),
    })
    const wrapper = mount(RelatedMolecules, { store, router, apolloProvider, propsData })
    await Vue.nextTick()

    expect(wrapper.find('.ion-link').exists()).toBe(false)
    expect(wrapper.findAll('.compound').wrappers.map(el => el.text())).toEqual([
      expect.stringContaining('Tryptophanol'),
    ])
  })
})
