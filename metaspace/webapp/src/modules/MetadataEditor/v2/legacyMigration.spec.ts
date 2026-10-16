/* eslint-disable camelcase */
import { migrateLegacy } from './legacyMigration'
import { LegacyMetadata, Term, TermResolver } from './types'

const TERMS: Record<string, Term[]> = {
  'organism:mus musculus': [{ curie: 'NCBITaxon:10090', label: 'Mus musculus', synonyms: ['mouse'] }],
  // "Intestines" (plural) has no exact label match, so it is kept as free text
  'anatomical_site_coarse:intestines': [
    { curie: 'UBERON:0000160', label: 'intestine', synonyms: [] },
    { curie: 'UBERON:0002108', label: 'small intestine', synonyms: [] },
  ],
  'maldi_matrix:2,5-dihydroxybenzoic acid': [
    { curie: 'CHEBI:28722', label: '2,5-dihydroxybenzoic acid', synonyms: ['DHB'] },
  ],
  'solvent:acetonitrile': [{ curie: 'CHEBI:38472', label: 'acetonitrile', synonyms: ['ACN'] }],
  'ionization_source:matrix-assisted laser desorption ionization': [
    { curie: 'MS:1000075', label: 'matrix-assisted laser desorption ionization', synonyms: ['MALDI'] },
  ],
  'ionization_source:ap-smaldi5': [
    { curie: 'MS:1000075', label: 'matrix-assisted laser desorption ionization', synonyms: [] },
  ],
  'instrument_model:orbitrap': [{ curie: 'MS:1000484', label: 'orbitrap', synonyms: [] }],
}
const resolver: TermResolver = async (slot, q) => TERMS[`${slot}:${q.toLowerCase()}`] || []

const legacy: LegacyMetadata = {
  Data_Type: 'Imaging MS',
  Sample_Information: {
    Organism: 'Mus musculus (mouse)',
    Organism_Part: 'Intestines',
    Condition: 'Wildtype',
    Sample_Growth_Conditions: 'None',
  },
  Sample_Preparation: {
    Sample_Stabilisation: 'Flash Frozen',
    Tissue_Modification: 'None',
    MALDI_Matrix: 'DHB',
    MALDI_Matrix_Application: 'TM-Sprayer',
    Solvent: '70% ACN',
  },
  MS_Analysis: {
    Polarity: 'Positive',
    Ionisation_Source: 'AP-SMALDI5',
    Analyzer: 'Orbitrap',
    Detector_Resolving_Power: { mz: 200, Resolving_Power: 140000 },
    Pixel_Size: { Xaxis: 85, Yaxis: 85 },
  },
  Additional_Information: { Supplementary: 'batch 42' },
  Submitted_By: { Submitter: { Email: 'a@b.c' } },
}

describe('migrateLegacy', () => {
  it('migrates a full legacy record', async () => {
    const r = await migrateLegacy(legacy, resolver, () => '2026-10-14T00:00:00Z')
    const { sample, acquisition } = r.envelope.document
    expect(sample.sample_type).toBe('tissue')
    expect(sample.organism).toEqual({
      value_ontology_id: 'NCBITaxon:10090',
      value_label: 'Mus musculus',
      curation_state: 'controlled',
    })
    expect(r.fields.organism).toMatchObject({
      state: 'migrated',
      source: { legacyKey: 'Sample_Information.Organism', raw: 'Mus musculus (mouse)' },
    })

    expect(sample.anatomical_site_coarse).toEqual({ value_free_text: 'Intestines', curation_state: 'pending_curation' })
    expect(r.fields.anatomical_site_coarse?.state).toBe('migrated')

    expect(sample.sample_stabilisation).toEqual({ value_label: 'fresh frozen', curation_state: 'free_text_accepted' })
    expect(r.fields.sample_stabilisation?.state).toBe('migrated')
    expect(sample.tissue_modification).toEqual({ value_label: 'none', curation_state: 'free_text_accepted' })

    expect(acquisition.maldi_matrix).toEqual({
      value_ontology_id: 'CHEBI:28722',
      value_label: '2,5-dihydroxybenzoic acid',
      curation_state: 'controlled',
    })
    expect(acquisition.maldi_matrix_application).toEqual({
      value_label: 'spraying',
      curation_state: 'free_text_accepted',
    })
    expect(r.fields.maldi_matrix_application?.state).toBe('migrated')
    // the parsed compound matches a CHEBI label exactly, so it migrates green; the concentration goes to Protocol description
    expect(acquisition.solvent).toEqual({
      value_ontology_id: 'CHEBI:38472',
      value_label: 'acetonitrile',
      curation_state: 'controlled',
    })
    expect(r.fields.solvent).toMatchObject({ state: 'migrated', note: 'concentration kept in Protocol description' })

    expect(acquisition.polarity.user_value.value_ontology_id).toBe('MS:1000130')
    expect(r.fields.polarity?.state).toBe('migrated')
    expect(acquisition.ionization_source.user_value).toEqual({
      value_free_text: 'AP-SMALDI5',
      curation_state: 'pending_curation',
    })
    expect(r.fields.ionization_source?.state).toBe('migrated')
    expect(acquisition.instrument_model.user_value).toEqual({
      value_ontology_id: 'MS:1000484',
      value_label: 'orbitrap',
      curation_state: 'controlled',
    })
    expect(r.fields.instrument_model?.state).toBe('migrated')

    expect(sample.protocol_description).toBe(
      'Matrix application device: TM-Sprayer. Solvent: 70% ACN. Supplementary: batch 42.'
    )
    expect(r.fields.protocol_description?.state).toBe('migrated')

    expect(r.envelope.unmodeled.Detector_Resolving_Power).toEqual({ mz: 200, Resolving_Power: 140000 })
    expect(r.envelope.unmodeled.Pixel_Size).toEqual({ Xaxis: 85, Yaxis: 85 })
    expect(r.envelope.unmodeled.Submitted_By).toEqual({ Submitter: { Email: 'a@b.c' } })
    expect(r.envelope.unmodeled.legacy_record).toEqual({ metadata: legacy, migrated_at: '2026-10-14T00:00:00Z' })

    expect(r.unmapped.map((u) => u.legacyKey)).toEqual([
      'Sample_Information.Condition',
      'Sample_Information.Sample_Growth_Conditions',
    ])
    expect(r.fields.sex?.state).toBe('new')
    expect(r.failedSlots).toEqual([])
  })

  it('"0.1% TFA in 70% ACN" migrates as acetonitrile: the solvent wins over the additive', async () => {
    const tfa: Term = { curie: 'CHEBI:45892', label: 'trifluoroacetic acid', synonyms: ['TFA'] }
    const spy = vi.fn(async (slot: string, q: string) =>
      slot === 'solvent' && q.toLowerCase() === 'trifluoroacetic acid' ? [tfa] : resolver(slot, q)
    )
    const r = await migrateLegacy(
      { ...legacy, Sample_Preparation: { ...legacy.Sample_Preparation, Solvent: '0.1% TFA in 70% ACN' } },
      spy
    )
    expect(r.envelope.document.acquisition.solvent).toEqual({
      value_ontology_id: 'CHEBI:38472',
      value_label: 'acetonitrile',
      curation_state: 'controlled',
    })
    expect(r.fields.solvent).toMatchObject({
      state: 'migrated',
      source: { legacyKey: 'Sample_Preparation.Solvent', raw: '0.1% TFA in 70% ACN' },
      note: 'concentration kept in Protocol description',
    })
    // the additive is never looked up, even though it would resolve; the full text stays in the protocol
    expect(spy.mock.calls.filter(([slot]) => slot === 'solvent')).toEqual([['solvent', 'acetonitrile']])
    expect(r.envelope.document.sample.protocol_description).toContain('Solvent: 0.1% TFA in 70% ACN.')
    expect(r.failedSlots).toEqual([])
  })

  it('never stores placeholders and marks required targets as required-empty', async () => {
    const r = await migrateLegacy(
      {
        Sample_Information: { Organism: 'N/A', Organism_Part: '-', Condition: 'none' },
        Sample_Preparation: {
          Sample_Stabilisation: '',
          Tissue_Modification: 'none',
          MALDI_Matrix: 'none',
          MALDI_Matrix_Application: 'none',
          Solvent: 'none',
        },
        MS_Analysis: { Polarity: 'Negative', Ionisation_Source: 'DESI', Analyzer: 'FTICR' },
      },
      async () => []
    )
    expect(r.envelope.document.sample.organism).toEqual({ curation_state: 'pending_curation' })
    expect(r.fields.organism?.state).toBe('required-empty')
    expect(r.fields.sample_stabilisation?.state).toBe('required-empty')
    expect(r.envelope.document.acquisition.maldi_matrix).toBeUndefined()
    expect(r.fields.maldi_matrix?.state).toBe('empty')
    expect(r.envelope.document.acquisition.instrument_model.user_value).toEqual({ curation_state: 'pending_curation' })
    expect(r.fields.instrument_model).toMatchObject({ state: 'required-empty', source: { raw: 'FTICR' } })
    expect(r.fields.instrument_model?.note).toContain('FTICR')
    expect(r.fields.resolving_power?.state).toBe('required-empty')
    expect(r.unmapped.map((u) => u.legacyKey)).toEqual(['Sample_Information.Condition'])
  })

  it('degrades a failed resolver to the raw text and records the slot', async () => {
    const failing: TermResolver = async (slot, q) => {
      if (slot === 'organism') {
        throw new Error('timeout')
      }
      return resolver(slot, q)
    }
    const r = await migrateLegacy(legacy, failing)
    expect(r.envelope.document.sample.organism).toEqual({
      value_free_text: 'Mus musculus (mouse)',
      curation_state: 'pending_curation',
    })
    expect(r.fields.organism?.state).toBe('migrated')
    expect(r.failedSlots).toEqual(['organism'])
  })

  it('keeps a failed instrument lookup as typed', async () => {
    const failing: TermResolver = async (slot, q) => {
      if (slot === 'instrument_model') {
        throw new Error('timeout')
      }
      return resolver(slot, q)
    }
    const r = await migrateLegacy(legacy, failing)
    expect(r.envelope.document.acquisition.instrument_model.user_value).toEqual({
      value_free_text: 'Orbitrap',
      curation_state: 'pending_curation',
    })
    expect(r.fields.instrument_model?.state).toBe('migrated')
    expect(r.failedSlots).toContain('instrument_model')
  })

  it('matches on synonyms and tolerates missing sections', async () => {
    const r = await migrateLegacy({ Sample_Information: { Organism: 'mouse' } }, resolver)
    expect(r.envelope.document.sample.organism).toEqual({
      value_free_text: 'mouse',
      curation_state: 'pending_curation',
    })
    const r2 = await migrateLegacy({ Sample_Information: { Organism: 'mouse' } }, async (slot, q) =>
      slot === 'organism' && q === 'mouse' ? TERMS['organism:mus musculus'] : []
    )
    expect(r2.envelope.document.sample.organism.curation_state).toBe('controlled')
    expect(r2.fields.polarity?.state).toBe('required-empty')
  })

  it('matches polarity case-insensitively and keeps unrecognised values as unmapped rows', async () => {
    const ok = await migrateLegacy({ MS_Analysis: { Polarity: 'positive' } }, async () => [])
    expect(ok.envelope.document.acquisition.polarity.user_value.value_ontology_id).toBe('MS:1000130')
    expect(ok.fields.polarity?.state).toBe('migrated')
    const bad = await migrateLegacy({ MS_Analysis: { Polarity: 'Both' } }, async () => [])
    expect(bad.fields.polarity?.state).toBe('required-empty')
    expect(bad.unmapped.map((u) => u.legacyKey)).toContain('MS_Analysis.Polarity')
  })

  it('keeps partial resolving power and pixel size in unmodeled', async () => {
    const r = await migrateLegacy(
      {
        MS_Analysis: { Detector_Resolving_Power: { mz: 200 }, Pixel_Size: { Xaxis: 50 } } as any,
      },
      async () => []
    )
    expect(r.envelope.unmodeled.Detector_Resolving_Power).toEqual({ mz: 200, Resolving_Power: null })
    expect(r.fields.resolving_power?.state).toBe('required-empty')
    expect(r.envelope.unmodeled.Pixel_Size).toEqual({ Xaxis: 50, Yaxis: null })
    expect(r.fields.pixel_size?.state).toBe('required-empty')
  })
})
