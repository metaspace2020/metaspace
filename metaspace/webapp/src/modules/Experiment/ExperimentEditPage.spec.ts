import { nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import store from '../../store'
import router from '../../router'
import ExperimentEditPage from './ExperimentEditPage'
import { serializeDraft } from './api'
import type { ExperimentDraft } from './api'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const actual: any = await vi.importActual('vue-router')
  return {
    ...actual,
    useRoute: () => mockRoute,
    useRouter: () => ({ push: routerPush }),
  }
})

let mockRoute: any
const routerPush = vi.fn()

const candidateDatasetsResult = {
  allDatasets: [
    { id: 'd1', name: 'Dataset 1', polarity: 'POSITIVE' },
    { id: 'd2', name: 'Dataset 2', polarity: 'POSITIVE' },
  ],
}

const sampleExperiment = {
  experiment: {
    id: 'e1',
    name: 'Existing experiment',
    description: 'desc',
    matchMode: 'NAME',
    createdAt: '2026-04-30T00:00:00.000Z',
    project: { id: 'p1', name: 'Project' },
    datasets: [
      {
        id: 'ed1',
        regionSource: 'WHOLE',
        dataset: { id: 'd1', name: 'Dataset 1', polarity: 'POSITIVE' },
        regions: [
          {
            regionKey: 'k-r1',
            sourceKind: 'whole',
            roi: null,
            segmentation: null,
            labelGroupName: 'tumor',
            metadata: {
              condition: 'control',
              biologicalReplicateId: 'm1',
              sampleId: 's1',
              technicalReplicateId: null,
              batchId: null,
            },
          },
        ],
      },
    ],
    labelGroups: [{ name: 'tumor', color: '#ff0000' }],
    run: null,
  },
}

let mockClient: any
let mutateSpy: any

const setupQueries = (overrides?: { experiment?: any; datasets?: any }) => {
  ;(useQuery as any).mockImplementation((doc: any) => {
    const docName = doc?.definitions?.[0]?.name?.value ?? ''
    if (docName === 'experiment') {
      return {
        result: ref(overrides?.experiment ?? null),
        loading: ref(false),
        onResult: vi.fn((cb: any) => {
          if (overrides?.experiment) cb({ data: overrides.experiment })
        }),
      }
    }
    if (docName === 'projectCandidateDatasets') {
      return {
        result: ref(overrides?.datasets ?? candidateDatasetsResult),
        loading: ref(false),
        onResult: vi.fn(),
      }
    }
    return { result: ref(null), loading: ref(false), onResult: vi.fn() }
  })
}

describe('ExperimentEditPage', () => {
  const mountPage = () =>
    mount(ExperimentEditPage, {
      global: {
        plugins: [store, router],
        provide: { [DefaultApolloClient]: mockClient },
      },
    })

  beforeAll(async () => {
    await initMockGraphqlClient({ Query: () => ({}) })
  })

  beforeEach(() => {
    routerPush.mockReset()
    mutateSpy = vi.fn().mockResolvedValue({ data: {} })
    mockClient = {
      query: vi.fn().mockResolvedValue({ data: { rois: [], segmentations: [] } }),
      mutate: mutateSpy,
    }
  })

  it('renders empty create form when no :id param', async () => {
    mockRoute = { params: { projectId: 'p1' } }
    setupQueries()

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toContain('Create experiment')
    expect(wrapper.find('[data-test-key="experiment-name"]').exists()).toBe(true)
    expect(wrapper.find('[data-test-key="dataset-card-d1"]').exists()).toBe(false)
  })

  it('hydrates form from experimentQuery when :id present', async () => {
    mockRoute = { params: { projectId: 'p1', id: 'e1' } }
    setupQueries({ experiment: sampleExperiment })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    expect(wrapper.html()).toContain('Edit experiment')
    expect((wrapper.vm as any).draft.name).toBe('Existing experiment')
    expect(wrapper.find('[data-test-key="dataset-card-d1"]').exists()).toBe(true)
  })

  it('calls createExperiment with the right input shape and routes back to project on Save', async () => {
    mockRoute = { params: { projectId: 'p1' } }
    setupQueries()
    const createMutate = vi.fn().mockResolvedValue({ data: { createExperiment: { id: 'new-id' } } })
    const updateMutate = vi.fn().mockResolvedValue({ data: {} })
    const runMutate = vi.fn().mockResolvedValue({ data: {} })
    mockClient.mutate = vi.fn(({ mutation, variables }: any) => {
      const name = mutation?.definitions?.[0]?.name?.value ?? ''
      if (name === 'createExperiment') return createMutate(variables)
      if (name === 'updateExperiment') return updateMutate(variables)
      if (name === 'runExperiment') return runMutate(variables)
      return Promise.resolve({ data: {} })
    })

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    // Set draft via the component's exposed test hook
    const vm: any = wrapper.vm
    vm.setDraft({
      name: 'My exp',
      description: null,
      matchMode: 'NAME',
      labelGroups: [],
      datasets: [
        {
          datasetId: 'd1',
          regionSource: 'WHOLE',
          regions: [
            {
              regionKey: 'k1',
              sourceKind: 'whole',
              roiId: null,
              segmentationId: null,
              labelGroupName: null,
              included: true,
              metadata: {
                condition: 'control',
                biologicalReplicateId: 'm1',
                sampleId: 's1',
                technicalReplicateId: null,
                batchId: null,
              },
            },
          ],
        },
      ],
    })
    await nextTick()

    await wrapper.find('[data-test-key="experiment-save"]').trigger('click')
    await flushPromises()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const payload = createMutate.mock.calls[0][0]
    expect(payload.projectId).toBe('p1')
    expect(payload.input).toMatchObject({
      name: 'My exp',
      matchMode: 'NAME',
      datasets: [
        {
          datasetId: 'd1',
          regionSource: 'WHOLE',
          regions: [
            {
              sourceKind: 'whole',
              roiId: null,
              segmentationId: null,
            },
          ],
        },
      ],
    })
    expect(routerPush).toHaveBeenCalledWith({ path: '/project/p1', query: { tab: 'experiments' } })
  })

  it('renders the mapping board with one column per dataset in the draft', async () => {
    mockRoute = { params: { projectId: 'p1' } }
    setupQueries()

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    expect(wrapper.find('[data-test-key="mapping-board"]').exists()).toBe(true)

    const vm: any = wrapper.vm
    vm.setDraft({
      name: '',
      description: null,
      matchMode: 'NAME',
      labelGroups: [],
      datasets: [
        {
          datasetId: 'd1',
          regionSource: 'WHOLE',
          regions: [
            {
              regionKey: 'k1',
              sourceKind: 'whole',
              roiId: null,
              segmentationId: null,
              labelGroupName: null,
              included: true,
              metadata: {
                condition: '',
                biologicalReplicateId: '',
                sampleId: '',
                technicalReplicateId: null,
                batchId: null,
              },
            },
          ],
        },
        {
          datasetId: 'd2',
          regionSource: 'WHOLE',
          regions: [
            {
              regionKey: 'k2',
              sourceKind: 'whole',
              roiId: null,
              segmentationId: null,
              labelGroupName: null,
              included: true,
              metadata: {
                condition: '',
                biologicalReplicateId: '',
                sampleId: '',
                technicalReplicateId: null,
                batchId: null,
              },
            },
          ],
        },
      ],
    })
    await nextTick()

    const board = wrapper.find('[data-test-key="mapping-board"]')
    expect(board.exists()).toBe(true)
    // Each column is rendered as a direct child div with the dataset name.
    expect(board.text()).toContain('Dataset 1')
    expect(board.text()).toContain('Dataset 2')
  })

  it('disables Save when any region is missing condition', async () => {
    mockRoute = { params: { projectId: 'p1' } }
    setupQueries()

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    const vm: any = wrapper.vm
    vm.setDraft({
      name: 'X',
      description: null,
      matchMode: 'NAME',
      labelGroups: [],
      datasets: [
        {
          datasetId: 'd1',
          regionSource: 'WHOLE',
          regions: [
            {
              regionKey: 'k1',
              sourceKind: 'whole',
              roiId: null,
              segmentationId: null,
              labelGroupName: null,
              included: true,
              metadata: {
                condition: '',
                biologicalReplicateId: 'm1',
                sampleId: 's1',
                technicalReplicateId: null,
                batchId: null,
              },
            },
          ],
        },
      ],
    })
    await nextTick()

    const saveBtn = wrapper.find('[data-test-key="experiment-save"]')
    expect(saveBtn.attributes('disabled')).toBeDefined()
  })

  it('shows a warning banner when a label group has only one condition', async () => {
    mockRoute = { params: { projectId: 'p1' } }
    setupQueries()

    const wrapper = mountPage()
    await flushPromises()
    await nextTick()

    const vm: any = wrapper.vm
    vm.setDraft({
      name: 'X',
      description: null,
      matchMode: 'NAME',
      labelGroups: [{ name: 'g1', color: '#000' }],
      datasets: [
        {
          datasetId: 'd1',
          regionSource: 'WHOLE',
          regions: [
            {
              regionKey: 'k1',
              sourceKind: 'whole',
              roiId: null,
              segmentationId: null,
              labelGroupName: 'g1',
              included: true,
              metadata: {
                condition: 'control',
                biologicalReplicateId: 'm1',
                sampleId: 's1',
                technicalReplicateId: null,
                batchId: null,
              },
            },
          ],
        },
        {
          datasetId: 'd2',
          regionSource: 'WHOLE',
          regions: [
            {
              regionKey: 'k2',
              sourceKind: 'whole',
              roiId: null,
              segmentationId: null,
              labelGroupName: 'g1',
              included: true,
              metadata: {
                condition: 'control',
                biologicalReplicateId: 'm2',
                sampleId: 's2',
                technicalReplicateId: null,
                batchId: null,
              },
            },
          ],
        },
      ],
    })
    await nextTick()

    const banner = wrapper.find('[data-test-key="one-condition-warning"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('g1')
  })

  describe('region mapping merge logic', () => {
    const baseRegion = (regionKey: string, labelGroupName: string | null = null) => ({
      regionKey,
      sourceKind: 'whole' as const,
      roiId: null,
      segmentationId: null,
      labelGroupName,
      included: true,
      metadata: {
        condition: 'control',
        biologicalReplicateId: regionKey,
        sampleId: regionKey,
        technicalReplicateId: null,
        batchId: null,
      },
    })

    const draftWith = (datasets: any[], labelGroups: any[] = []): ExperimentDraft => ({
      name: 'X',
      description: null,
      matchMode: 'NAME',
      labelGroups,
      datasets,
    })

    const setupAndMount = async () => {
      mockRoute = { params: { projectId: 'p1' } }
      setupQueries()
      const wrapper = mountPage()
      await flushPromises()
      await nextTick()
      return wrapper
    }

    it('creates a new auto group when neither endpoint has one', async () => {
      const wrapper = await setupAndMount()
      const vm: any = wrapper.vm
      vm.setDraft(
        draftWith([
          { datasetId: 'd1', regionSource: 'WHOLE', regions: [baseRegion('r1')] },
          { datasetId: 'd2', regionSource: 'WHOLE', regions: [baseRegion('r2')] },
        ])
      )
      await nextTick()

      vm.onAddEdge({ from: 'r1', to: 'r2' })
      await nextTick()

      expect(vm.draft.labelGroups).toHaveLength(1)
      expect(vm.draft.labelGroups[0].name).toBe('auto_1')
      expect(vm.draft.datasets[0].regions[0].labelGroupName).toBe('auto_1')
      expect(vm.draft.datasets[1].regions[0].labelGroupName).toBe('auto_1')
    })

    it('extends an existing auto group with a third region (1↔1↔1)', async () => {
      const wrapper = await setupAndMount()
      const vm: any = wrapper.vm
      vm.setDraft(
        draftWith(
          [
            { datasetId: 'd1', regionSource: 'WHOLE', regions: [baseRegion('r1', 'auto_1')] },
            { datasetId: 'd2', regionSource: 'WHOLE', regions: [baseRegion('r2', 'auto_1')] },
            { datasetId: 'd3', regionSource: 'WHOLE', regions: [baseRegion('r3')] },
          ],
          [{ name: 'auto_1', color: '#000' }]
        )
      )
      await nextTick()

      vm.onAddEdge({ from: 'r2', to: 'r3' })
      await nextTick()

      expect(vm.draft.labelGroups).toHaveLength(1)
      const groups = vm.draft.datasets.map((d: any) => d.regions[0].labelGroupName)
      expect(groups).toEqual(['auto_1', 'auto_1', 'auto_1'])
    })

    it('merges two existing auto groups when bridged', async () => {
      const wrapper = await setupAndMount()
      const vm: any = wrapper.vm
      vm.setDraft(
        draftWith(
          [
            { datasetId: 'd1', regionSource: 'WHOLE', regions: [baseRegion('r1', 'auto_1')] },
            { datasetId: 'd2', regionSource: 'WHOLE', regions: [baseRegion('r2', 'auto_1')] },
            { datasetId: 'd3', regionSource: 'WHOLE', regions: [baseRegion('r3', 'auto_2')] },
            { datasetId: 'd4', regionSource: 'WHOLE', regions: [baseRegion('r4', 'auto_2')] },
          ],
          [
            { name: 'auto_1', color: '#000' },
            { name: 'auto_2', color: '#fff' },
          ]
        )
      )
      await nextTick()

      vm.onAddEdge({ from: 'r2', to: 'r3' })
      await nextTick()

      expect(vm.draft.labelGroups.map((g: any) => g.name)).toEqual(['auto_1'])
      const groups = vm.draft.datasets.map((d: any) => d.regions[0].labelGroupName)
      expect(groups).toEqual(['auto_1', 'auto_1', 'auto_1', 'auto_1'])
    })

    it('is a no-op when both endpoints already share a group', async () => {
      const wrapper = await setupAndMount()
      const vm: any = wrapper.vm
      vm.setDraft(
        draftWith(
          [
            { datasetId: 'd1', regionSource: 'WHOLE', regions: [baseRegion('r1', 'auto_1')] },
            { datasetId: 'd2', regionSource: 'WHOLE', regions: [baseRegion('r2', 'auto_1')] },
          ],
          [{ name: 'auto_1', color: '#000' }]
        )
      )
      await nextTick()
      const before = JSON.stringify(vm.draft)
      vm.onAddEdge({ from: 'r1', to: 'r2' })
      await nextTick()
      expect(JSON.stringify(vm.draft)).toEqual(before)
    })

    it('detaches a single region on remove and keeps the group when ≥2 remain', async () => {
      const wrapper = await setupAndMount()
      const vm: any = wrapper.vm
      vm.setDraft(
        draftWith(
          [
            { datasetId: 'd1', regionSource: 'WHOLE', regions: [baseRegion('r1', 'auto_1')] },
            { datasetId: 'd2', regionSource: 'WHOLE', regions: [baseRegion('r2', 'auto_1')] },
            { datasetId: 'd3', regionSource: 'WHOLE', regions: [baseRegion('r3', 'auto_1')] },
          ],
          [{ name: 'auto_1', color: '#000' }]
        )
      )
      await nextTick()

      vm.onRemoveMapping('r1|r3')
      await nextTick()

      expect(vm.draft.labelGroups).toHaveLength(1)
      expect(vm.draft.datasets[0].regions[0].labelGroupName).toBe('auto_1')
      expect(vm.draft.datasets[1].regions[0].labelGroupName).toBe('auto_1')
      expect(vm.draft.datasets[2].regions[0].labelGroupName).toBeNull()
    })

    it('removes the group entirely when remove drops it below 2 members', async () => {
      const wrapper = await setupAndMount()
      const vm: any = wrapper.vm
      vm.setDraft(
        draftWith(
          [
            { datasetId: 'd1', regionSource: 'WHOLE', regions: [baseRegion('r1', 'auto_1')] },
            { datasetId: 'd2', regionSource: 'WHOLE', regions: [baseRegion('r2', 'auto_1')] },
          ],
          [{ name: 'auto_1', color: '#000' }]
        )
      )
      await nextTick()

      vm.onRemoveMapping('r1|r2')
      await nextTick()

      expect(vm.draft.labelGroups).toHaveLength(0)
      expect(vm.draft.datasets[0].regions[0].labelGroupName).toBeNull()
      expect(vm.draft.datasets[1].regions[0].labelGroupName).toBeNull()
    })
  })

  it('omits excluded regions from the saved experiment payload', () => {
    const draft: ExperimentDraft = {
      name: 'X',
      description: null,
      matchMode: 'NAME',
      labelGroups: [],
      datasets: [
        {
          datasetId: 'd1',
          regionSource: 'ROI',
          regions: [
            {
              regionKey: 'r1',
              sourceKind: 'roi',
              roiId: 10,
              segmentationId: null,
              labelGroupName: null,
              included: true,
              metadata: {
                condition: 'control',
                biologicalReplicateId: 'm1',
                sampleId: 's1',
                technicalReplicateId: null,
                batchId: null,
              },
            },
            {
              regionKey: 'r2',
              sourceKind: 'roi',
              roiId: 11,
              segmentationId: null,
              labelGroupName: null,
              included: false,
              metadata: {
                condition: 'control',
                biologicalReplicateId: 'm2',
                sampleId: 's2',
                technicalReplicateId: null,
                batchId: null,
              },
            },
          ],
        },
      ],
    }
    const payload = serializeDraft(draft)
    expect(payload.datasets[0].regions).toHaveLength(1)
    expect(payload.datasets[0].regions[0].regionKey).toBe('r1')
  })
})
