import { nextTick, h, defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import router from '../../../router'
import store from '../../../store'
import { AnnotationCountTable } from './AnnotationCountTable'
import { DatasetAnnotationCount } from '../../../api/dataset'
import ElementPlus from 'element-plus'

let mockRoutePush

const stubs = {
  RouterLink: {
    template: '<div class="mock-router-link" :to="stringifyTo(to)"><slot /></div>',
    props: ['to'],
    methods: {
      stringifyTo(toProp) {
        // Fall back to just returning the 'to' prop if it's not an object
        return JSON.stringify(toProp)
      },
    },
  },
}

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

  const testHarness = defineComponent({
    components: {
      AnnotationCountTable,
    },
    props: ['id', 'title', 'sumRowLabel', 'btnLabel', 'data', 'header', 'headerTitleSuffix'],
    setup(props) {
      return () => h(AnnotationCountTable, { ...props })
    },
  })

  it('it should match snapshot', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('it should render the correct number of columns', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 1)
  })

  it('it should render the correct links to navigate to annotation', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    // check if each link cell has the correct parameters for fdr and db filters
    wrapper
      .find('tbody')
      .findAll('tr')
      .forEach((row, rowIndex) => {
        row.findAll('.mock-router-link').forEach((col, colIndex) => {
          const toAttr = col.attributes('to')
          const toProp = JSON.parse(toAttr)
          if (colIndex !== 0) {
            // db name links do not filter by fdr
            expect(toProp.query.fdr).toBe((mockFdrLevels[colIndex - 1] / 100).toString())
          }
          expect(toProp.params.dataset_id).toBe('xxxx')
          expect(toProp.query.db_id).toBe(mockAnnotationCounts[rowIndex].databaseId.toString())
        })
      })

    // check if each link cell has the correct parameters for the summaryRow
    wrapper
      .findAll('tfoot')
      .at(0)
      .findAll('.mock-router-link')
      .forEach((col, colIndex) => {
        const toAttr = col.attributes('to')
        const toProp = JSON.parse(toAttr)
        expect(toProp.query.fdr).toBe((mockFdrLevels[colIndex] / 100).toString())
        expect(toProp.params.dataset_id).toBe('xxxx')
      })

    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 1)
    expect(JSON.parse(wrapper.findAll('.mock-router-link').at(1).attributes('to')).params.dataset_id).toBe('xxxx')
  })

  it('it should render with no data warning when props empty', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: propsEmptyData,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('.el-table__empty-text').exists()).toBeTruthy()
  })

  it('it should render the annotation count sum correctly', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    // check if each link cell has the correct parameters
    wrapper
      .find('.el-table__footer-wrapper')
      .findAll('td')
      .slice(1)
      .forEach((footerItem, index) => {
        const reducer = (accumulator: number, currentValue: DatasetAnnotationCount) => {
          return accumulator + currentValue.counts[index].n
        }
        const sum = mockAnnotationCounts.reduce(reducer, 0)
        expect(parseInt(footerItem.text(), 10)).toBe(sum)
      })
  })

  it('it should render the correct databases name', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    // check if each link cell has the correct parameters
    wrapper
      .find('.el-table__footer-wrapper')
      .findAll('td')
      .slice(1)
      .forEach((footerItem, index) => {
        const reducer = (accumulator: number, currentValue: DatasetAnnotationCount) => {
          return accumulator + currentValue.counts[index].n
        }
        const sum = mockAnnotationCounts.reduce(reducer, 0)
        expect(parseInt(footerItem.text(), 10)).toBe(sum)
      })
  })

  it('it should navigate to dataset annotation page on browse annotation button click', async () => {
    mockRoutePush = vi.fn()
    vi.mock('vue-router', async () => {
      const actual: any = await vi.importActual('vue-router')
      return {
        ...actual,
        useRouter: () => {
          return {
            push: mockRoutePush,
          }
        },
      }
    })
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    wrapper.find('button').trigger('click')
    await nextTick()

    expect(mockRoutePush).toHaveBeenCalledWith({
      name: 'dataset-annotations',
      params: { dataset_id: id },
      query: { ds: id },
    })
  })
})
