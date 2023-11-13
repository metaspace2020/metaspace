import { nextTick, ref } from 'vue';
import router from "@/router";
import store from "@/store";
import { mount} from '@vue/test-utils';
import MetaspaceHeader from './MetaspaceHeader';

const currentUserMockResponses = [
  {
    data: {
      currentUser:  {
        id: '123',
        name: 'Test UserX',
        email: 'test@example.com',
        primaryGroup: {
          group: {
            id: '456',
            name: 'Test Group',
            urlSlug: null,
          },
        },
        groups: [
          { role: 'MEMBER', group: { hasPendingRequest: null } },
          { role: 'GROUP_ADMIN', group: { hasPendingRequest: false } },
        ],
        projects: [
          { role: 'PENDING', project: { hasPendingRequest: null } },
          { role: 'MANAGER', project: { hasPendingRequest: true } },
        ],
      },
    },
  },
  {
    data: {
      currentUser: null,
    },
  }
];

let mockIndex = 0; // This will determine which mock response to use

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(() => ({
    result: ref(currentUserMockResponses[mockIndex].data),
    loading: ref(false),
    error: ref(null),
    subscribeToMore: vi.fn(),
  })),
}));


// Mock router's push function or any other function you need
router.push = vi.fn();


describe('MetaspaceHeader', () => {
  it('should match snapshot (logged in)', async ({expect}) => {
    mockIndex = 0;
    const wrapper = mount(MetaspaceHeader, {
      global: {
        plugins: [router, store],
      },
    });

    await nextTick();
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should match snapshot (logged out)', async ({expect}) => {
    mockIndex = 1;
    const wrapper = mount(MetaspaceHeader, {
      global: {
        plugins: [router, store],
      },
    });

    await nextTick();
    expect(wrapper.html()).toMatchSnapshot();
  });

});
