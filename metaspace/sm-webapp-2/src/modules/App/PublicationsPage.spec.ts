import {defineComponent, nextTick, h, ref} from 'vue';
import {flushPromises, mount} from '@vue/test-utils';
import PublicationsPage from './PublicationsPage'
import {initMockGraphqlClient} from "../../tests/utils/mockGraphqlClient";
import {vi} from "vitest";
import { DefaultApolloClient, useQuery } from "@vue/apollo-composable";
import store from "../../store";
import router from "../../router";

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}));

let graphqlMocks: any;

describe('PublicationsPage', () => {
  const graphqlWithData = async() => {
    const params = {
      publicationCount: () => {
        return 1
      },
      reviewCount: () => {
        return 10
      }
    }

    graphqlMocks = await initMockGraphqlClient({
      Query: () => (params),
    });

    (useQuery as any).mockReturnValue({
      result: ref(Object.keys(params).reduce((acc, key) => ({ ...acc, [key]: params[key]() }), {})),
      loading: ref(false),
      onResult: vi.fn(),
    });
  };


  const testHarness = defineComponent({
    components: {
      PublicationsPage,
    },
    setup(props, { attrs }) {
      return () => h(PublicationsPage, { ...attrs, ...props });
    },
  });

  beforeAll(async() => {
    await graphqlWithData()
  })

  it('should match snapshot', async() => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        },
      },
    });
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  })
})
