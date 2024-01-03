import {defineComponent, nextTick, h, ref} from 'vue'
import {flushPromises, mount} from '@vue/test-utils'
import {initMockGraphqlClient} from "../../tests/utils/mockGraphqlClient";
import store from "../../store";
import router from "../../router";
import {vi} from "vitest";
import { DefaultApolloClient, useQuery } from "@vue/apollo-composable";
import {ProjectDatasetsDialog} from "./ProjectDatasetsDialog";
import {ElCheckbox} from "element-plus";

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}));

const graphqlWithNoData = {
  allDatasets: [],
}
const graphqlWithData = {
  allDatasets: [{
    id: '2021-03-31_11h02m28s',
    name: 'New 3 (1)',
    uploadDT: '2021-03-31T14:02:28.722Z',
  }, {
    id: '2021-03-30_18h25m18s',
    name: 'Untreated_3_434_super_lite_19_31 (1)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }],
}
const graphqlWithExtraUserData = {
  allDatasets: (src: any, { dFilter: { project } } : any) => {
    if (project) {
      return []
    }

    return [{
      id: '2021-03-31_11h02m28s',
      name: 'New 3 (1)',
      uploadDT: '2021-03-31T14:02:28.722Z',
    }, {
      id: '2021-03-30_18h25m18s',
      name: 'Untreated_3_434_super_lite_19_31 (1)',
      uploadDT: '2021-03-30T21:25:18.473Z',
    }]
  },
}
let graphqlWithNoDataClient: any
let graphqlWithDataClient: any
let graphqlWithExtraUserDataClient: any

describe('ProjectDatasetsDialog', () => {
  const propsData = {
    project: {
      id: '05c6519a-8049-11eb-927e-6bf28a9b25ae',
      name: 'Test',
      currentUserRole: 'MANAGER',
    },
    currentUserId: '039801c8-919e-11eb-908e-3b2b8e672707',
    visible: true,
    isManager: true,
    refreshData: () => {},
  }

  const testHarness = defineComponent({
    components: {
      ProjectDatasetsDialog,
    },
    setup() {
      return () => h(ProjectDatasetsDialog, { props: propsData })
    },
  })

  beforeAll(async () => {
    graphqlWithNoDataClient =  await initMockGraphqlClient({
      Query: () => (graphqlWithNoData),
    })
    graphqlWithDataClient =  await initMockGraphqlClient({
      Query: () => (graphqlWithData),
    })
    graphqlWithExtraUserDataClient =  await initMockGraphqlClient({
      Query: () => (graphqlWithExtraUserData),
    })
  })

  it('it should match snapshot', async() => {
    (useQuery as any).mockReturnValue({
      result: ref(graphqlWithData),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithDataClient
        }
      },
      props: propsData
    });
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('it should have disabled update button when no data available', async() => {
    (useQuery as any).mockReturnValue({
      result: ref(graphqlWithNoData),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithNoDataClient
        }
      },
      props: propsData
    });
    await flushPromises()
    await nextTick()

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
  })


  it('it should have disabled update button when no dataset selection has changed', async() => {
    (useQuery as any).mockReturnValue({
      result: ref(graphqlWithData),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithDataClient
        }
      },
      props: propsData
    });
    await flushPromises()
    await nextTick()

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
  })

  it('it should uncheck all datasets when clicking select none', async() => {
    (useQuery as any).mockReturnValue({
      result: ref(graphqlWithData),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithDataClient
        }
      },
      props: propsData
    });
    await flushPromises()
    await nextTick()

    const selectNone = wrapper.findAll('.select-link').at(0);
    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
    await selectNone.trigger('click');
    await nextTick();

    wrapper.findAll('.el-checkbox').forEach((checkBox) => {
      expect(checkBox.classes()).not.toContain('is-checked');
    });

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(false)
  })

  it('it should check all datasets when clicking select all', async() => {
    (useQuery as any).mockReturnValue({
      result: ref(graphqlWithData),
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithDataClient
        }
      },
      props: propsData
    });
    await flushPromises()
    await nextTick()

    const selectAll = wrapper.findAll('.select-link').at(1);
    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
    await selectAll.trigger('click');
    await nextTick();

    wrapper.findAll('.el-checkbox').forEach((checkBox) => {
      expect(checkBox.classes()).toContain('is-checked');
    });

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(false)
  })


  it('it should check one dataset and hit update', async() => {
    (useQuery as any).mockImplementation((query, variables) => {
      const filter = variables ? variables() : {};
      return {
        result: ref({allDatasets: graphqlWithExtraUserData.allDatasets(null, filter)}),
        loading: ref(false),
        onResult: vi.fn(),
      };
    });

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithExtraUserDataClient
        }
      },
      props: propsData
    });
    await flushPromises()
    await nextTick()

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
    expect(wrapper.findAll('.el-checkbox').at(0).classes('is-checked')).toBe(false)

    const checkbox = wrapper.findComponent(ElCheckbox);
    await checkbox.vm.$emit('change', true);
    await nextTick();

    expect(wrapper.findAll('.el-checkbox').at(0).classes('is-checked')).toBe(true)
    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(false)
  })

  it('it should uncheck one dataset and hit update', async() => {
    const queryResult = ref(graphqlWithNoData);

    (useQuery as any).mockReturnValue({
      result: queryResult,
      loading: ref(false),
      onResult: vi.fn(),
    });

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlWithDataClient
        }
      },
      props: propsData
    });

    // force watch update
    queryResult.value = graphqlWithData

    await flushPromises()
    await nextTick()

    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(true)
    expect(wrapper.findAll('.el-checkbox').at(0).classes('is-checked')).toBe(true)

    const checkbox = wrapper.findComponent(ElCheckbox);
    await checkbox.vm.$emit('change', false);
    await nextTick();

    expect(wrapper.findAll('.el-checkbox').at(0).classes('is-checked')).toBe(false)
    expect((wrapper.find('.el-button--primary') as any).isDisabled()).toBe(false)
  })
})
