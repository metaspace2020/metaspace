// metaspace/webapp/src/modules/MetadataEditor/v2/useMetadataV2Form.spec.ts
/* eslint-disable camelcase */
import { nextTick } from 'vue'
import { useMetadataV2Form } from './useMetadataV2Form'
import { createEmptyEnvelope } from './envelope'
import { Term, TermResolver } from './types'

const mouse: Term = { curie: 'NCBITaxon:10090', label: 'Mus musculus', synonyms: ['mouse'] }
const resolver: TermResolver = async (slot, q) => (slot === 'organism' && /mus musculus/i.test(q) ? [mouse] : [])

const legacyJson = JSON.stringify({
  Data_Type: 'Imaging MS',
  Sample_Information: {
    Organism: 'Mus musculus',
    Organism_Part: 'Liver',
    Condition: 'Wildtype',
    Sample_Growth_Conditions: 'N/A',
  },
  Sample_Preparation: {
    Sample_Stabilisation: 'Fresh frozen',
    Tissue_Modification: 'None',
    MALDI_Matrix: 'DHB',
    MALDI_Matrix_Application: 'Sublimation',
    Solvent: 'none',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'MALDI',
    Analyzer: 'Orbitrap',
    Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
    Pixel_Size: { Xaxis: 50, Yaxis: 50 },
  },
})

describe('useMetadataV2Form', () => {
  it('editing a review field acknowledges it', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson, metadataV2Json: null })
    expect(form.fields.value.anatomical_site_coarse?.state).toBe('review')
    const before = form.status.value.reviewCount
    form.setField('anatomical_site_coarse', { value_free_text: 'Liver lobe', curation_state: 'pending_curation' })
    expect(form.acknowledged.value).toContain('anatomical_site_coarse')
    expect(form.status.value.reviewCount).toBe(before - 1)
  })

  it('loads a new form as v2 with an empty envelope', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    expect(form.mode.value).toBe('new')
    expect(form.status.value.requiredTotal).toBe(10)
    expect(form.isDirty.value).toBe(false)
    expect(form.visibleFields.value.map((f) => f.key)).toContain('anatomical_site_coarse')
    expect(form.visibleFields.value.map((f) => f.key)).not.toContain('cell_line_id')
  })

  it('a new form has no default sample type: required and missing, tissue layout, no sample_class', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    expect(form.envelope.value.document.sample.sample_type).toBeUndefined()
    expect(form.envelope.value.document.sample.sample_class).toBeUndefined()
    expect(form.sampleType.value).toBe('tissue')
    expect(form.status.value.missingRequired.map((f) => f.key)).toContain('sample_type')
    expect(form.visibleFields.value.map((f) => f.key)).toEqual(
      expect.arrayContaining(['sample_type', 'sample_stabilisation', 'tissue_modification', 'anatomical_site_coarse'])
    )
    expect(JSON.parse(form.serialize('x')).document.sample).not.toHaveProperty('sample_type')
    expect(form.isDirty.value).toBe(false)

    // picking a type stores it with its class; a template seed keeps its own type
    form.setSampleType('tissue')
    expect(form.envelope.value.document.sample).toMatchObject({ sample_type: 'tissue', sample_class: 'TissueSample' })
    expect(form.status.value.missingRequired.map((f) => f.key)).not.toContain('sample_type')
    const templated = useMetadataV2Form(resolver)
    await templated.loadNew({ metadataV2Json: JSON.stringify(createEmptyEnvelope('plant')) })
    expect(templated.envelope.value.document.sample.sample_type).toBe('plant')
    await templated.loadNew({ metadataJson: legacyJson })
    expect(templated.envelope.value.document.sample.sample_type).toBe('tissue')
  })

  it('the value resolver defaults to the curated lists and can be injected', async () => {
    expect(await useMetadataV2Form(resolver).valueResolver('tissue_modification', 'wash')).toEqual([
      { label: 'Washed' },
    ])
    const custom = vi.fn(async () => [{ label: 'x' }])
    expect(useMetadataV2Form(resolver, custom).valueResolver).toBe(custom)
  })

  it('clearing an optional field unsets it; clearing a required one keeps the empty term', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    form.setField('sex', 'female')
    expect(form.envelope.value.document.sample.sex).toBe('female')
    form.setField('sex', undefined)
    expect('sex' in form.envelope.value.document.sample).toBe(false)
    form.setField('organism', undefined)
    expect(form.envelope.value.document.sample.organism).toEqual({ curation_state: 'pending_curation' })
  })

  it('migrates a legacy dataset and tracks dirtiness through every touch', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({
      id: 'ds1',
      metadataJson: legacyJson,
      metadataV2Json: null,
      uploadDT: '2019-04-17',
      submitter: { name: 'L. Vieira' },
    })
    expect(form.mode.value).toBe('legacy')
    expect(form.legacy.value?.Sample_Information?.Condition).toBe('Wildtype')
    expect(form.legacyMeta.value).toEqual({ uploadDT: '2019-04-17', submitterName: 'L. Vieira' })
    expect(form.fields.value.organism?.state).toBe('migrated')
    expect(form.fields.value.anatomical_site_coarse?.state).toBe('review')
    expect(form.unmapped.value.map((u) => u.legacyKey)).toEqual([
      'Sample_Information.Condition',
      'Sample_Information.Sample_Growth_Conditions',
    ])
    expect(form.isDirty.value).toBe(false)

    form.acknowledge('anatomical_site_coarse')
    expect(form.isDirty.value).toBe(true)
    expect(form.status.value.reviewCount).toBe(form.status.value.reviewCount) // no throw
  })

  it('copies an unmapped value into protocol description and undoes it', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    const before = form.envelope.value.document.sample.protocol_description
    await form.copyUnmapped('Sample_Information.Condition', 'protocol_description')
    expect(form.envelope.value.document.sample.protocol_description).toBe('Condition: Wildtype.')
    expect(form.fields.value.protocol_description?.state).toBe('copied')
    expect(form.copied.value).toEqual(['Sample_Information.Condition'])
    expect(form.status.value.unmappedCount).toBe(1)
    form.undoCopy('protocol_description')
    expect(form.envelope.value.document.sample.protocol_description).toBe(before)
    expect(form.copied.value).toEqual([])
  })

  it('copies into an ontology field by resolving, into an enum by focusing, and dismisses', async () => {
    const form = useMetadataV2Form(async (slot, q) =>
      slot === 'disease' && q === 'melanoma' ? [{ curie: 'MONDO:0005105', label: 'melanoma', synonyms: [] }] : []
    )
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson.replace('Wildtype', 'melanoma') })
    await form.copyUnmapped('Sample_Information.Condition', 'disease')
    expect(form.envelope.value.document.sample.disease).toEqual({
      value_ontology_id: 'MONDO:0005105',
      value_label: 'melanoma',
      curation_state: 'controlled',
    })
    expect(form.fields.value.disease?.state).toBe('copied')
    form.undoCopy('disease')
    await form.copyUnmapped('Sample_Information.Condition', 'health_status')
    expect(form.focusRequest.value).toMatchObject({ key: 'health_status', prefill: 'melanoma' })
    form.dismiss('Sample_Information.Sample_Growth_Conditions')
    expect(form.status.value.unmappedCount).toBe(0)
    form.restoreUnmapped('Sample_Information.Sample_Growth_Conditions')
    expect(form.status.value.unmappedCount).toBe(1)
  })

  it('applies a suggestion and serialises with the dataset name', async () => {
    const form = useMetadataV2Form(async () => [{ curie: 'UBERON:0002107', label: 'liver parenchyma', synonyms: [] }])
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    expect(form.fields.value.anatomical_site_coarse?.suggestion?.curie).toBe('UBERON:0002107')
    form.applySuggestion('anatomical_site_coarse')
    expect(form.envelope.value.document.sample.anatomical_site_coarse?.curation_state).toBe('controlled')
    expect(form.acknowledged.value).toContain('anatomical_site_coarse')
    const json = JSON.parse(form.serialize('My dataset'))
    expect(json.document.dataset_name).toBe('My dataset')
    expect(json.unmodeled.legacy_record.metadata.Sample_Information.Organism).toBe('Mus musculus')
  })

  it('loads a v2 dataset and maps server errors', async () => {
    const env = createEmptyEnvelope()
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds2', metadataV2Json: JSON.stringify(env), uploadDT: '2026-06-01T00:00:00Z' })
    expect(form.mode.value).toBe('v2')
    expect((form as any).pendingDraft).toBeUndefined()

    form.setServerErrors([
      { dataPath: '.Sample_Information.Organism', message: 'too short' },
      { dataPath: '.metadataV2', message: 'bad json' },
    ])
    expect(form.fieldErrors.value.organism).toBe('too short')
    expect(form.otherErrors.value).toEqual(['.metadataV2: bad json'])
    form.setField('organism', { value_free_text: 'x', curation_state: 'pending_curation' })
    await nextTick()
    expect(form.fieldErrors.value.organism).toBeUndefined()
  })

  it('clearing the sample type keeps other values and the tissue layout; reports required-empty', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    const organism = form.envelope.value.document.sample.organism
    const stabilisation = form.envelope.value.document.sample.sample_stabilisation
    form.setSampleType(null)
    expect(form.envelope.value.document.sample.sample_type).toBeUndefined()
    expect(form.envelope.value.document.sample.organism).toEqual(organism)
    expect(form.envelope.value.document.sample.sample_stabilisation).toEqual(stabilisation)
    expect(form.fields.value.sample_type?.state).toBe('required-empty')
    expect(form.status.value.missingRequired.map((f) => f.key)).toContain('sample_type')
    expect(form.status.value.requiredTotal).toBe(10)
    expect(form.visibleFields.value.map((f) => f.key)).toContain('sample_stabilisation')

    form.setSampleType('tissue')
    expect(form.envelope.value.document.sample.sample_type).toBe('tissue')
    expect(form.envelope.value.document.sample.sample_stabilisation).toEqual(stabilisation)
    expect(form.fields.value.sample_type?.state).toBe('migrated')
    expect(form.status.value.missingRequired.map((f) => f.key)).not.toContain('sample_type')
  })

  it('switching tissue -> cell culture drops tissue-only fields, keeps shared ones, and back', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    const organism = form.envelope.value.document.sample.organism
    expect(form.fields.value.anatomical_site_coarse?.state).toBe('review')
    form.setSampleType('cell_culture')
    const sample = form.envelope.value.document.sample
    expect(sample.sample_type).toBe('cell_culture')
    expect(sample.sample_class).toBe('CellCultureSample')
    expect(sample.sample_stabilisation).toBeUndefined()
    expect(sample.organism).toEqual(organism)
    expect(form.visibleFields.value.map((f) => f.key)).toContain('cell_line_id')
    expect(form.visibleFields.value.map((f) => f.key)).not.toContain('sample_stabilisation')
    // hidden fields no longer count as needing review
    expect(form.fields.value.anatomical_site_coarse).toBeUndefined()

    form.setSampleType('tissue')
    const back = form.envelope.value.document.sample
    expect(back.sample_type).toBe('tissue')
    expect(back.organism).toEqual(organism)
    expect(back.cell_line_id).toBeUndefined()
  })

  it('switching tissue -> cell culture -> tissue restores the tissue values and their reports', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    const tissue = {
      sample_stabilisation: { value_free_text: 'Fresh frozen', curation_state: 'pending_curation' },
      tissue_modification: { value_free_text: 'none', curation_state: 'pending_curation' },
    }
    form.setField('sample_stabilisation', tissue.sample_stabilisation)
    form.setField('tissue_modification', tissue.tissue_modification)
    const site = form.envelope.value.document.sample.anatomical_site_coarse
    const siteReport = form.fields.value.anatomical_site_coarse
    expect(siteReport?.state).toBe('review')
    const reviewBefore = form.status.value.reviewCount
    const filledBefore = form.status.value.requiredFilled

    form.setSampleType('cell_culture')
    expect(form.envelope.value.document.sample.anatomical_site_coarse).toBeUndefined()
    form.setSampleType('tissue')

    const back = form.envelope.value.document.sample
    expect(back.sample_stabilisation).toEqual(tissue.sample_stabilisation)
    expect(back.tissue_modification).toEqual(tissue.tissue_modification)
    expect(back.anatomical_site_coarse).toEqual(site)
    expect(form.fields.value.anatomical_site_coarse).toEqual(siteReport)
    expect(form.status.value.reviewCount).toBe(reviewBefore)
    expect(form.status.value.requiredFilled).toBe(filledBefore)
    // the stash is not part of the envelope
    expect(form.serialize('x')).not.toContain('cell_line_id')
  })

  it('a cell line survives a round trip through tissue; the stash never reaches the envelope', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    form.setSampleType('cell_culture')
    const hela = { value_ontology_id: 'EFO:0001185', value_label: 'HeLa', curation_state: 'controlled' }
    form.setField('cell_line_id', hela)
    form.setField('passage_number', 12)
    form.setSampleType('tissue')
    expect(form.serialize('x')).not.toContain('EFO:0001185')
    form.setSampleType('plant')
    form.setSampleType('cell_culture')
    expect(form.envelope.value.document.sample.cell_line_id).toEqual(hela)
    expect(form.envelope.value.document.sample.passage_number).toBe(12)
  })

  it('changing the sample type to a different value drops the migration hint; clearing keeps it', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    expect(form.fields.value.sample_type?.state).toBe('migrated')
    expect(form.fields.value.sample_type?.note).toContain('inferred from legacy')

    // clear + re-pick the same type restores the report
    form.setSampleType(null)
    form.setSampleType('tissue')
    expect(form.fields.value.sample_type?.note).toContain('inferred from legacy')

    // a different value is a user edit: no provenance tag, no hint
    form.setSampleType('cell_culture')
    expect(form.fields.value.sample_type).toBeUndefined()
    expect(form.status.value.missingRequired.map((f) => f.key)).not.toContain('sample_type')

    // also after a clear
    const form2 = useMetadataV2Form(resolver)
    await form2.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    form2.setSampleType(null)
    form2.setSampleType('cell_culture')
    expect(form2.fields.value.sample_type).toBeUndefined()
  })

  it('a typed sample type is stored for curation, fills the field and keeps the class layout', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    form.setSampleType('plant')
    form.setSampleTypeOther('  Organoid  ')
    expect(form.envelope.value.unmodeled.sample_type_other).toEqual({
      value_free_text: 'Organoid',
      curation_state: 'pending_curation',
    })
    expect(form.envelope.value.document.sample.sample_type).toBe('plant')
    expect(form.envelope.value.document.sample.sample_class).toBe('PlantSample')
    expect(form.status.value.missingRequired.map((f) => f.key)).not.toContain('sample_type')
    expect(form.fields.value.sample_type).toBeUndefined()

    // blank text is ignored
    form.setSampleTypeOther('   ')
    expect(form.envelope.value.unmodeled.sample_type_other?.value_free_text).toBe('Organoid')

    // round trip: serialize -> load as a dataset -> the typed value is back, template keeps it too
    const json = form.serialize('ds')
    expect(JSON.parse(json).unmodeled.sample_type_other.value_free_text).toBe('Organoid')
    const loaded = useMetadataV2Form(resolver)
    await loaded.loadDataset({ id: 'ds1', metadataV2Json: json })
    expect(loaded.envelope.value.unmodeled.sample_type_other?.value_free_text).toBe('Organoid')
    expect(loaded.status.value.missingRequired.map((f) => f.key)).not.toContain('sample_type')
    const template = useMetadataV2Form(resolver)
    await template.loadNew({ metadataV2Json: json })
    expect(template.envelope.value.unmodeled.sample_type_other?.value_free_text).toBe('Organoid')
  })

  it('a typed sample type falls back to the tissue layout when the select was empty', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    form.setSampleType(null)
    expect(form.envelope.value.document.sample.sample_type).toBeUndefined()
    form.setSampleTypeOther('Organoid')
    expect(form.envelope.value.document.sample.sample_type).toBe('tissue')
    expect(form.fields.value.sample_type).toBeUndefined()
    expect(form.status.value.missingRequired.map((f) => f.key)).not.toContain('sample_type')
  })

  it('a typed value that only differs in case or spacing from a curated type selects that type', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    form.setSampleTypeOther('Cell culture')
    expect(form.envelope.value.document.sample.sample_type).toBe('cell_culture')
    expect(form.envelope.value.unmodeled.sample_type_other).toBeUndefined()
    form.setSampleTypeOther('TISSUE')
    expect(form.envelope.value.document.sample.sample_type).toBe('tissue')
    expect(form.envelope.value.unmodeled.sample_type_other).toBeUndefined()
  })

  it('choosing a curated sample type or clearing the select drops the typed value', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    form.setSampleTypeOther('Organoid')
    form.setSampleType('cell_culture')
    expect(form.envelope.value.unmodeled.sample_type_other).toBeUndefined()
    expect(form.envelope.value.document.sample.sample_type).toBe('cell_culture')

    form.setSampleTypeOther('Organoid')
    form.setSampleType(null)
    expect(form.envelope.value.unmodeled.sample_type_other).toBeUndefined()
    expect(form.envelope.value.document.sample.sample_type).toBeUndefined()
    expect(form.fields.value.sample_type?.state).toBe('required-empty')
    expect(form.status.value.missingRequired.map((f) => f.key)).toContain('sample_type')
  })

  it('a typed sample type on a legacy edit drops the migration hint', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    expect(form.fields.value.sample_type?.note).toContain('inferred from legacy')
    form.setSampleTypeOther('Organoid')
    expect(form.fields.value.sample_type).toBeUndefined()
    // other provenance stays: this is still a legacy edit
    expect(form.fields.value.anatomical_site_coarse?.state).toBe('review')
  })

  it('markSubmitAttempt flags the form until the next load', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew()
    expect(form.submitAttempted.value).toBe(false)
    form.markSubmitAttempt()
    expect(form.submitAttempted.value).toBe(true)
    expect(form.status.value.missingRequired.map((f) => f.key)).toContain('organism')
    await form.loadNew()
    expect(form.submitAttempted.value).toBe(false)
  })

  it('a legacy dataset copied as a template carries values but no migration provenance', async () => {
    const form = useMetadataV2Form(resolver)
    await form.loadNew({ metadataJson: legacyJson })
    expect(form.mode.value).toBe('new')
    expect(form.envelope.value.document.sample.organism.value_label).toBe('Mus musculus')
    expect(form.envelope.value.document.sample.anatomical_site_coarse?.value_free_text).toBe('Liver')
    expect(form.fields.value).toEqual({})
    expect(form.unmapped.value).toEqual([])
    expect(form.failedSlots.value).toEqual([])
    expect(form.status.value.reviewCount).toBe(0)
    expect(form.status.value.unmappedCount).toBe(0)
    expect(form.status.value.migratedCount).toBe(0)
    expect(form.hasLegacyRecord.value).toBe(false)
    expect(JSON.parse(form.serialize('copy')).unmodeled.legacy_record).toBeUndefined()

    // editing the same legacy dataset keeps every provenance report
    const edit = useMetadataV2Form(resolver)
    await edit.loadDataset({ id: 'ds1', metadataJson: legacyJson })
    expect(edit.fields.value.anatomical_site_coarse?.state).toBe('review')
    expect(edit.status.value.reviewCount).toBeGreaterThan(0)
  })
})
