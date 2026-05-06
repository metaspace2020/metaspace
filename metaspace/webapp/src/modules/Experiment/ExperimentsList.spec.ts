import { defineComponent, nextTick, h, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import store from '../../store'
import router from '../../router'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import ExperimentsList from './ExperimentsList'
import { ElTag } from '../../lib/element-plus'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

const graphqlData = {
  experimentsByProject: [
    {
      id: 'exp-1',
      name: 'First experiment',
      description: 'd1',
      createdAt: '2026-04-30T00:00:00.000Z',
      createdBy: { id: 'u1', name: 'Alice' },
      datasets: [
        { id: 'ds1', dataset: { id: 'ds1', name: 'Dataset One' } },
        { id: 'ds2', dataset: { id: 'ds2', name: 'Dataset Two' } },
      ],
      run: { status: 'COMPLETED', stage: 'DONE', generation: 0 },
    },
    {
      id: 'exp-2',
      name: 'Second experiment',
      description: null,
      createdAt: '2026-04-29T00:00:00.000Z',
      createdBy: { id: 'u2', name: 'Bob' },
      datasets: [],
      run: null,
    },
  ],
}

let mockClient: any

describe('ExperimentsList', () => {
  const propsData = {
    projectId: 'project-id-1',
    canEdit: true,
  }

  const testHarness = defineComponent({
    components: { ExperimentsList },
    props: ['projectId', 'canEdit'],
    setup(props) {
      return () => h(ExperimentsList, { projectId: props.projectId, canEdit: props.canEdit })
    },
  })

  beforeAll(async () => {
    mockClient = await initMockGraphqlClient({
      Query: () => graphqlData,
    })
  })

  it('renders all experiment names and a Create button when canEdit', async () => {
    ;(useQuery as any).mockReturnValue({
      result: ref(graphqlData),
      loading: ref(false),
      onResult: vi.fn(),
      refetch: vi.fn(),
    })

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: { [DefaultApolloClient]: mockClient },
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toContain('First experiment')
    expect(wrapper.html()).toContain('Second experiment')
    expect(wrapper.find('[data-test-key="create-experiment"]').exists()).toBe(true)
  })

  it('hides the Create button when canEdit is false', async () => {
    ;(useQuery as any).mockReturnValue({
      result: ref(graphqlData),
      loading: ref(false),
      onResult: vi.fn(),
      refetch: vi.fn(),
    })

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: { [DefaultApolloClient]: mockClient },
      },
      props: { projectId: 'project-id-1', canEdit: false },
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test-key="create-experiment"]').exists()).toBe(false)
  })

  it('shows empty state when no experiments', async () => {
    ;(useQuery as any).mockReturnValue({
      result: ref({ experimentsByProject: [] }),
      loading: ref(false),
      onResult: vi.fn(),
      refetch: vi.fn(),
    })

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: { [DefaultApolloClient]: mockClient },
      },
      props: propsData,
    })
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toContain('No experiments yet')
  })

  const mountWithExperiments = (experiments: any[]) => {
    ;(useQuery as any).mockReturnValue({
      result: ref({ experimentsByProject: experiments }),
      loading: ref(false),
      onResult: vi.fn(),
      refetch: vi.fn(),
    })
    return mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: { [DefaultApolloClient]: mockClient },
      },
      props: propsData,
    })
  }

  it('renders a success-typed status tag for FINISHED experiments', async () => {
    const wrapper = mountWithExperiments([
      {
        id: 'exp-f',
        name: 'Finished one',
        description: null,
        createdAt: '2026-04-30T00:00:00.000Z',
        createdBy: { id: 'u1', name: 'Alice' },
        datasets: [],
        run: { status: 'FINISHED', stage: 'DONE', generation: 0 },
      },
    ])
    await flushPromises()
    await nextTick()

    const tag = wrapper.findAllComponents(ElTag).find((t) => t.attributes('data-test-key') === 'status-exp-f')
    expect(tag).toBeTruthy()
    expect(tag!.props('type')).toBe('success')
  })

  it('renders a warning-typed status tag for RUNNING/PREPARING/QUEUED experiments', async () => {
    const wrapper = mountWithExperiments([
      {
        id: 'exp-r',
        name: 'Running',
        description: null,
        createdAt: '2026-04-30T00:00:00.000Z',
        createdBy: null,
        datasets: [],
        run: { status: 'RUNNING', stage: null, generation: 0 },
      },
      {
        id: 'exp-p',
        name: 'Preparing',
        description: null,
        createdAt: '2026-04-30T00:00:00.000Z',
        createdBy: null,
        datasets: [],
        run: { status: 'PREPARING', stage: null, generation: 0 },
      },
      {
        id: 'exp-q',
        name: 'Queued',
        description: null,
        createdAt: '2026-04-30T00:00:00.000Z',
        createdBy: null,
        datasets: [],
        run: { status: 'QUEUED', stage: null, generation: 0 },
      },
    ])
    await flushPromises()
    await nextTick()

    const tags = wrapper.findAllComponents(ElTag)
    for (const id of ['exp-r', 'exp-p', 'exp-q']) {
      const tag = tags.find((t) => t.attributes('data-test-key') === `status-${id}`)
      expect(tag).toBeTruthy()
      expect(tag!.props('type')).toBe('warning')
    }
  })

  it('renders a danger-typed status tag for FAILED experiments', async () => {
    const wrapper = mountWithExperiments([
      {
        id: 'exp-x',
        name: 'Failed',
        description: null,
        createdAt: '2026-04-30T00:00:00.000Z',
        createdBy: null,
        datasets: [],
        run: { status: 'FAILED', stage: null, generation: 0 },
      },
    ])
    await flushPromises()
    await nextTick()

    const tag = wrapper.findAllComponents(ElTag).find((t) => t.attributes('data-test-key') === 'status-exp-x')
    expect(tag).toBeTruthy()
    expect(tag!.props('type')).toBe('danger')
  })

  it('renders up to 3 dataset names then "+N more"', async () => {
    const wrapper = mountWithExperiments([
      {
        id: 'exp-many',
        name: 'Many datasets',
        description: null,
        createdAt: '2026-04-30T00:00:00.000Z',
        createdBy: null,
        datasets: [
          { id: 'd1', dataset: { id: 'd1', name: 'Alpha' } },
          { id: 'd2', dataset: { id: 'd2', name: 'Beta' } },
          { id: 'd3', dataset: { id: 'd3', name: 'Gamma' } },
          { id: 'd4', dataset: { id: 'd4', name: 'Delta' } },
          { id: 'd5', dataset: { id: 'd5', name: 'Epsilon' } },
        ],
        run: null,
      },
    ])
    await flushPromises()
    await nextTick()

    const teaser = wrapper.find('[data-test-key="datasets-exp-many"]')
    expect(teaser.exists()).toBe(true)
    const text = teaser.text()
    expect(text).toContain('Alpha')
    expect(text).toContain('Beta')
    expect(text).toContain('Gamma')
    expect(text).toContain('+2 more')
    expect(text).not.toContain('Delta')
    expect(text).not.toContain('Epsilon')
  })
})
