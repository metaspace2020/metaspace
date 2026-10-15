import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import MetadataEditPage from './MetadataEditPage.vue'
import store from '../../store'
import router from '../../router'
import { DefaultApolloClient } from '@vue/apollo-composable'

const mutate = vi.fn().mockResolvedValue({})
// The factory runs once, so DefaultApolloClient imported above is the same Symbol the page injects.
vi.mock('@vue/apollo-composable', () => ({
  useQuery: vi.fn(() => ({
    result: ref({
      currentUser: { id: 'u', role: 'user' },
      dataset: { status: 'FINISHED' },
      systemHealth: { canMutate: true, canProcessDatasets: true },
    }),
    subscribeToMore: vi.fn(),
  })),
  DefaultApolloClient: Symbol('apollo'),
}))

const formValue = (over: Record<string, any>) => ({
  datasetId: 'ds1',
  mode: 'legacy',
  metadataV2Json: '{"document":{}}',
  initialMetadataV2Json: '{"document":{}}',
  metadataDirty: false,
  missingRequired: [],
  reviewPending: 0,
  metaspaceOptions: { name: 'n', projectIds: ['p1'] },
  initialMetaspaceOptions: { name: 'n', projectIds: [] },
  ...over,
})

const requestFocus = vi.fn()
const acknowledgeAll = vi.fn()

const mountPage = (value: any) => {
  const editorStub = {
    template: '<div />',
    methods: { getFormValueForSubmit: () => value },
    data: () => ({
      v2Mode: value.mode,
      datasetName: 'mouse_intestine_DHB',
      loadFailed: false,
      v2Complete: false,
      v2: { otherErrors: { value: [] }, requestFocus, acknowledgeAll },
    }),
  }
  return mount(MetadataEditPage, {
    global: {
      plugins: [store, router],
      provide: { [DefaultApolloClient as any]: { mutate } },
      stubs: { MetadataEditor: editorStub },
    },
  })
}

describe('MetadataEditPage', () => {
  beforeAll(() => store.replaceState({ ...store.state, route: { params: { dataset_id: 'ds1' } } } as any))
  beforeEach(() => {
    mutate.mockClear()
    requestFocus.mockClear()
    acknowledgeAll.mockClear()
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
    expect(w.text()).toContain('The v2 record is not complete yet')
    expect(requestFocus).toHaveBeenCalledWith('instrument_model')
  })

  it('legacy edit, dirty with gaps: shows the alert instead of sending', async () => {
    const w = mountPage(
      formValue({
        metadataDirty: true,
        missingRequired: [{ key: 'instrument_model', label: 'Instrument model' }],
        reviewPending: 2,
      })
    )
    await (w.vm as any).handleSubmit()
    await flushPromises()
    expect(mutate).not.toHaveBeenCalled()
    expect(w.text()).toContain('Instrument model is required and empty')
    expect(w.text()).not.toContain('need review')
    expect(w.text()).not.toContain('draft')
  })

  it('gap alert: focuses the first missing field and links every gap to its field', async () => {
    const w = mountPage(
      formValue({
        metadataDirty: true,
        missingRequired: [
          { key: 'sample_stabilisation', label: 'Sample stabilisation' },
          { key: 'instrument_model', label: 'Instrument model' },
        ],
        reviewPending: 3,
        firstReviewKey: 'organism',
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

  it('with only reviews pending: marks them reviewed and submits', async () => {
    const w = mountPage(formValue({ metadataDirty: true, reviewPending: 1, firstReviewKey: 'maldi_matrix' }))
    await (w.vm as any).handleSubmit()
    await flushPromises()
    expect(acknowledgeAll).toHaveBeenCalledTimes(1)
    expect(requestFocus).not.toHaveBeenCalled()
    expect(mutate.mock.calls[0][0].variables.input.metadataV2Json).toBe('{"document":{}}')
    expect(w.text()).not.toContain('The v2 record is not complete yet')
  })

  it('gap alert clears itself once the editor reports the record complete', async () => {
    const w = mountPage(
      formValue({ metadataDirty: true, missingRequired: [{ key: 'instrument_model', label: 'Instrument model' }] })
    )
    await (w.vm as any).handleSubmit()
    await flushPromises()
    expect(w.text()).toContain('The v2 record is not complete yet')
    ;(w.vm as any).editor.v2Complete = true
    await nextTick()
    await nextTick()
    expect(w.text()).not.toContain('The v2 record is not complete yet')
  })

  it('header: title with the dataset name, mode tag, Cancel and Submit only (no Save draft)', async () => {
    const w = mountPage(formValue({}))
    await flushPromises()
    expect(w.find('.page-header__heading').text()).toBe('Edit dataset — mouse_intestine_DHB')
    expect(w.find('.page-header').text()).toContain('Legacy v1 → v2')
    // el-button is registered globally in the app, so here it renders as a plain custom element
    const buttons = w.findAll('.page-header > :not(.page-header__title)').map((b) => b.text())
    expect(buttons).toEqual(['Cancel', 'Submit'])
    expect(w.text()).not.toContain('Save draft')
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
})
