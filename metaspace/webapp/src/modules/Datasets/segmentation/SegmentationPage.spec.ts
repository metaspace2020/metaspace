import { nextTick, ref, h, defineComponent } from 'vue'
import { mount, flushPromises, VueWrapper } from '@vue/test-utils'
import type { MockInstance } from 'vitest'
import router from '../../../router'
import store from '../../../store'
import SegmentationPage from './SegmentationPage'
import { ElMessageBox } from '../../../lib/element-plus'
import { initMockGraphqlClient } from '../../../tests/utils/mockGraphqlClient'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import {
  getDatasetByIdQuery,
  segmentationJobQuery,
  deleteSegmentationJobMutation,
  getSegmentationsQuery,
  getSegmentationJobsQuery,
  opticalImagesQuery,
  getSegmentationIonProfilesWithImagesQuery,
} from '../../../api/dataset'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn() })),
  useSubscription: vi.fn(() => ({ onResult: vi.fn() })),
  DefaultApolloClient: vi.fn(),
}))

// echarts cannot initialise a renderer under jsdom; the charts are not what this spec asserts on.
vi.mock('vue-echarts', () => ({ default: vi.fn() }))
vi.mock('echarts', () => ({ default: vi.fn() }))
vi.mock('echarts/core', () => ({ default: vi.fn(), use: vi.fn() }))

// setupTests only stubs SVGs loaded through `defineAsyncComponent`; this page imports two
// statically, which Vitest resolves to URL strings that cannot be used as components.
vi.mock('../../../assets/inline/material/aspect-ratio.svg', () => ({
  default: defineComponent({ template: '<svg />' }),
}))
vi.mock('../../../assets/inline/refactoring-ui/icon-monitor.svg', () => ({
  default: defineComponent({ template: '<svg />' }),
}))

// The table and heatmap need full annotation rows; this spec only checks which profiles the page hands them.
vi.mock('./SegmentationTable', () => ({
  SegmentationTable: defineComponent({
    name: 'SegmentationTable',
    props: ['annotations', 'segmentations', 'isLoading'],
    template: '<div class="mock-segmentation-table" />',
  }),
}))
vi.mock('./SegmentationHeatmap', () => ({
  SegmentationHeatmap: defineComponent({
    name: 'SegmentationHeatmap',
    props: ['segmentationData', 'annotations', 'isLoading', 'isVisible', 'segmentations'],
    template: '<div class="mock-segmentation-heatmap" />',
  }),
}))

let graphqlMocks: any

describe('SegmentationPage', () => {
  const datasetId = '2021-03-11_08h29m21s'

  // Real-shaped SEGMENTATION diagnostic so the page renders its full content rather than the
  // "No segmentation data available" placeholder.
  const mockSegmentationData = {
    algorithm: 'kmeans',
    map_type: 'segmentation',
    n_segments: 2,
    parameters_used: {
      n_components: 2,
      variance_threshold: 0.9,
      k: 2,
      k_range: [2, 4],
      criterion: 'bic',
    },
    segment_summary: [
      { id: 0, size_px: 120, coverage_fraction: 0.6, top_ions: ['C1H2'] },
      { id: 1, size_px: 80, coverage_fraction: 0.4, top_ions: ['C3H4'] },
    ],
    diagnostics: {
      bic_curve: null,
      explained_variance: [0.7, 0.2],
      spatial_weights: null,
    },
  }

  interface JobOptions {
    id?: number
    isDefault?: boolean
    isMine?: boolean
  }

  const mockJob = ({ id = 1, isDefault = true, isMine = false }: JobOptions = {}) => ({
    segmentationJob: {
      id,
      datasetId,
      status: 'FINISHED',
      error: null,
      userId: 'user1',
      isDefault,
      isMine,
      resultData: JSON.stringify(mockSegmentationData),
      labelMapUrl: null,
      updatedAt: '2026-11-04T10:00:00.000Z',
    },
  })

  /** A row of `getSegmentationJobsQuery`. */
  const listJob = (id: number, isDefault: boolean, isMine: boolean, status = 'FINISHED') => ({
    id,
    datasetId,
    status,
    error: null,
    userId: isMine ? 'me' : 'submitter',
    isDefault,
    isMine,
  })

  const DEFAULT_JOB_ID = 1
  const PRIVATE_JOB_ID = 7
  const bothJobs = [listJob(PRIVATE_JOB_ID, false, true), listJob(DEFAULT_JOB_ID, true, false)]

  type ResultHandler = (result: { data: any }) => unknown

  // `onResult` keeps the page's handlers so a test can deliver a (network) result the way Apollo would
  const mockQueryResult = (result: any, loading = false) => {
    const resultHandlers: ResultHandler[] = []
    return {
      result: ref(result),
      loading: ref(loading),
      error: ref(null),
      refetch: vi.fn(),
      onResult: vi.fn((handler: ResultHandler) => {
        resultHandlers.push(handler)
      }),
      resultHandlers,
    }
  }

  // Routes each useQuery call to a canned result based on which document was passed. Any query
  // this spec does not know about throws, so a future query fails loudly instead of silently
  // returning undefined.
  interface MountOptions {
    jobLoading?: boolean
    job?: ReturnType<typeof mockJob> | { segmentationJob: null }
    jobs?: ReturnType<typeof listJob>[]
    canEdit?: boolean
    submitterName?: string | null
  }

  type Variables = Record<string, unknown> | (() => Record<string, unknown>)

  let jobQueryResult: ReturnType<typeof mockQueryResult>
  let segmentationsQueryResult: ReturnType<typeof mockQueryResult>
  let jobsQueryResult: ReturnType<typeof mockQueryResult>
  let jobQueryVariables: Variables
  let segmentationsQueryVariables: Variables
  let jobQueryOptions: unknown
  let segmentationsQueryOptions: unknown

  /** Resolves the variables a query was given, whether a plain object or the reactive function form. */
  const resolveVariables = (variables: Variables) => (typeof variables === 'function' ? variables() : variables)

  const mockQueries = ({
    jobLoading = false,
    job = mockJob(),
    jobs,
    canEdit = false,
    submitterName = 'Admin Doe',
  }: MountOptions = {}) => {
    const visibleJob = job.segmentationJob
    const jobList = jobs ?? (visibleJob ? [listJob(visibleJob.id, visibleJob.isDefault, visibleJob.isMine)] : [])
    jobQueryResult = mockQueryResult(job, jobLoading)
    segmentationsQueryResult = mockQueryResult({ segmentations: [] })
    jobsQueryResult = mockQueryResult({ segmentationJobs: jobList })
    ;(useQuery as any).mockImplementation((query: any, variables: Variables, options: unknown) => {
      if (query === getDatasetByIdQuery) {
        return mockQueryResult({
          dataset: { id: datasetId, name: 'JD_Sample', canEdit, submitter: { name: submitterName } },
        })
      }
      if (query === getSegmentationsQuery) {
        segmentationsQueryVariables = variables
        segmentationsQueryOptions = options
        return segmentationsQueryResult
      }
      if (query === segmentationJobQuery) {
        jobQueryVariables = variables
        jobQueryOptions = options
        return jobQueryResult
      }
      if (query === getSegmentationJobsQuery) {
        return jobsQueryResult
      }
      if (query === opticalImagesQuery) {
        return mockQueryResult({ dataset: { id: datasetId, opticalImages: [] } })
      }
      if (query === getSegmentationIonProfilesWithImagesQuery) {
        return mockQueryResult({ segmentationIonProfiles: [] })
      }
      throw new Error('Unexpected query passed to useQuery')
    })
  }

  const testHarness = defineComponent({
    components: {
      SegmentationPage,
    },
    setup(props, { attrs }) {
      return () => h(SegmentationPage, { ...attrs, ...props })
    },
  })

  const mountPage = async (options: MountOptions = {}) => {
    mockQueries(options)

    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: {
          [DefaultApolloClient]: graphqlMocks,
        },
      },
    })

    await flushPromises()
    await nextTick()

    return wrapper
  }

  /** Finds one of the page's ElDropdown stubs by the class the page gives it. */
  const findDropdown = (wrapper: VueWrapper, className: string) =>
    wrapper.findAllComponents({ name: 'ElDropdown' }).find((dropdown) => dropdown.classes().includes(className))

  /** Picks "Delete segmentation…" from the gear menu. */
  const pickDelete = async (wrapper: VueWrapper) => {
    findDropdown(wrapper, 'segmentation-settings')!.vm.$emit('command', 'delete')
    await flushPromises()
  }

  beforeAll(async () => {
    graphqlMocks = await initMockGraphqlClient({
      Query: () => ({}),
    })
    await router.replace({
      name: 'dataset-segmentation',
      params: { dataset_id: datasetId },
    })
  })

  // Segmentation is no longer Pro-gated: any user may view the page. Free users' usage
  // limits are enforced server-side when a segmentation job is submitted.
  it('should render segmentation content without requiring a Pro subscription', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('.page-header').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('METASPACE Pro feature')
  })

  it('should show the loading state while the job is loading', async () => {
    const wrapper = await mountPage({ jobLoading: true })

    expect(wrapper.find('.loading-container').exists()).toBe(true)
    expect(wrapper.find('.page-header').exists()).toBe(false)
  })

  describe('title and badge', () => {
    it('shows Submitter segmentation with the Submitter badge for the default run', async () => {
      const wrapper = await mountPage({ job: mockJob({ isDefault: true, isMine: false }) })

      expect(wrapper.find('.segmentation-title').text()).toBe('Submitter segmentation')
    })

    it("shows My segmentation with the Private badge for the caller's own run", async () => {
      const wrapper = await mountPage({ job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }) })

      expect(wrapper.find('.segmentation-title').text()).toBe('My segmentation')
    })

    it('drops the old inline delete link', async () => {
      const wrapper = await mountPage({ job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }) })

      expect(wrapper.find('.delete-segmentation').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('Delete my segmentation')
    })
  })

  describe('switcher', () => {
    it('has no dropdown when the viewer has a single run', async () => {
      const wrapper = await mountPage({ job: mockJob() })

      expect(findDropdown(wrapper, 'segmentation-switcher')).toBeUndefined()
    })

    it('ignores runs that are not FINISHED', async () => {
      const wrapper = await mountPage({
        job: mockJob(),
        jobs: [listJob(PRIVATE_JOB_ID, false, true, 'STARTED'), listJob(DEFAULT_JOB_ID, true, false)],
      })

      expect(findDropdown(wrapper, 'segmentation-switcher')).toBeUndefined()
    })

    it('lists both runs and loads the picked one', async () => {
      const wrapper = await mountPage({
        job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }),
        jobs: bothJobs,
      })

      const switcher = findDropdown(wrapper, 'segmentation-switcher')!
      expect(switcher).toBeDefined()
      const items = switcher.findAll('.mock-el-dropdown-item')
      expect(items.map((item) => item.text())).toEqual(['My segmentation', 'Submitter segmentation'])

      expect(resolveVariables(jobQueryVariables)).toEqual({ datasetId, jobId: null })
      switcher.vm.$emit('command', DEFAULT_JOB_ID)
      await flushPromises()

      expect(resolveVariables(jobQueryVariables)).toEqual({ datasetId, jobId: DEFAULT_JOB_ID })
      expect(resolveVariables(segmentationsQueryVariables)).toEqual({ datasetId, jobId: DEFAULT_JOB_ID })
    })

    it('always loads a run from the server, never from a possibly stale cache', async () => {
      await mountPage()

      expect(jobQueryOptions).toEqual(expect.objectContaining({ fetchPolicy: 'network-only' }))
      expect(segmentationsQueryOptions).toEqual(expect.objectContaining({ fetchPolicy: 'network-only' }))
    })
  })

  describe('info popover', () => {
    it('shows clusters, method, creator and parameters of a private run', async () => {
      const wrapper = await mountPage({ job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }) })
      const info = wrapper.find('.segmentation-info')

      expect(info.text()).toContain('Clusters')
      expect(info.find('[data-row="Clusters"]').text()).toContain('2')
      expect(info.find('[data-row="Method"]').text()).toContain('kmeans')
      expect(info.find('[data-row="Created"]').text()).toContain('2026-11-04 by you')
      expect(info.find('[data-row="n_components"]').text()).toContain('2')
      expect(info.find('[data-row="criterion"]').text()).toContain('bic')
      expect(info.find('[data-row="k_range"]').exists()).toBe(false)
      expect(info.text()).toContain('Only you can see this segmentation.')
    })

    it('names the dataset submitter, never an email, and explains sharing for the submitter run', async () => {
      const wrapper = await mountPage({ job: mockJob({ isDefault: true, isMine: false }) })
      const info = wrapper.find('.segmentation-info')

      expect(info.find('[data-row="Created"]').text()).toContain('2026-11-04 by Admin Doe')
      expect(info.text()).not.toContain('@')
    })

    it('falls back to "the submitter" when the submitter has no name', async () => {
      const wrapper = await mountPage({ job: mockJob({ isDefault: true, isMine: false }), submitterName: null })

      expect(wrapper.find('[data-row="Created"]').text()).toContain('2026-11-04 by the submitter')
    })
  })

  describe('gear', () => {
    it('is hidden for a viewer on the submitter run', async () => {
      const wrapper = await mountPage({ job: mockJob({ isDefault: true, isMine: false }), canEdit: false })

      expect(findDropdown(wrapper, 'segmentation-settings')).toBeUndefined()
    })

    it('is shown for a dataset editor on the submitter run', async () => {
      const wrapper = await mountPage({ job: mockJob({ isDefault: true, isMine: false }), canEdit: true })

      const gear = findDropdown(wrapper, 'segmentation-settings')!
      expect(gear).toBeDefined()
      expect(gear.find('.segmentation-delete').text()).toBe('Delete segmentation…')
      expect(gear.find('.segmentation-delete').classes()).toContain('text-red-500')
      // It sits at the right end of the "Segmentation map" bar, next to the ion-image controls, not in the header.
      expect(wrapper.find('.segmentation-run-header .segmentation-settings').exists()).toBe(false)
      expect(wrapper.find('.collapse-actions .segmentation-settings').exists()).toBe(true)
    })

    it('is shown for the owner of a private run', async () => {
      const wrapper = await mountPage({ job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }) })

      expect(findDropdown(wrapper, 'segmentation-settings')).toBeDefined()
    })
  })

  describe('delete', () => {
    let confirmSpy: MockInstance
    let mutateSpy: MockInstance

    afterEach(() => {
      confirmSpy?.mockRestore()
      mutateSpy?.mockRestore()
    })

    const confirmOptions = {
      type: 'warning',
      confirmButtonText: 'Delete',
      cancelButtonText: 'Keep it',
      confirmButtonClass: 'el-button--danger',
      dangerouslyUseHTMLString: true,
    }

    it('warns that the submitter run is removed for everyone', async () => {
      confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      const wrapper = await mountPage({ job: mockJob({ isDefault: true, isMine: false }), canEdit: true })

      await pickDelete(wrapper)

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete <b>Submitter segmentation</b>? Its 2 clusters, markers and diagnostics will be removed for everyone ' +
          'who can see this dataset.',
        'Delete segmentation',
        expect.objectContaining(confirmOptions)
      )
    })

    it('says the submitter run takes over when a private run is deleted', async () => {
      confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      const wrapper = await mountPage({
        job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }),
        jobs: bothJobs,
      })

      await pickDelete(wrapper)

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete <b>My segmentation</b>? Its 2 clusters, markers and diagnostics will be removed. ' +
          'The submitter segmentation will be shown instead.',
        'Delete segmentation',
        expect.objectContaining(confirmOptions)
      )
    })

    it('says nothing remains when the only private run is deleted', async () => {
      confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      const wrapper = await mountPage({ job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }) })

      await pickDelete(wrapper)

      expect(confirmSpy).toHaveBeenCalledWith(
        'Delete <b>My segmentation</b>? Its 2 clusters, markers and diagnostics will be removed. ' +
          'No segmentation will be shown for this dataset.',
        'Delete segmentation',
        expect.objectContaining(confirmOptions)
      )
    })

    /** A row of `getSegmentationsQuery`. */
    const segment = (id: string, segmentIndex: number) => ({ id, datasetId, segmentIndex, name: null })

    /** Delivers a segments result to the page the way Apollo would, then lets the profile loads settle. */
    const deliverSegments = async (segmentations: ReturnType<typeof segment>[]) => {
      segmentationsQueryResult.result.value = { segmentations }
      segmentationsQueryResult.resultHandlers.forEach((handler) => handler({ data: { segmentations } }))
      await flushPromises()
    }

    /** The cluster profiles the page hands to the table. */
    const tableAnnotations = (wrapper: VueWrapper): { segmentationId: string }[] =>
      wrapper.findComponent({ name: 'SegmentationTable' }).props('annotations') as { segmentationId: string }[]

    /** Answers every profile query with one annotation of the requested segmentation. */
    const mockProfiles = () =>
      vi.spyOn(graphqlMocks, 'query').mockImplementation(async ({ variables }: any) => ({
        data: {
          segmentationIonProfiles: [{ annotation: { id: `ann-${variables.segmentationId}` }, enrichScore: 0.5 }],
        },
      }))

    it('deletes the server-chosen run and refetches the run list, job and segments', async () => {
      confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
      mutateSpy = vi.spyOn(graphqlMocks, 'mutate').mockResolvedValue({ data: { deleteSegmentationJob: true } })
      const wrapper = await mountPage({
        job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }),
        jobs: bothJobs,
      })

      await pickDelete(wrapper)

      expect(mutateSpy).toHaveBeenCalledWith({
        mutation: deleteSegmentationJobMutation,
        variables: { id: PRIVATE_JOB_ID },
      })
      // The variables do not change (still the server's choice), so the run queries are refetched explicitly
      expect(jobsQueryResult.refetch).toHaveBeenCalled()
      expect(jobQueryResult.refetch).toHaveBeenCalled()
      expect(segmentationsQueryResult.refetch).toHaveBeenCalled()
      expect(resolveVariables(jobQueryVariables)).toEqual({ datasetId, jobId: null })
    })

    it("loads the remaining run's profiles after deleting a run picked in the switcher", async () => {
      confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
      mutateSpy = vi.spyOn(graphqlMocks, 'mutate').mockResolvedValue({ data: { deleteSegmentationJob: true } })
      const querySpy = mockProfiles()
      const privateJob = mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true })
      const defaultJob = mockJob({ id: DEFAULT_JOB_ID })
      const privateSegments = [segment('private-0', 0)]
      const defaultSegments = [segment('default-0', 0)]
      const wrapper = await mountPage({ job: privateJob, jobs: bothJobs })
      const switcher = () => findDropdown(wrapper, 'segmentation-switcher')!
      await deliverSegments(privateSegments)

      // Submitter run, then back to the private run, so the selected job id really changes
      switcher().vm.$emit('command', DEFAULT_JOB_ID)
      await flushPromises()
      jobQueryResult.result.value = defaultJob
      await deliverSegments(defaultSegments)
      switcher().vm.$emit('command', PRIVATE_JOB_ID)
      await flushPromises()
      jobQueryResult.result.value = privateJob
      await deliverSegments(privateSegments)
      expect(resolveVariables(jobQueryVariables)).toEqual({ datasetId, jobId: PRIVATE_JOB_ID })
      expect(tableAnnotations(wrapper).map((a) => a.segmentationId)).toEqual(['private-0'])
      querySpy.mockClear()

      await pickDelete(wrapper)

      // The deleted run's profiles are dropped and the choice goes back to the server
      expect(tableAnnotations(wrapper)).toEqual([])
      expect(resolveVariables(jobQueryVariables)).toEqual({ datasetId, jobId: null })
      expect(resolveVariables(segmentationsQueryVariables)).toEqual({ datasetId, jobId: null })
      expect(jobsQueryResult.refetch).toHaveBeenCalled()
      // The variable change already refetches the run (network-only); no second request
      expect(jobQueryResult.refetch).not.toHaveBeenCalled()
      expect(segmentationsQueryResult.refetch).not.toHaveBeenCalled()

      // The server answers with the remaining (submitter) run
      jobQueryResult.result.value = defaultJob
      await deliverSegments(defaultSegments)

      expect(querySpy.mock.calls.map(([options]: any[]) => options.variables.segmentationId)).toEqual(['default-0'])
      expect(tableAnnotations(wrapper).map((a) => a.segmentationId)).toEqual(['default-0'])
      querySpy.mockRestore()
    })

    it('discards a profile load still in flight for the previous run', async () => {
      let releaseLoad: () => void = () => undefined
      const querySpy = vi.spyOn(graphqlMocks, 'query').mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseLoad = () =>
              resolve({
                data: {
                  segmentationIonProfiles: [{ annotation: { id: 'stale' }, enrichScore: 0.5 }],
                },
              })
          })
      )
      const wrapper = await mountPage({
        job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }),
        jobs: bothJobs,
      })
      await deliverSegments([segment('private-0', 0)])

      findDropdown(wrapper, 'segmentation-switcher')!.vm.$emit('command', DEFAULT_JOB_ID)
      await flushPromises()
      releaseLoad()
      await flushPromises()

      expect(tableAnnotations(wrapper)).toEqual([])
      querySpy.mockRestore()
    })

    it('does not delete when the confirm is cancelled', async () => {
      confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      mutateSpy = vi.spyOn(graphqlMocks, 'mutate').mockResolvedValue({ data: { deleteSegmentationJob: true } })
      const wrapper = await mountPage({ job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }) })

      await pickDelete(wrapper)

      expect(confirmSpy).toHaveBeenCalled()
      expect(mutateSpy).not.toHaveBeenCalled()
      expect(jobQueryResult.refetch).not.toHaveBeenCalled()
      expect(segmentationsQueryResult.refetch).not.toHaveBeenCalled()
    })

    it('disables the delete item while the deletion is in flight', async () => {
      confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
      let resolveMutate: (value: unknown) => void = () => undefined
      mutateSpy = vi.spyOn(graphqlMocks, 'mutate').mockReturnValue(
        new Promise((resolve) => {
          resolveMutate = resolve
        })
      )
      const wrapper = await mountPage({ job: mockJob({ id: PRIVATE_JOB_ID, isDefault: false, isMine: true }) })

      // The ElDropdownItem stub passes `disabled` through as a plain attribute
      await pickDelete(wrapper)
      expect(wrapper.find('.segmentation-delete').attributes('disabled')).toBe('true')

      resolveMutate({ data: { deleteSegmentationJob: true } })
      await flushPromises()
      expect(wrapper.find('.segmentation-delete').attributes('disabled')).toBe('false')
    })
  })

  it('shows the empty state when there is no job', async () => {
    const wrapper = await mountPage({ job: { segmentationJob: null } })

    expect(wrapper.find('.no-data-container').exists()).toBe(true)
    expect(wrapper.text()).toContain('No segmentation data available')
    expect(wrapper.find('.page-header').exists()).toBe(false)
  })
})
