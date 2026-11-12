import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { vi, Mock } from 'vitest'
import { DefaultApolloClient, useQuery } from '@vue/apollo-composable'
import type { DocumentNode } from 'graphql'
import store from '../../store'
import router from '../../router'
import ProjectProSettings, { SHARE_FEATURES_WARNING } from './ProjectProSettings'
import { ElMessageBox, ElNotification, ElOption, ElSelect } from '../../lib/element-plus'
import {
  currentUserProGroupQuery,
  PROJECT_ENTITLEMENT_LABELS,
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
        // Use the real ElSelect, its options and dropdown (globally stubbed in setupTests) so props and tags are exercised.
        stubs: { 'el-select': false, 'el-option': false, 'el-tooltip': false },
        provide: { [DefaultApolloClient as unknown as symbol]: { mutate } },
      },
      props: { projectId: PROJECT_ID, currentUserId },
    })
    await flushPromises()
    await nextTick()
    return wrapper
  }

  const ALL_KEYS: ProjectEntitlement[] = [
    'PRIVATE_SUBMISSION',
    'PRIVATE_RESUBMISSION',
    'EXPERIMENTS',
    'DIFF_ANALYSIS',
    'SEGMENTATION',
  ]

  const select = (wrapper: VueWrapper) => wrapper.findComponent(ElSelect)

  const selectedValues = (wrapper: VueWrapper): string[] => select(wrapper).props('modelValue') as string[]

  const choose = async (wrapper: VueWrapper, value: string[]): Promise<void> => {
    select(wrapper).vm.$emit('update:modelValue', value)
    await nextTick()
  }

  const optionValues = (wrapper: VueWrapper): string[] =>
    wrapper.findAllComponents(ElOption).map((o) => o.props('value') as string)

  const optionLabel = (wrapper: VueWrapper, value: string): string | undefined =>
    wrapper
      .findAllComponents(ElOption)
      .find((o) => o.props('value') === value)
      ?.props('label') as string | undefined

  const saveButton = (wrapper: VueWrapper) => wrapper.find('[data-test-key="save-pro-settings"]')

  let confirmSpy: Mock

  beforeEach(() => {
    mutate = vi.fn().mockResolvedValue({})
    vi.spyOn(ElNotification, 'success').mockImplementation(() => ({}) as ReturnType<typeof ElNotification.success>)
    // Granting new features asks for confirmation first; accept it unless a test says otherwise.
    confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
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

  it('renders the five options for a manager in a pro group with no sponsorship, Save disabled', async () => {
    mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    expect(wrapper.find('[data-test-key="project-pro-settings"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Pro settings')
    expect(wrapper.text()).toContain("Usage counts against Pro Lab's plan.")
    expect(select(wrapper).exists()).toBe(true)
    expect(select(wrapper).props('multiple')).toBe(true)
    expect(select(wrapper).props('placeholder')).toBe('Select Pro features to share')
    expect(select(wrapper).attributes('data-test-key')).toBe('entitlement-select')
    expect(optionValues(wrapper)).toEqual(['__all__', ...ALL_KEYS])
    for (const key of ALL_KEYS) {
      expect(
        wrapper
          .findAllComponents(ElOption)
          .find((o) => o.props('value') === key)
          ?.attributes('data-test-key')
      ).toBe(`entitlement-${key}`)
    }
    expect(optionLabel(wrapper, '__all__')).toBe('Select all')
    expect(selectedValues(wrapper)).toEqual([])
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.text()).not.toContain('Currently sponsored by')
  })

  it('pre-selects stored entitlements and enables Save after a change', async () => {
    mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS', 'SEGMENTATION']), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    expect(selectedValues(wrapper)).toEqual(['EXPERIMENTS', 'SEGMENTATION'])
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()

    await choose(wrapper, ['EXPERIMENTS', 'SEGMENTATION', 'DIFF_ANALYSIS'])

    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('calls setProjectSponsorship with the selection on Save', async () => {
    const { refetch } = mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['EXPERIMENTS', 'SEGMENTATION'])
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(mutate).toHaveBeenCalledWith({
      mutation: setProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID, entitlements: ['EXPERIMENTS', 'SEGMENTATION'] },
    })
    expect(ElNotification.success).toHaveBeenCalledWith({ title: '', message: 'Pro settings saved' })
    expect(refetch).toHaveBeenCalled()
  })

  it('asks for confirmation, naming the features being granted, before saving new features', async () => {
    mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS']), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['PRIVATE_SUBMISSION', 'PRIVATE_RESUBMISSION', 'EXPERIMENTS'])
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy).toHaveBeenCalledWith(
      `${SHARE_FEATURES_WARNING} Features being shared: Private submission, Private resubmission.`,
      'Share Pro features with this project?',
      expect.objectContaining({ confirmButtonText: 'Share features' })
    )
    expect(mutate).toHaveBeenCalledWith({
      mutation: setProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID, entitlements: ['PRIVATE_SUBMISSION', 'PRIVATE_RESUBMISSION', 'EXPERIMENTS'] },
    })
  })

  it('does not save when the confirmation is cancelled', async () => {
    confirmSpy.mockRejectedValue('cancel')
    const { refetch } = mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['PRIVATE_SUBMISSION'])
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(mutate).not.toHaveBeenCalled()
    expect(ElNotification.success).not.toHaveBeenCalled()
    expect(refetch).not.toHaveBeenCalled()
    expect(selectedValues(wrapper)).toEqual(['PRIVATE_SUBMISSION'])
  })

  it('saves without confirmation when only removing features', async () => {
    mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS', 'SEGMENTATION']), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['EXPERIMENTS'])
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledWith({
      mutation: setProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID, entitlements: ['EXPERIMENTS'] },
    })
  })

  it('sends entitlements in display order regardless of click order', async () => {
    mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['SEGMENTATION', 'EXPERIMENTS'])
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(mutate).toHaveBeenCalledWith({
      mutation: setProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID, entitlements: ['EXPERIMENTS', 'SEGMENTATION'] },
    })
  })

  it('calls removeProjectSponsorship when every feature is cleared', async () => {
    const { refetch } = mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS']), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, [])
    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledWith({
      mutation: removeProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID },
    })
    expect(ElNotification.success).toHaveBeenCalledWith({ title: '', message: 'Pro settings saved' })
    expect(refetch).toHaveBeenCalled()
  })

  it('"Select all" selects all five features', async () => {
    mockQueries({ sponsorship: makeSponsorship(['EXPERIMENTS']), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['EXPERIMENTS', '__all__'])

    expect(selectedValues(wrapper)).toEqual(ALL_KEYS)
    expect(optionLabel(wrapper, '__all__')).toBe('Deselect all')
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('"Deselect all" clears the selection when all five are selected', async () => {
    mockQueries({ sponsorship: makeSponsorship([...ALL_KEYS]), proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    expect(optionLabel(wrapper, '__all__')).toBe('Deselect all')
    await choose(wrapper, [...ALL_KEYS, '__all__'])

    expect(selectedValues(wrapper)).toEqual([])
    expect(optionLabel(wrapper, '__all__')).toBe('Select all')
  })

  it('never keeps "__all__" in the model or tags', async () => {
    mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['__all__'])
    expect(selectedValues(wrapper)).not.toContain('__all__')
    const tagTexts = wrapper.findAll('.el-select__tags .el-tag').map((t) => t.text())
    expect(tagTexts).toEqual(ALL_KEYS.map((k) => PROJECT_ENTITLEMENT_LABELS[k]))
    expect(tagTexts).not.toContain('Select all')
    expect(tagTexts).not.toContain('Deselect all')

    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(mutate).toHaveBeenCalledWith({
      mutation: setProjectSponsorshipMutation,
      variables: { projectId: PROJECT_ID, entitlements: ALL_KEYS },
    })
  })

  it('disables the select while saving', async () => {
    let resolveMutate: (value: unknown) => void = () => undefined
    mutate.mockImplementation(() => new Promise((resolve) => (resolveMutate = resolve)))
    mockQueries({ sponsorship: null, proGroup: PRO_GROUP })
    const wrapper = await mountComponent()

    await choose(wrapper, ['EXPERIMENTS'])
    expect(select(wrapper).props('disabled')).toBe(false)
    await saveButton(wrapper).trigger('click')
    await nextTick()
    expect(select(wrapper).props('disabled')).toBe(true)

    resolveMutate({})
    await flushPromises()
    expect(select(wrapper).props('disabled')).toBe(false)
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
    expect(select(wrapper).exists()).toBe(false)
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
