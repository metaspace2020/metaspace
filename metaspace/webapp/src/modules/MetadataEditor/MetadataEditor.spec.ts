/* eslint-disable camelcase */
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import MetadataEditor from './MetadataEditor.vue'
import { initMockGraphqlClient } from '../../tests/utils/mockGraphqlClient'
import { mockAdductSuggestions, mockMolecularDatabases } from '../../tests/utils/mockGraphqlData'
import store from '../../store'
import router from '../../router'
import { DefaultApolloClient } from '@vue/apollo-composable'
import { createEmptyEnvelope, setAtPath } from './v2/envelope'

const mockMetadata = {
  Data_Type: 'Imaging MS',
  Sample_Information: { Organism: 'Human', Organism_Part: 'Liver', Condition: 'Live', Sample_Growth_Conditions: 'N/A' },
  Sample_Preparation: {
    Sample_Stabilisation: 'foo',
    Tissue_Modification: 'bar',
    MALDI_Matrix: 'baz',
    MALDI_Matrix_Application: 'qux',
    Solvent: 'quux',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'none',
    Analyzer: 'none',
    Detector_Resolving_Power: { mz: 123, Resolving_Power: 123456 },
  },
  Additional_Information: { Supplementary: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
}
const v2Envelope = setAtPath(createEmptyEnvelope(), 'document.sample.organism', {
  value_ontology_id: 'NCBITaxon:9606',
  value_label: 'Homo sapiens',
  curation_state: 'controlled',
})
const legacyDataset = {
  databases: [{ id: mockMolecularDatabases()[0].id }],
  metadataJson: JSON.stringify(mockMetadata),
  metadataV2Json: null,
  principalInvestigator: null,
  uploadDT: '2019-04-17T00:00:00Z',
}
const v2Dataset = { ...legacyDataset, metadataV2Json: JSON.stringify(v2Envelope) }

const mountEditor = (
  queries: Record<string, any>,
  props: Record<string, any> = {},
  stubs: Record<string, any> = {}
) => {
  const graphqlMockClient = initMockGraphqlClient({
    Query: () => ({
      currentUserLastSubmittedDataset: () => null,
      adductSuggestions: mockAdductSuggestions,
      allMolecularDBs: mockMolecularDatabases,
      ontologyTermSuggestions: () => [],
      ...queries,
    }),
  })
  return mount(MetadataEditor, {
    global: { plugins: [store, router], provide: { [DefaultApolloClient]: graphqlMockClient }, stubs },
    props,
  })
}

describe('MetadataEditor', () => {
  beforeAll(async () => {
    store.replaceState({ ...store.state, route: { path: '/upload', query: {} } } as any)
  })
  beforeEach(() => vi.resetAllMocks())

  // structural, not a whole-page snapshot: mocked selects serialise function props (transpiled source with
  // module-import counters), so any import change in the editor broke the snapshot without a visible change
  it('renders a new upload as the v2 form in three cards', async () => {
    const wrapper = mountEditor({})
    await wrapper.vm.state.loadingPromise
    await flushPromises()
    await nextTick()
    expect(wrapper.vm.v2Mode).toBe('new')
    expect(wrapper.findComponent({ name: 'MetadataV2Section' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'FormSection' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'MigrationBanner' }).exists()).toBe(false)
    expect(wrapper.findAll('#md-section-list > .section-card .section-card__title').map((t) => t.text())).toEqual([
      'Metadata',
      'Data management',
      'Annotation settings',
    ])
    expect(wrapper.find('.v2-card [data-field-key="sample_type"]').exists()).toBe(true)
    expect(wrapper.find('.md-data-management').exists()).toBe(true)
    expect(wrapper.find('.md-annotation-settings').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Save draft')
  })

  it('loads a legacy dataset into migration mode', async () => {
    const wrapper = mountEditor({ dataset: () => legacyDataset }, { datasetId: '123' })
    await wrapper.vm.state.loadingPromise
    await flushPromises()
    await nextTick()
    // `v2` is the raw composable object (nested refs are not unwrapped by the instance proxy), so `.value` is needed
    expect(wrapper.vm.v2Mode).toBe('legacy')
    expect(wrapper.findComponent({ name: 'MigrationBanner' }).exists()).toBe(true)
    expect(wrapper.vm.v2.envelope.value.document.sample.organism).toEqual({
      value_free_text: 'Human',
      curation_state: 'pending_curation',
    })
    expect(wrapper.vm.v2.envelope.value.unmodeled.Detector_Resolving_Power).toEqual({
      mz: 123,
      Resolving_Power: 123456,
    })
    expect(wrapper.vm.state.metaspaceOptions).toMatchSnapshot('metaspaceOptions')
    // values pending review never lock Public; only missing required fields do
    expect(wrapper.vm.publicDisabledReason).not.toContain('need review')
    // the banner sits above the Metadata card, not inside it
    const banner = wrapper.find('.v2-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.element.nextElementSibling?.classList.contains('v2-card')).toBe(true)
  })

  it('wraps the page in Metadata, Data management and Annotation settings cards with counters', async () => {
    const wrapper = mountEditor({ dataset: () => v2Dataset }, { datasetId: '123' })
    await wrapper.vm.state.loadingPromise
    await flushPromises()
    await nextTick()
    const titles = wrapper.findAll('.section-card__title').map((t) => t.text())
    expect(titles).toEqual(['Metadata', 'Data management', 'Annotation settings'])
    expect(wrapper.find('.md-data-management .section-card__right').text()).toMatch(/^\d of 2 required$/)
    expect(wrapper.find('.md-annotation-settings .section-card__right').text()).toMatch(/^\d of 5 required$/)
    expect(wrapper.findAll('.metadata-section')).toHaveLength(0)
    wrapper.vm.state.metaspaceOptions.name = 'my dataset'
    expect(wrapper.vm.datasetName).toBe('my dataset')
  })

  it('shows "Copy from another dataset…" in the Metadata header on new uploads only', async () => {
    // the global ElPopover mock drops the #reference slot; render it here
    const popoverStub = { template: '<div class="stub-popover"><slot name="reference" /><slot /></div>' }
    const upload = mountEditor({}, {}, { 'el-popover': popoverStub })
    await upload.vm.state.loadingPromise
    await flushPromises()
    await nextTick()
    const button = upload.find('.v2-card .section-card__right .md-copy-from-dataset')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('Copy from another dataset…')
    // the old right-aligned row above the card is gone
    expect(upload.text()).not.toContain('Copy metadata from another dataset')

    // the remote dataset select lives in the popover
    expect(upload.find('.v2-header-actions .mock-el-select, .v2-header-actions .el-select').exists()).toBe(true)

    const edit = mountEditor({ dataset: () => v2Dataset }, { datasetId: '123' }, { 'el-popover': popoverStub })
    await edit.vm.state.loadingPromise
    await flushPromises()
    await nextTick()
    expect(edit.find('.md-copy-from-dataset').exists()).toBe(false)
    expect(edit.find('.v2-header-actions').exists()).toBe(false)
  })

  it('shows a load error instead of a fake migration when the dataset cannot be loaded', async () => {
    const wrapper = mountEditor({ dataset: () => null }, { datasetId: '123' })
    await wrapper.vm.state.loadingPromise
    await flushPromises()
    expect(wrapper.vm.loadFailed).toBe(true)
    expect(wrapper.text()).toContain('could not be loaded')
    expect(wrapper.findComponent({ name: 'MetadataV2Section' }).exists()).toBe(false)
  })

  it('loads a v2 dataset without migration', async () => {
    const wrapper = mountEditor({ dataset: () => v2Dataset }, { datasetId: '123' })
    await wrapper.vm.state.loadingPromise
    await flushPromises()
    await nextTick()
    expect(wrapper.vm.v2Mode).toBe('v2')
    expect(wrapper.findComponent({ name: 'MigrationBanner' }).exists()).toBe(false)
    expect(wrapper.vm.v2.envelope.value.document.sample.organism.value_label).toBe('Homo sapiens')
  })

  it("seeds a new upload from the user's last dataset, legacy or v2", async () => {
    const legacy = mountEditor({ currentUserLastSubmittedDataset: () => legacyDataset })
    await legacy.vm.state.loadingPromise
    await flushPromises()
    expect(legacy.vm.v2Mode).toBe('new')
    expect(legacy.vm.v2.envelope.value.document.sample.organism.value_free_text).toBe('Human')
    expect(legacy.vm.v2.envelope.value.unmodeled.legacy_record).toBeUndefined()
    // a template copies values only: no migration tags, hints or review gating
    expect(legacy.vm.v2.fields.value).toEqual({})
    expect(legacy.vm.v2.unmapped.value).toEqual([])
    expect(legacy.vm.v2.status.value.reviewCount).toBe(0)

    const v2 = mountEditor({ currentUserLastSubmittedDataset: () => v2Dataset })
    await v2.vm.state.loadingPromise
    await flushPromises()
    expect(v2.vm.v2.envelope.value.document.sample.organism.value_label).toBe('Homo sapiens')
  })

  it('returns metadataV2Json with the dataset name on submit, and blocks on missing required fields', async () => {
    const wrapper = mountEditor({ dataset: () => v2Dataset }, { datasetId: '123' })
    await wrapper.vm.state.loadingPromise
    await flushPromises()
    wrapper.vm.state.metaspaceOptions.name = 'my dataset'
    expect(wrapper.vm.getFormValueForSubmit()).toBeNull() // required fields missing in v2 mode
    wrapper.vm.v2.mode.value = 'legacy'
    const value = wrapper.vm.getFormValueForSubmit()
    expect(value.metadataDirty).toBe(false)
    expect(JSON.parse(value.metadataV2Json).document.dataset_name).toBe('my dataset')
    expect(value.missingRequired.length).toBeGreaterThan(0)
  })

  it("should be able to load another user's dataset", async () => {
    const submitterId = 'submitter id'
    const mockUser = { id: submitterId, name: 'mock user', groups: [{ group: { id: 'group', name: 'group name' } }] }
    const mockUserFn = vi.fn().mockReturnValue(mockUser)
    const wrapper = mountEditor(
      { dataset: () => ({ ...legacyDataset, submitter: { id: submitterId, name: 'mock user' } }), user: mockUserFn },
      { datasetId: '123' }
    )
    await wrapper.vm.state.loadingPromise
    await flushPromises()
    await nextTick()
    expect(mockUserFn).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.state.submitter).toMatchObject(mockUser)
    expect(wrapper.vm.v2.legacyMeta.value.submitterName).toBe('mock user')
  })
})
