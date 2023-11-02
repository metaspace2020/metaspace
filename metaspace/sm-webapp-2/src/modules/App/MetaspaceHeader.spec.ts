import { describe, it, expect, vi } from 'vitest';
import router from "@/router";
import store from "@/store";
import { nextTick, ref } from 'vue';
import {flushPromises, mount} from '@vue/test-utils';
import MyComponent from './MetaspaceHeader';

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
    // Implement any other methods that your component expects
  })),
  // ...mock other composable if needed
}));


// Mock router's push function or any other function you need
router.push = vi.fn();


describe('MyComponent', () => {
  it('renders with first user data', async () => {
    mockIndex = 0;
    // Mount the component using Vue Test Utils
    const wrapper = mount(MyComponent, {
      global: {
        plugins: [router, store], // Use the mock router as a plugin
      },
    });

    await nextTick(); // Wait for the next "tick" after mounting

    expect(wrapper.html()).toMatchSnapshot();
  });

  it('renders with second user data', async () => {
    mockIndex = 1;
    // Mount the component using Vue Test Utils
    const wrapper = mount(MyComponent, {
      global: {
        plugins: [router, store], // Use the mock router as a plugin
      },
    });

    await nextTick(); // Wait for the next "tick" after mounting

    expect(wrapper.html()).toMatchSnapshot();
  });


  afterEach(() => {
    // Reset the mockIndex or any other state between tests
    mockIndex = 0;
    vi.clearAllMocks();
  });
});
