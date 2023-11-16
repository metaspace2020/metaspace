import { mount } from '@vue/test-utils'
import Vue from 'vue'
import FilterPanel from './FilterPanel.vue'
import router from '../../router'
import { initMockGraphqlClient, apolloProvider } from '../../../tests/utils/mockGraphqlClient'
import Vuex from 'vuex'
import store from '../../store/index'
import { sync } from 'vuex-router-sync'
import { encodeParams } from './url'
import {
  mockAdductSuggestions,
  mockMolecularDatabases,
  mockDatasetDatabases,
} from '../../../tests/utils/mockGraphqlData'

Vue.use(Vuex)
sync(store, router)

describe('FilterPanel', () => {
  const allFilters = {
    database: 1,
    group: '0123',
    project: '4567',
    submitter: '89AB',
    datasetIds: ['CDEF', 'GHIJ'],
    minMSM: 0.5,
    compoundName: 'C8H20NO6P',
    adduct: '+K',
    mz: 296.0659,
    fdrLevel: 0.1,
    polarity: 'Positive',
    organism: 'cow',
    organismPart: 'stomach',
    condition: 'hungry',
    growthConditions: 'paddock',
    ionisationSource: 'MALDI',
    maldiMatrix: 'DHB',
    analyzerType: 'FTICR',
    simpleQuery: 'foo',
    metadataType: 'ims',
  }

  beforeEach(async() => {
    initMockGraphqlClient({
      Query: () => ({
        adductSuggestions: mockAdductSuggestions,
        allMolecularDBs: mockMolecularDatabases,
        allDatasets: mockDatasetDatabases,
      }),
    })
    store.commit('setFilterLists', null)
    await store.dispatch('initFilterLists')
  })

  const updateFilter = async(newFilter: any) => {
    router.replace({ path: '/annotations' })
    await Vue.nextTick()
    store.commit('updateFilter', newFilter)
    await Vue.nextTick() // Must wait after every change for vue-router to update the store
  }

  it('should match snapshot (no filters)', async() => {
    await updateFilter({})
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, { router, apolloProvider, store, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot (database without dataset)', async() => {
    await updateFilter({ database: allFilters.database })
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, { router, apolloProvider, store, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should match snapshot (all annotation filters)', async() => {
    await updateFilter(allFilters)
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, { router, apolloProvider, store, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should update the route when filters change', async() => {
    await updateFilter(allFilters)
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, { router, apolloProvider, store, propsData })
    const newFilters = {
      simpleQuery: 'lorem ipsum',
      database: 2,
      project: 'abc',
      datasetIds: ['aaa', 'bbb'],
      // compoundName: 'C10H15N3O5',
      mz: '296.1',
    }
    await Vue.nextTick()

    // simpleQuery - SearchBox
    wrapper.find('[data-test-key="simpleQuery"] input').setValue(newFilters.simpleQuery)
    // database - SingleSelectFilter
    wrapper.find('[data-test-key="database"] mock-el-select').vm.$emit('change', newFilters.database)
    // project - SearchableFilter [multiple=false]
    wrapper.find('[data-test-key="project"] mock-el-select').vm.$emit('change', newFilters.project)
    // datasetIds - SearchableFilter [multiple=true]
    wrapper.find('[data-test-key="datasetIds"] mock-el-select').vm.$emit('change', newFilters.datasetIds)
    // compoundName - InputFilter [commented out as does not work with debounce]
    // wrapper.find('[data-test-key="compoundName"] .tf-value-span').trigger('click')
    // await Vue.nextTick()
    // wrapper.find('[data-test-key="compoundName"] input').setValue(newFilters.compoundName)
    // await Vue.nextTick()
    // mz - NumberFilter
    wrapper.find('[data-test-key="mz"] .tf-value-span').trigger('click')
    await Vue.nextTick()
    wrapper.find('[data-test-key="mz"] input').setValue(newFilters.mz)
    await Vue.nextTick()
    wrapper.find('[data-test-key="mz"] input').trigger('change')
    await Vue.nextTick()

    expect(router.currentRoute.query).toEqual(expect.objectContaining(encodeParams(newFilters)))
  })

  it('should be able to add a filter', async() => {
    await updateFilter({})
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, { router, apolloProvider, store, propsData })
    await Vue.nextTick()
    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(false)

    wrapper.find('mock-el-select').vm.$emit('change', 'project')
    await Vue.nextTick()

    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(true)
  })

  it('should be able to remove a filter', async() => {
    await updateFilter(allFilters)
    const propsData = { level: 'annotation' }
    const wrapper = mount(FilterPanel, { router, apolloProvider, store, propsData })
    await Vue.nextTick()
    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(true)

    wrapper.find('[data-test-key="project"] .tf-remove').trigger('click')
    await Vue.nextTick()

    expect(wrapper.find('[data-test-key="project"]').exists()).toEqual(false)
  })
})
