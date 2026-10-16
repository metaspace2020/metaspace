import { mount, flushPromises, VueWrapper } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import Uppy from '@uppy/core'
import { SpyInstance } from 'vitest'
import UploadPage from './UploadPage.vue'
import MetadataEditor from './MetadataEditor.vue'
import UppyUploader from '../../components/UppyUploader/UppyUploader.vue'
import store from '../../store'
import router from '../../router'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { mockAdductSuggestions, mockMolecularDatabases } from '../../tests/utils/mockGraphqlData'
import { MetadataV2Form } from './v2/useMetadataV2Form'
import { FieldDef } from './v2/formDefinition'

// useQuery is stubbed (signed-in user, healthy system); the rest of the module is real, so the mock client provided
// below is what the real MetadataEditor queries.
vi.mock('@vue/apollo-composable', async () => ({
  ...((await vi.importActual('@vue/apollo-composable')) as Record<string, unknown>),
  useQuery: vi.fn(() => ({
    result: ref({
      currentUser: { id: 'u', role: 'user' },
      systemHealth: { canMutate: true, canProcessDatasets: true },
    }),
    loading: ref(false),
    subscribeToMore: vi.fn(),
    onResult: vi.fn(),
  })),
}))

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

const SUBMIT_ARMED = 'submitting after upload'
const FILES_MISSING = 'Add the .imzML and .ibd files to upload first.'

describe('UploadPage', () => {
  let upload: ReturnType<typeof vi.spyOn>
  let fetchSpy: SpyInstance<Parameters<typeof global.fetch>, ReturnType<typeof global.fetch>>
  let uuidSeq = 0
  let uppyDebug: ReturnType<typeof vi.spyOn>

  beforeAll(() => store.replaceState({ ...store.state, route: { path: '/upload', query: {} } } as any))
  beforeEach(() => {
    // the page enables Uppy's debug logger; keep its "[Uppy] …" lines out of the test output
    const debug = console.debug
    uppyDebug = vi.spyOn(console, 'debug').mockImplementation((...args: unknown[]) => {
      if (!String(args[0]).startsWith('[Uppy]')) debug(...args)
    })
    // never reach the network: Uppy's upload() and the upload-UUID endpoint are replaced
    upload = vi.spyOn(Uppy.prototype, 'upload').mockResolvedValue(undefined as any)
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(
      () =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ uuid: `uuid-${++uuidSeq}`, uuidSignature: 'sig' }),
        }) as any
    )
  })
  afterEach(() => {
    upload.mockRestore()
    fetchSpy.mockRestore()
    uppyDebug.mockRestore()
    document.body.innerHTML = ''
  })

  const mountPage = async () => {
    const client = initMockGraphqlClient({
      Query: () => ({
        currentUserLastSubmittedDataset: () => null,
        adductSuggestions: mockAdductSuggestions,
        allMolecularDBs: mockMolecularDatabases,
        ontologyTermSuggestions: () => [],
      }),
    })
    const page = mount(UploadPage, {
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
    const form = (editor.vm as any).v2 as MetadataV2Form
    const submit = () => page.findAll('.page-header button').find((b) => b.text() === 'Submit')!
    const uploader = () => page.findComponent(UppyUploader)
    /** Drops files on the uploader's dropzone, as a user would. */
    const dropFiles = async (...names: string[]) => {
      page.findComponent({ name: 'Dropzone' }).vm.$emit(
        'upload',
        names.map((n) => new File(['abc'], n))
      )
      // let Uppy's add/upload promise chain and the page's file-added handler settle
      await new Promise((r) => setTimeout(r, 20))
      await flushPromises()
    }
    /** Makes the editor's form valid: a complete v2 record and the required annotation settings. */
    const fillForm = async () => {
      completeRecord(form)
      Object.assign((editor.vm as any).state.metaspaceOptions, {
        name: 'mouse_intestine_DHB',
        databaseIds: [mockMolecularDatabases()[0].id],
        adducts: ['+H'],
        ppm: 3,
        groupId: 'g1',
      })
      await flushPromises()
    }
    return { page, form, submit, uploader, dropFiles, fillForm }
  }

  const counter = (page: VueWrapper) => page.find('.md-files-counter').text()
  const progressLabel = (page: VueWrapper) => page.find('.md-files-progress').attributes('aria-label')

  it('Submit with an invalid form does not arm auto-submit and reopens the card at the first gap', async () => {
    const { page, form, submit } = await mountPage()
    const metadataToggle = () => page.find('.v2-card .section-card__toggle')
    await metadataToggle().trigger('click')
    expect(metadataToggle().attributes('aria-expanded')).toBe('false')
    const firstGap = form.status.value.missingRequired[0]
    expect(firstGap).toBeDefined()

    await submit().trigger('click')
    await flushPromises()
    expect((page.vm as any).state.autoSubmit).toBe(false)
    expect(page.text()).not.toContain(SUBMIT_ARMED)
    // the request reopened the collapsed Metadata card and the first gap's field is rendered and highlighted
    expect(metadataToggle().attributes('aria-expanded')).toBe('true')
    expect(page.find(`.v2-card [data-field-key="${firstGap.key}"]`).exists()).toBe(true)
    expect(form.submitAttempted.value).toBe(true)
    page.unmount()
  })

  it('a valid form without files shows the "Add the .imzML and .ibd files" guard; with a file it arms', async () => {
    const { page, submit, dropFiles, fillForm } = await mountPage()
    await fillForm()
    expect(document.body.textContent).not.toContain(FILES_MISSING)

    await submit().trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain(FILES_MISSING)
    expect(page.text()).not.toContain(SUBMIT_ARMED)

    await dropFiles('sample.imzML')
    await submit().trigger('click')
    await flushPromises()
    expect(page.text()).toContain(SUBMIT_ARMED)
    page.unmount()
  })

  it('Replace keeps the mounted uploader (same uploaderKey); removing the last file remounts it', async () => {
    const { page, uploader, dropFiles } = await mountPage()
    const input = page.find('input[type="file"]').element as HTMLInputElement
    vi.spyOn(input, 'click').mockImplementation(() => undefined)
    const keyAtMount = (page.vm as any).state.uploaderKey
    const fetchesAtMount = fetchSpy.mock.calls.length
    const firstUploader = uploader().vm.$.uid

    await dropFiles('sample.imzML')
    page.findAllComponents({ name: 'FileSlot' })[0].vm.$emit('replace')
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()
    // a fresh storage key was fetched, but the uploader (whose picker is open) was not remounted
    expect(fetchSpy.mock.calls.length).toBe(fetchesAtMount + 1)
    expect((page.vm as any).state.storageKey.uuid).toBe(`uuid-${uuidSeq}`)
    expect((page.vm as any).state.uploaderKey).toBe(keyAtMount)
    expect(uploader().vm.$.uid).toBe(firstUploader)

    await dropFiles('other.imzML')
    page.findAllComponents({ name: 'FileSlot' })[0].vm.$emit('remove')
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()
    expect((page.vm as any).state.uploaderKey).toBe(keyAtMount + 1)
    expect(uploader().vm.$.uid).not.toBe(firstUploader)
    page.unmount()
  })

  it('the header counter and progress reflect the slots: present and uploaded files', async () => {
    const { page, uploader, dropFiles } = await mountPage()
    expect(counter(page)).toBe('0 of 2 files')
    expect(progressLabel(page)).toBe('0 of 2 files selected, 0 uploaded')

    await dropFiles('sample.imzML')
    expect(counter(page)).toBe('1 of 2 files')
    expect(progressLabel(page)).toBe('1 of 2 files selected, 0 uploaded')
    expect(page.find('.md-files-progress').classes()).not.toContain('is-success')

    uploader().vm.$emit('files-changed', [
      { extension: 'imzML', status: 'COMPLETE' },
      { extension: 'ibd', status: 'UPLOADING' },
    ])
    await nextTick()
    expect(counter(page)).toBe('2 of 2 files')
    expect(progressLabel(page)).toBe('2 of 2 files selected, 1 uploaded')

    uploader().vm.$emit('files-changed', [
      { extension: 'imzML', status: 'COMPLETE' },
      { extension: 'ibd', status: 'COMPLETE' },
    ])
    await nextTick()
    expect(progressLabel(page)).toBe('2 of 2 files selected, 2 uploaded')
    expect(page.find('.md-files-progress').classes()).toContain('is-success')
    page.unmount()
  })

  it('does not auto-proceed: the upload starts only once both files are present', async () => {
    const { page, dropFiles } = await mountPage()
    await dropFiles('sample.imzML')
    // autoProceed would schedule upload() a few ms after the first file
    await new Promise((r) => setTimeout(r, 50))
    expect(upload).not.toHaveBeenCalled()
    expect(page.findAllComponents({ name: 'FileSlot' })[0].props('waitingFor')).toBe('ibd')

    await dropFiles('sample.ibd')
    expect(upload).toHaveBeenCalledTimes(1)
    page.unmount()
  })
})
