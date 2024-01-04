import {defineComponent, nextTick, h, ref} from 'vue';
import {flushPromises, mount} from '@vue/test-utils';
import GroupsListItem from './GroupsListItem'
import {initMockGraphqlClient} from "../../tests/utils/mockGraphqlClient";
import { UserGroupRoleOptions } from '../../api/group';
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
let mockRoutePush


describe('GroupsListItem', () => {
  const propsData = {
    id: 'gr1',
    name: 'Group 1',
    shortName: 'grp1',
    urlSlug: 'grp1',
    numMembers: 1,
    currentUserRole: UserGroupRoleOptions.GROUP_ADMIN,
  };


  const testHarness = defineComponent({
    components: {
      GroupsListItem,
    },
    props: ['id','name', 'shortName', 'urlSlug',
    'currentUserRole', 'numMembers'],
    setup(props) {
      return () => h(GroupsListItem, { ...props });
    },
  });

  const graphqlWithData = async() => {
    const params = {
      countDatasets: () => 1,
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

  const graphqlWithNoData = async () => {
    const params = {
      countDatasets: () => 0,
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

  beforeAll(async() => {
    await graphqlWithData();
  });


  beforeEach(() => {
    mockRoutePush = vi.fn()
    vi.mock('vue-router', async () => {
      const actual: any = await vi.importActual("vue-router")
      return {
        ...actual,
        useRouter: () => {
          return {
            push: mockRoutePush
          }
        }
      }
    })
  })

  it('it should match snapshot with one member and admin role', async () => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        },
      },
      props: propsData,
    });
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('it should match snapshot with two members and admin role', async() => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        },
      },
      props: { ...propsData, numMembers: 2 },
    });
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('it should match snapshot with two members and not admin role', async() => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        },
      },
      props: {
        ...propsData,
        currentUserRole: UserGroupRoleOptions.MEMBER,
      },
    });
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('it should match snapshot with two members, not admin role and 0 datasets', async() => {
    await graphqlWithNoData()
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        },
      },
      props: {
        ...propsData,
        currentUserRole: UserGroupRoleOptions.MEMBER,
      },
    });
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toMatchSnapshot()
  })

  it('should render the correct navigation links if admin', async() => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        },
      },
      props: propsData,
    });
    await flushPromises();
    await nextTick();



    wrapper.find('[data-test-key="group-link"]').trigger('click')
    await nextTick();
    expect(mockRoutePush).toHaveBeenCalledWith({
      "name": "group",
      "params":  {"groupIdOrSlug": propsData.urlSlug }})

    wrapper.find('[data-test-key="manage-link"]').trigger('click')
    await nextTick();
    expect(mockRoutePush).toHaveBeenCalledWith({
      "name": "group",
      "params":  {"groupIdOrSlug": propsData.urlSlug },
      "query": {"tab": "settings"}})

    wrapper.find('[data-test-key="dataset-link"]').trigger('click')
    await nextTick();
    expect(mockRoutePush).toHaveBeenCalledWith({
      "path": "/datasets",
      "query": {"grp": propsData.id}})
  })

  it('should render the correct navigation links if not admin', async() => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks
        },
      },
      props: {
        ...propsData,
        currentUserRole: UserGroupRoleOptions.MEMBER,
      },
    });
    await flushPromises();
    await nextTick();

    wrapper.find('[data-test-key="group-link"]').trigger('click')
    await nextTick();
    expect(mockRoutePush).toHaveBeenCalledWith({
      "name": "group",
      "params":  {"groupIdOrSlug": propsData.urlSlug }})

    wrapper.find('[data-test-key="manage-link"]').trigger('click')
    await nextTick();
    expect(mockRoutePush).toHaveBeenCalledWith({
      "name": "group",
      "params":  {"groupIdOrSlug": propsData.urlSlug },
      "query": {"tab": "members"}})

    wrapper.find('[data-test-key="dataset-link"]').trigger('click')
    await nextTick();
    expect(mockRoutePush).toHaveBeenCalledWith({
      "path": "/datasets",
      "query": {"grp": propsData.id}})
  })

});
