import { mount } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { AnnotationCountTable } from './AnnotationCountTable'

Vue.use(Vuex)
sync(store, router)

describe('AnnotationCountTable', () => {
  const mockAnnotationCounts = [
    {
      databaseId: 1,
      dbName: 'HMDB',
      dbVersion: 'v4',
      counts: [
        {
          level: 5,
          n: 55,
        },
        {
          level: 10,
          n: 104,
        },
        {
          level: 20,
          n: 196,
        },
        {
          level: 50,
          n: 224,
        },
      ],
    },
    {
      databaseId: 6,
      dbName: 'ChEBI',
      dbVersion: '2018-01',
      counts: [
        {
          level: 5,
          n: 65,
        },
        {
          level: 10,
          n: 90,
        },
        {
          level: 20,
          n: 177,
        },
        {
          level: 50,
          n: 190,
        },
      ],
    },
  ]
  const mockFdrLevels = [5, 10, 20, 50]
  const propsData = { data: mockAnnotationCounts, id: 'xxxx', header: mockFdrLevels }

  const testHarness = Vue.extend({
    components: {
      AnnotationCountTable,
    },
    render(h) {
      return h(AnnotationCountTable, { props: this.$attrs })
    },
  })

  it('should match snapshot', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('should render the correct number of columns', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()
    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 1)
  })

  it('should render the correct link to navigate to annotation', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // check if each link cell has the correct parameters
    wrapper.findAll('a').wrappers.forEach((link, index) => {
      const mockIndex = Math.floor(index / (mockFdrLevels.length || 1))
      const countIndex = index % mockFdrLevels.length
      expect(link.props('to').params.datasetId).toBe('xxxx')
      expect(link.props('to').query.db_id).toBe(mockAnnotationCounts[mockIndex].databaseId.toString())
      expect(link.props('to').query.fdr)
        .toBe((mockAnnotationCounts[mockIndex].counts[countIndex].level / 100).toString())
    })

    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 1)
    expect(wrapper.findAll('a').at(1).props('to').params.datasetId)
      .toBe('xxxx')
  })
})
