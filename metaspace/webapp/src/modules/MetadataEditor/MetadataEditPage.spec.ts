import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import MetadataEditPage from './MetadataEditPage.vue'
import store from '../../store'
import router from '../../router'
import { DefaultApolloClient } from '@vue/apollo-composable'
import MetadataEditor from './MetadataEditor.vue'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { mockAdductSuggestions, mockMolecularDatabases } from '../../tests/utils/mockGraphqlData'
import { MetadataV2Form } from './v2/useMetadataV2Form'
import { FieldDef } from './v2/formDefinition'

const mutate = vi.fn().mockResolvedValue({})
// useQuery is stubbed (one canned result for every query); the rest (DefaultApolloClient, useMutation used by the
// real editor's dialogs) is the actual module, so the client provided below is the one components inject.
vi.mock('@vue/apollo-composable', async () => ({
  ...((await vi.importActual('@vue/apollo-composable')) as Record<string, unknown>),
  useQuery: vi.fn(() => ({
    result: ref({
      currentUser: { id: 'u', role: 'user' },
      dataset: { status: 'FINISHED' },
      systemHealth: { canMutate: true, canProcessDatasets: true },
    }),
    // the real MetadataEditor's sections (DataManagementSection, GroupQuota) also read onResult and loading
    loading: ref(false),
    subscribeToMore: vi.fn(),
    onResult: vi.fn(),
  })),
}))

const formValue = (over: Record<string, any>) => ({
  datasetId: 'ds1',
  mode: 'legacy',
  metadataV2Json: '{"document":{}}',
  initialMetadataV2Json: '{"document":{}}',
  metadataDirty: false,
  missingRequired: [],
  metaspaceOptions: { name: 'n', projectIds: ['p1'] },
  initialMetaspaceOptions: { name: 'n', projectIds: [] },
  ...over,
})

const requestFocus = vi.fn()

const mountPage = (value: any) => {
  const editorStub = {
    template: '<div />',
    methods: { getFormValueForSubmit: () => value },
    data: () => ({
      v2Mode: value.mode,
      datasetName: 'mouse_intestine_DHB',
      loadFailed: false,
      v2Complete: false,
      v2: { otherErrors: { value: [] }, requestFocus },
    }),
  }
  return mount(MetadataEditPage, {
    global: {
      plugins: [store, router],
      provide: { [DefaultApolloClient as any]: { mutate } },
      // el-button is registered globally by the app, not by the page
      stubs: { MetadataEditor: editorStub, 'el-button': { template: '<button><slot /></button>' } },
    },
  })
}

describe('MetadataEditPage', () => {
  beforeAll(() => store.replaceState({ ...store.state, route: { params: { dataset_id: 'ds1' } } } as any))
  beforeEach(() => {
    mutate.mockClear()
    requestFocus.mockClear()
  })

  it('legacy edit, untouched but complete: migrates on save (metadataV2Json + other settings)', async () => {
    const w = mountPage(formValue({}))
    await (w.vm as any).handleSubmit()
    await flushPromises()
    const input = mutate.mock.calls[0][0].variables.input
    expect(input.projectIds).toEqual(['p1'])
    expect(input.metadataV2Json).toBe('{"document":{}}')
    expect(input.metadataJson).toBeUndefined()
  })

  it('legacy edit, metadata untouched with gaps: asks for the required v2 fields instead of saving', async () => {
    const w = mountPage(formValue({ missingRequired: [{ key: 'instrument_model', label: 'Instrument model' }] }))
    await (w.vm as any).handleSubmit()
    await flushPromises()
    expect(mutate).not.toHaveBeenCalled()
    expect(requestFocus).toHaveBeenCalledWith('instrument_model')
  })

  it('legacy edit, dirty with gaps: shows the alert instead of sending', async () => {
    const w = mountPage(
      formValue({
        metadataDirty: true,
        missingRequired: [{ key: 'instrument_model', label: 'Instrument model' }],
      })
    )
    await (w.vm as any).handleSubmit()
    await flushPromises()
    expect(mutate).not.toHaveBeenCalled()
    expect(w.text()).toContain('Instrument model is required and empty')
  })

  it('gap alert: focuses the first missing field and links every gap to its field', async () => {
    const w = mountPage(
      formValue({
        metadataDirty: true,
        missingRequired: [
          { key: 'sample_stabilisation', label: 'Sample stabilisation' },
          { key: 'instrument_model', label: 'Instrument model' },
        ],
      })
    )
    await (w.vm as any).handleSubmit()
    await flushPromises()
    // the first gap is focused as soon as the alert appears
    expect(requestFocus).toHaveBeenCalledTimes(1)
    expect(requestFocus).toHaveBeenLastCalledWith('sample_stabilisation')
    const links = w.findAll('.gap-link')
    expect(links.map((l) => l.text())).toEqual(['Sample stabilisation', 'Instrument model'])
    await links[1].trigger('click')
    expect(requestFocus).toHaveBeenLastCalledWith('instrument_model')
  })

  it('header: title with the dataset name, Cancel and Submit', async () => {
    const w = mountPage(formValue({}))
    await flushPromises()
    expect(w.find('.page-header__heading').text()).toBe('Edit dataset — mouse_intestine_DHB')
    const buttons = w.findAll('.page-header > :not(.page-header__title)').map((b) => b.text())
    expect(buttons).toEqual(['Cancel', 'Submit'])
  })

  it('legacy edit, dirty and complete: sends metadataV2Json', async () => {
    const w = mountPage(formValue({ metadataDirty: true }))
    await (w.vm as any).handleSubmit()
    await flushPromises()
    expect(mutate.mock.calls[0][0].variables.input.metadataV2Json).toBe('{"document":{}}')
  })

  it('shows server errors that match no field', async () => {
    mutate.mockRejectedValueOnce({
      graphQLErrors: [
        {
          message: JSON.stringify({
            type: 'failed_validation',
            validation_errors: [{ dataPath: '.metadataV2', message: 'bad json' }],
          }),
        },
      ],
    })
    const w = mountPage(formValue({ metadataDirty: true }))
    await (w.vm as any).handleSubmit()
    await flushPromises()
    expect(w.text()).toContain('.metadataV2: bad json')
  })

  it('v2 edit: sends metadataV2Json only when changed', async () => {
    const same = mountPage(formValue({ mode: 'v2' }))
    await (same.vm as any).handleSubmit()
    await flushPromises()
    expect(mutate.mock.calls[0][0].variables.input.metadataV2Json).toBeUndefined()
    const changed = mountPage(formValue({ mode: 'v2', metadataV2Json: '{"document":{"x":1}}' }))
    await (changed.vm as any).handleSubmit()
    await flushPromises()
    expect(mutate.mock.calls[1][0].variables.input.metadataV2Json).toBe('{"document":{"x":1}}')
  })

  it('v2 edit, nothing changed: does not save, goes back like Cancel', async () => {
    const back = vi.spyOn(router, 'back')
    // same options (array order aside) and the metadata as loaded: nothing differs from the dataset
    const value = formValue({
      mode: 'v2',
      metaspaceOptions: { name: 'n', projectIds: ['p2', 'p1'], performEnrichment: true },
      initialMetaspaceOptions: { name: 'n', projectIds: ['p1', 'p2'], performEnrichment: true },
    })
    const page = mountPage(value)
    await (page.vm as any).handleSubmit()
    await flushPromises()
    expect(mutate).not.toHaveBeenCalled()
    expect(back).toHaveBeenCalledTimes(1)
    expect((page.vm as any).state.isSubmitting).toBe(false)
    page.unmount()
    back.mockRestore()
  })
})

/** A value that fills a required v2 field of the given editor kind. */
const fillValue = (def: FieldDef): unknown => {
  switch (def.editor) {
    case 'enum':
      return def.enumOptions?.[0]?.value
    case 'integer':
      return 1
    case 'textarea':
      return 'protocol'
    case 'resolvingPower':
      return { mz: 200, Resolving_Power: 140000 }
    case 'pixelSize':
      return { Xaxis: 10, Yaxis: 10 }
    default:
      return { value_free_text: `${def.key} value`, curation_state: 'pending_curation' }
  }
}

/** Fills every missing required v2 field (the sample type first, it decides which fields are required). */
const completeRecord = (form: MetadataV2Form): void => {
  for (let pass = 0; pass < 3 && form.status.value.missingRequired.length > 0; pass++) {
    form.status.value.missingRequired.forEach((def) => {
      if (def.key === 'sample_type') form.setSampleType('tissue')
      else form.setField(def.key, fillValue(def))
    })
  }
}

describe('MetadataEditPage with the real MetadataEditor', () => {
  const legacyDataset = {
    databases: [{ id: mockMolecularDatabases()[0].id }],
    metadataJson: JSON.stringify({
      Data_Type: 'Imaging MS',
      Sample_Information: { Organism: 'Human', Organism_Part: 'Liver', Condition: 'Live' },
      MS_Analysis: { Polarity: 'Positive', Ionisation_Source: 'MALDI', Analyzer: 'Orbitrap' },
    }),
    metadataV2Json: null,
    principalInvestigator: null,
    uploadDT: '2019-04-17T00:00:00Z',
  }
  const gapText = 'The metadata is not complete yet'
  beforeAll(() => store.replaceState({ ...store.state, route: { params: { dataset_id: 'ds1' } } } as any))

  const mountReal = async () => {
    const client = initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => null,
        adductSuggestions: mockAdductSuggestions,
        allMolecularDBs: mockMolecularDatabases,
        ontologyTermSuggestions: () => [],
        dataset: () => legacyDataset,
      }),
    })
    const clientMutate = vi.spyOn(client, 'mutate')
    const page = mount(MetadataEditPage, {
      attachTo: document.body,
      global: {
        plugins: [store, router],
        provide: { [DefaultApolloClient as any]: client },
        stubs: { 'el-button': { template: '<button><slot /></button>' } },
      },
    })
    const editor = page.findComponent(MetadataEditor)
    await (editor.vm as any).state.loadingPromise
    await flushPromises()
    await nextTick()
    // annotation settings the mock schema cannot provide (ppm comes from configJson); the v2 record stays partial
    Object.assign((editor.vm as any).state.metaspaceOptions, { ppm: 3, groupId: 'g1', name: 'mouse_intestine_DHB' })
    const form = (editor.vm as any).v2 as MetadataV2Form
    const metadataToggle = () => page.find('.v2-card .section-card__toggle')
    return { page, form, clientMutate, metadataToggle }
  }

  it('submit with gaps expands the collapsed Metadata card; the alert clears once the record is complete', async () => {
    const { page, form, clientMutate, metadataToggle } = await mountReal()
    expect(form.mode.value).toBe('legacy')
    await metadataToggle().trigger('click')
    expect(metadataToggle().attributes('aria-expanded')).toBe('false')
    expect(page.find('.v2-card .section-card__body').exists()).toBe(false)

    await (page.vm as any).handleSubmit()
    await flushPromises()
    expect(clientMutate).not.toHaveBeenCalled()
    expect(page.text()).toContain(gapText)
    const firstGap = form.status.value.missingRequired[0]
    expect(page.find('.gap-link').text()).toBe(firstGap.label)
    // requestFocus on the first gap opened the collapsed card and its field is rendered again
    expect(metadataToggle().attributes('aria-expanded')).toBe('true')
    expect(page.find(`.v2-card [data-field-key="${firstGap.key}"]`).exists()).toBe(true)

    completeRecord(form)
    await flushPromises()
    expect(page.text()).not.toContain(gapText)
    page.unmount()
  })

  it('shows a server validation error that matches no field in the alert', async () => {
    const { page, form, clientMutate } = await mountReal()
    completeRecord(form)
    await flushPromises()
    clientMutate.mockRejectedValueOnce({
      graphQLErrors: [
        {
          message: JSON.stringify({
            type: 'failed_validation',
            validation_errors: [{ dataPath: '.metadataV2.unknown_block', message: 'is not allowed' }],
          }),
        },
      ],
    })
    await (page.vm as any).handleSubmit()
    await flushPromises()
    expect(clientMutate).toHaveBeenCalledTimes(1)
    expect(JSON.parse(clientMutate.mock.calls[0][0].variables!.input.metadataV2Json).document.sample.sample_type).toBe(
      'tissue'
    )
    const alert = page.find('.el-alert')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('.metadataV2.unknown_block: is not allowed')
    expect(alert.text()).not.toContain('is required and empty')
    page.unmount()
  })
})
