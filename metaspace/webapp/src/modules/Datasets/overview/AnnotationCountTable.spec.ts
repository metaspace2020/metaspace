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
      isTargeted: false,
      total: 224,
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
      isTargeted: false,
      total: 190,
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

    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 2)
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
          if (colIndex !== 0 && colIndex <= mockFdrLevels.length) {
            // db name link (colIndex 0) and Total link (last) do not filter by a single fdr level
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
        if (colIndex < mockFdrLevels.length) {
          expect(toProp.query.fdr).toBe((mockFdrLevels[colIndex] / 100).toString())
        }
        expect(toProp.params.dataset_id).toBe('xxxx')
      })

    expect(wrapper.findAll('th').length).toBe(mockFdrLevels.length + 2)
    expect(JSON.parse(wrapper.findAll('.mock-router-link').at(1).attributes('to')).params.dataset_id).toBe('xxxx')
  })

  it('it should scope Total Annotations FDR links to the non-targeted database when targeted DBs exist', async () => {
    const mixedData = [
      {
        databaseId: 1,
        dbName: 'HMDB',
        dbVersion: 'v4',
        isTargeted: false,
        total: 224,
        counts: [
          { level: 5, n: 55 },
          { level: 10, n: 104 },
          { level: 20, n: 196 },
          { level: 50, n: 224 },
        ],
      },
      {
        databaseId: 99,
        dbName: 'Custom',
        dbVersion: '1',
        isTargeted: true,
        total: 300,
        counts: [
          { level: 5, n: 0 },
          { level: 10, n: 0 },
          { level: 20, n: 0 },
          { level: 50, n: 0 },
        ],
      },
    ]
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: { data: mixedData, id, header: mockFdrLevels },
    })
    await flushPromises()
    await nextTick()

    const footerLinks = wrapper.findAll('tfoot').at(0).findAll('.mock-router-link')
    footerLinks.forEach((col, colIndex) => {
      const toProp = JSON.parse(col.attributes('to'))
      expect(toProp.params.dataset_id).toBe('xxxx')
      if (colIndex < mockFdrLevels.length) {
        // FDR-level summary cells exclude targeted DBs by scoping to the single non-targeted DB
        expect(toProp.query.db_id).toBe('1')
        expect(toProp.query.fdr).toBe((mockFdrLevels[colIndex] / 100).toString())
      } else {
        // Total column links to all databases at the highest FDR level
        expect(toProp.query.db_id).toBeUndefined()
        expect(toProp.query.fdr).toBe('0.5')
      }
    })
  })

  it('should not link Total FDR cells when targeted mixes with multiple non-targeted DBs', async () => {
    const multiNonTargeted = [
      {
        databaseId: 1,
        dbName: 'HMDB',
        dbVersion: 'v4',
        isTargeted: false,
        total: 101,
        counts: [
          { level: 5, n: 42 },
          { level: 10, n: 71 },
          { level: 20, n: 101 },
          { level: 50, n: 101 },
        ],
      },
      {
        databaseId: 6,
        dbName: 'SwissLipids',
        dbVersion: '2018-02-02',
        isTargeted: false,
        total: 138,
        counts: [
          { level: 5, n: 4 },
          { level: 10, n: 74 },
          { level: 20, n: 125 },
          { level: 50, n: 138 },
        ],
      },
      {
        databaseId: 33,
        dbName: 'Test',
        dbVersion: '1',
        isTargeted: true,
        total: 118,
        counts: [
          { level: 5, n: 0 },
          { level: 10, n: 0 },
          { level: 20, n: 0 },
          { level: 50, n: 0 },
        ],
      },
    ]
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router, ElementPlus],
        stubs,
      },
      props: { data: multiNonTargeted, id, header: mockFdrLevels },
    })
    await flushPromises()
    await nextTick()

    // Only the Total column summary remains a link (all databases at the highest FDR level).
    const footerLinks = wrapper.findAll('tfoot').at(0).findAll('.mock-router-link')
    expect(footerLinks.length).toBe(1)
    const toProp = JSON.parse(footerLinks.at(0).attributes('to'))
    expect(toProp.query.db_id).toBeUndefined()
    expect(toProp.query.fdr).toBe('0.5')
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
        // The last footer cell is the Total column — sum of per-database totals.
        const reducer = (accumulator: number, currentValue: DatasetAnnotationCount) => {
          return accumulator + (index < mockFdrLevels.length ? currentValue.counts[index].n : currentValue.total)
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
        // The last footer cell is the Total column — sum of per-database totals.
        const reducer = (accumulator: number, currentValue: DatasetAnnotationCount) => {
          return accumulator + (index < mockFdrLevels.length ? currentValue.counts[index].n : currentValue.total)
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
      state: { from: 'dataset-overview' },
    })
  })
})
