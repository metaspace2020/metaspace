import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { vi, Mock } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import type { DocumentNode } from 'graphql'
import store from '../../store'
import router from '../../router'
import ProjectProSettings from './ProjectProSettings'
import { ElNotification } from '../../lib/element-plus'
import {
  currentUserProGroupQuery,
  ProjectEntitlement,
  ProjectSponsorship,
  projectSponsorshipQuery,
  removeProjectSponsorshipMutation,
  setProjectSponsorshipMutation,
} from '../../api/projectSponsorship'

vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(),
  DefaultApolloClient: vi.fn(),
}))

const PROJECT_ID = 'project-1'
const CURRENT_USER_ID = 'user-1'
const PRO_GROUP = { id: 'group-1', name: 'Pro Lab' }

interface MockState {
  sponsorship: ProjectSponsorship | null
  proGroup: { id: string; name: string } | null
  /** When true, the sponsorship query is still loading its first result. */
  sponsorshipFirstLoad?: boolean
}

const makeSponsorship = (
  entitlements: ProjectEntitlement[],
  sponsorUserId = CURRENT_USER_ID,
  proGroup: { id: string; name: string } = PRO_GROUP
): ProjectSponsorship => ({
  projectId: PROJECT_ID,
  proGroupId: proGroup.id,
  sponsorUserId,
  entitlements,
  createdAt: '2026-11-01T00:00:00.000Z',
  proGroup,
})

const mockQueries = ({ sponsorship, proGroup, sponsorshipFirstLoad = false }: MockState): { refetch: Mock } => {
  const refetch = vi.fn()
  ;(useQuery as unknown as Mock).mockImplementation((doc: DocumentNode) => {
    if (doc === projectSponsorshipQuery) {
      return {
        result: ref(sponsorshipFirstLoad ? undefined : { projectSponsorship: sponsorship }),
        loading: ref(sponsorshipFirstLoad),
        refetch,
        onResult: vi.fn(),
      }
    }
    if (doc === currentUserProGroupQuery) {
      return {
        result: ref({ currentUserProGroup: proGroup }),
        loading: ref(false),
        refetch: vi.fn(),
        onResult: vi.fn(),
      }
    }
    throw new Error('Unexpected query')
  })
  return { refetch }
}

describe('ProjectProSettings', () => {
  let mutate: Mock

  const testHarness = defineComponent({
    props: ['projectId', 'currentUserId'],
    setup(props) {
      return () => h(ProjectProSettings, { projectId: props.projectId, currentUserId: props.currentUserId })
    },
  })

  const mountComponent = async (currentUserId: string | null = CURRENT_USER_ID): Promise<VueWrapper> => {
    const wrapper = mount(testHarness, {
      global: {
        plugins: [store, router],
        provide: { [DefaultApolloClient as unknown as symbol]: { mutate } },
      },
      props: { projectId: PROJECT_ID, currentUserId },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  const checkbox = (wrapper: VueWrapper, key: ProjectEntitlement) =>
    wrapper.find(`[data-test-key="entitlement-${key}"] input`)

  const saveButton = (wrapper: VueWrapper) => wrapper.find('[data-test-key="save-pro-settings"]')

  beforeEach(() => {
    mutate = vi.fn().mockResolvedValue({})
    vi.spyOn(ElNotification, 'success').mockImplementation(() => ({}) as ReturnType<typeof ElNotification.success>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when the user has no pro group and the project is not sponsored', async () => {
    mockQueries({ sponsorship: null, proGroup: null })
    const wrapper = await mountComponent()

    expect(wrapper.find('[data-test-key="project-pro-settings"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('renders nothing until the sponsorship query returns its first result', async () => {
    mockQueries({ sponsorship: null, proGroup: PRO_GROUP, sponsorshipFirstLoad: true })
    const wrapper = await mountComponent()

    expect(wrapper.find('[data-test-key="project-pro-settings"]').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('renders the five checkboxes for a manager in a pro group with no sponsorship, Save disabled', async () => {
    mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    expect(wrapper.find('[data-test-key="project-pro-settings"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Pro settings')
    expect(wrapper.text()).toContain("Usage counts against Pro Lab's plan.")
    for (const key of ['PRIVATE_SUBMISSION', 'PRIVATE_RESUBMISSION', 'EXPERIMENTS', 'DIFF_ANALYSIS', 'SEGMENTATION']) {
      expect(wrapper.find(`[data-test-key="entitlement-${key}"]`).exists()).toBe(true)
    }
    expect(
      wrapper.findAll('input[type="checkbox"]').filter((i) => (i.element as HTMLInputElement).checked)
    ).toHaveLength(0)
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Currently sponsored by')
  })

  it('pre-checks stored entitlements and enables Save after a change', async () => {
    mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS', 'SEGMENTATION']), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    expect((checkbox(wrapper, 'EXPERIMENTS').element as HTMLInputElement).checked).toBe(true)
    expect((checkbox(wrapper, 'SEGMENTATION').element as HTMLInputElement).checked).toBe(true)
    expect((checkbox(wrapper, 'PRIVATE_SUBMISSION').element as HTMLInputElement).checked).toBe(false)
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()

    await checkbox(wrapper, 'DIFF_ANALYSIS').setValue(true)
    await nextTick()

    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('calls setProjectSponsorship with the selection on Save', async () => {
    const { refetch } = mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await checkbox(wrapper, 'EXPERIMENTS').setValue(true)
    await checkbox(wrapper, 'SEGMENTATION').setValue(true)
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(mutate).toHaveBeenCalledWith({
      mutation: setProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID, entitlements: ['EXPERIMENTS', 'SEGMENTATION'] },
    })
    expect(ElNotification.success).toHaveBeenCalledWith({ title: '', message: 'Pro settings saved' })
    expect(refetch).toHaveBeenCalled()
  })

  it('sends entitlements in display order regardless of click order', async () => {
    mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await checkbox(wrapper, 'SEGMENTATION').setValue(true)
    await checkbox(wrapper, 'EXPERIMENTS').setValue(true)
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(mutate).toHaveBeenCalledWith({
      mutation: setProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID, entitlements: ['EXPERIMENTS', 'SEGMENTATION'] },
    })
  })

  it('calls removeProjectSponsorship when all boxes are cleared', async () => {
    const { refetch } = mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS']), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await checkbox(wrapper, 'EXPERIMENTS').setValue(false)
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(mutate).toHaveBeenCalledWith({
      mutation: removeProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID },
    })
    expect(ElNotification.success).toHaveBeenCalledWith({ title: '', message: 'Pro settings saved' })
    expect(refetch).toHaveBeenCalled()
  })

  // eslint-disable-next-line vue/max-len
  it('shows remove-only mode with the sponsor group name when the user has no pro group but the project is sponsored', async () => {
    const otherGroup = { id: 'group-2', name: 'Other Lab' }
    const { refetch } = mockQueries({
      sponsorship: makeSponsorship(['EXPERIMENTS'], 'user-2', otherGroup),
      proGroup: null,
    })
    const wrapper = await mountComponent()

    expect(wrapper.find('[data-test-key="project-pro-settings"]').exists()).toBe(true)
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(saveButton(wrapper).exists()).toBe(false)
    expect(wrapper.text()).toContain("Usage counts against Other Lab's plan.")

    const removeButton = wrapper.find('[data-test-key="remove-pro-settings"]')
    expect(removeButton.exists()).toBe(true)
    expect(removeButton.text()).toBe('Remove sponsorship')

    await removeButton.trigger('click')
    await flushPromises()

    expect(mutate).toHaveBeenCalledWith({
      mutation: removeProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID },
    })
    expect(ElNotification.success).toHaveBeenCalledWith({ title: '', message: 'Pro sponsorship removed' })
    expect(refetch).toHaveBeenCalled()
  })

  it('shows "Currently sponsored by" when another user sponsors', async () => {
    const otherGroup = { id: 'group-2', name: 'Other Lab' }
    mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS'], 'user-2', otherGroup), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    expect(wrapper.text()).toContain('Currently sponsored by Other Lab.')
    expect(wrapper.find('[data-test-key="project-pro-settings"] b').exists()).toBe(true)
  })

  it('does not show "Currently sponsored by" while the current user id is unknown', async () => {
    const otherGroup = { id: 'group-2', name: 'Other Lab' }
    mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS'], 'user-2', otherGroup), proGroup: PRO_GROUP })
    const wrapper = await mountComponent(null)

    expect(wrapper.find('[data-test-key="project-pro-settings"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Currently sponsored by')
  })
})
