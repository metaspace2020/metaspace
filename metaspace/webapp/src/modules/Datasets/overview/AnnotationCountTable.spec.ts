import { mount } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store/index'
import Vue from 'vue'
import Vuex from 'vuex'
import { sync } from 'vuex-router-sync'
import { AnnotationCountTable } from './AnnotationCountTable'
import { DatasetAnnotationCount } from '../../../api/dataset'

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
  const id = 'xxxx'
  const mockFdrLevels = [5, 10, 20, 50]
  const propsData = { data: mockAnnotationCounts, id: id, header: mockFdrLevels }
  const propsEmptyData = { data: [], id: id, header: mockFdrLevels }

  const testHarness = Vue.extend({
    components: {
      AnnotationCountTable,
    },
    render(h) {
      return h(AnnotationCountTable, { props: this.$attrs })
    },
  })

  it('it should match snapshot', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    expect(wrapper).toMatchSnapshot()
  })

  it('it should render the correct number of columns', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()
    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 1)
  })

  it('it should render the correct links to navigate to annotation', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // check if each link cell has the correct parameters for fdr and db filters
    wrapper.find('tbody').findAll('tr').wrappers.forEach((row, rowIndex) => {
      row.findAll('a').wrappers.forEach((col, colIndex) => {
        if (colIndex !== 0) { // db name links do not filter by fdr
          expect(col.props('to').query.fdr)
            .toBe((mockFdrLevels[colIndex - 1] / 100).toString())
        }
        expect(col.props('to').params.dataset_id).toBe('xxxx')
        expect(col.props('to').query.db_id).toBe(mockAnnotationCounts[rowIndex].databaseId.toString())
      })
    })

    // check if each link cell has the correct parameters for the summaryRow
    wrapper.findAll('tbody').at(1)
      .findAll('a').wrappers.forEach((col, colIndex) => {
        expect(col.props('to').query.fdr)
          .toBe((mockFdrLevels[colIndex] / 100).toString())
        expect(col.props('to').params.dataset_id).toBe('xxxx')
      })

    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 1)
    expect(wrapper.findAll('a').at(1).props('to').params.dataset_id)
      .toBe('xxxx')
  })

  it('it should render with no data warning when props empty', async() => {
    const wrapper = mount(testHarness, { store, router, propsData: propsEmptyData })
    await Vue.nextTick()

    expect(wrapper.find('.el-table__empty-text').exists()).toBeTruthy()
  })

  it('it should render the annotation count sum correctly', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // check if each link cell has the correct parameters
    wrapper.find('.el-table__footer-wrapper').findAll('td').wrappers.slice(1)
      .forEach((footerItem, index) => {
        const reducer = (accumulator: number, currentValue: DatasetAnnotationCount) => {
          return accumulator + currentValue.counts[index].n
        }
        const sum = mockAnnotationCounts.reduce(reducer, 0)
        expect(parseInt(footerItem.text(), 10)).toBe(sum)
      })
  })

  it('it should render the correct databases name', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    // check if each link cell has the correct parameters
    wrapper.find('.el-table__footer-wrapper').findAll('td').wrappers.slice(1)
      .forEach((footerItem, index) => {
        const reducer = (accumulator: number, currentValue: DatasetAnnotationCount) => {
          return accumulator + currentValue.counts[index].n
        }
        const sum = mockAnnotationCounts.reduce(reducer, 0)
        expect(parseInt(footerItem.text(), 10)).toBe(sum)
      })
  })

  it('it should navigate to dataset annotation page on browse annotation button click', async() => {
    const wrapper = mount(testHarness, { store, router, propsData })
    await Vue.nextTick()

    wrapper.find('button').trigger('click')
    await Vue.nextTick()
    expect(wrapper.vm.$route.path).toBe(`/dataset/${id}/annotations`)
  })
})
