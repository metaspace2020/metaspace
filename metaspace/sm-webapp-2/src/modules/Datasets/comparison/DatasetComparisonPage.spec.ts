import { nextTick, ref, h, defineComponent  } from 'vue';
import { mount, flushPromises } from '@vue/test-utils'
import router from "../../../router";
import store from "../../../store";
import {initMockGraphqlClient} from "../../../tests/utils/mockGraphqlClient";
import {DefaultApolloClient, useQuery} from "@vue/apollo-composable";
import DatasetComparisonPage from './DatasetComparisonPage'


vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}));

let graphqlMocks: any;


describe('DatasetComparisonPage', () => {
  const snapshotData = vi.fn(() => ({
    snapshot: '{"nCols":2,"nRows":1,"grid":{"0-0":"2021-04-14_07h23m35s",'
      + '"0-1":"2021-04-06_08h35m04s"}}',
  }))

  const dsData = [{
    id: '2021-04-14_07h23m35s',
    name: 'Mock (1)',
    uploadDT: '2021-03-31T14:02:28.722Z',
  },
  {
    id: '2021-04-06_08h35m04s',
    name: 'Mock (2)',
    uploadDT: '2021-03-30T21:25:18.473Z',
  }]

  const testHarness = defineComponent({
    components: {
      DatasetComparisonPage,
    },
    setup(props, { attrs }) {
      return () => h(DatasetComparisonPage, { ...attrs, ...props });
    },
  });

  const mockGraphql = async (qyeryParams) => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => (qyeryParams),
    });

    (useQuery as any).mockReturnValue({
      result: ref(Object.keys(qyeryParams).reduce((acc, key) => ({ ...acc, [key]: qyeryParams[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    });
  };

  const graphqlWithData = async() => {
    const queryParams = {
      imageViewerSnapshot: snapshotData,
      allAnnotations: () => {
        return []
      },
      allDatasets: () => {
        return dsData
      },
    }

    await mockGraphql(queryParams)
  }


  it('it should match snapshot', async() => {
    await router.replace({
      name: 'datasets-comparison',
      query: {
        viewId: 'xxxx',
      },
      params: {
        dataset_id: 'xxxx',
      },
    })
    await graphqlWithData()
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        }
      },
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  })

  it('it should match not found snapshot', async() => {
    await router.replace({
      name: 'datasets-comparison',
      params: {
        dataset_id: 'xxxx',
      },
    })
    await graphqlWithData()
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        }
      },
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  })
})
