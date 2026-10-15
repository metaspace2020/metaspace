// metaspace/webapp/src/modules/MetadataEditor/v2/components/LegacyRecordView.spec.ts
import { mount } from '@vue/test-utils'
import { LegacyRecordView, legacyProvenance } from './LegacyRecordView'

const legacy = {
  Sample_Information: {
    Organism: 'Mus musculus (mouse)',
    Organism_Part: 'Intestine',
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
}
const fields = {
  organism: { state: 'migrated' as const },
  anatomical_site_coarse: { state: 'review' as const },
  maldi_matrix_application: { state: 'review' as const, note: 'device → method' },
  solvent: { state: 'review' as const, note: 'concentration kept in Protocol description' },
  instrument_model: {
    state: 'required-empty' as const,
    source: { legacyKey: 'MS_Analysis.Analyzer', raw: 'Orbitrap' },
  },
  polarity: { state: 'migrated' as const },
}
const unmapped = [
  {
    legacyKey: 'Sample_Information.Condition',
    label: 'Condition',
    raw: 'Wildtype',
    hint: '',
    targets: ['disease' as const],
    safeToDismiss: false,
  },
  {
    legacyKey: 'Sample_Information.Sample_Growth_Conditions',
    label: 'Sample growth conditions',
    raw: 'None',
    hint: '',
    targets: ['protocol_description' as const],
    safeToDismiss: true,
  },
]
const mountView = () =>
  mount(LegacyRecordView, {
    props: {
      legacy,
      fields,
      unmapped,
      readOnlyProvenance: false,
    },
  })

describe('LegacyRecordView', () => {
  it('shows v1 groups, provenance line and mapping tags', () => {
    const w = mountView()
    expect(w.text()).toContain('Sample information')
    expect(w.text()).toContain('Sample preparation')
    expect(w.text()).toContain('MS analysis')
    expect(w.text()).toContain('140000 @ 200 m/z')
    expect(w.text()).toContain('85 × 85 µm')
    const tags = w.findAll('button.v2-maptag').map((t) => t.text())
    expect(tags).toContain('mapped → Organism')
    expect(tags).toContain('review → Anatomical site (coarse)')
    expect(tags).toContain('partly → MALDI matrix application + Protocol')
    expect(tags).toContain('partly → Solvent + Protocol')
    expect(w.findAll('.v2-maptag--none').map((t) => t.text())).toEqual(['no v2 field', 'no v2 field', 'no v2 field'])
  })

  it('emits jump, copy and search', async () => {
    const w = mountView()
    await w
      .findAll('button.v2-maptag')
      .find((b) => b.text() === 'mapped → Organism')!
      .trigger('click')
    expect(w.emitted('jump')![0]).toEqual(['organism'])
    await w
      .findAll('button.v2-copy')
      .find((b) => b.text().includes('Copy to'))!
      .trigger('click')
    expect(w.emitted('copy')![0]).toEqual(['Sample_Information.Condition'])
    await w.find('button.v2-search').trigger('click')
    expect(w.emitted('search')![0]).toEqual(['Orbitrap'])
  })

  it('shows the dataset description first, with a dash when empty', () => {
    const w = mount(LegacyRecordView, {
      props: { legacy, fields, unmapped, descriptionText: 'Mouse intestine section' },
    })
    const first = w.find('.section-row')
    expect(first.find('.section-row__title').text()).toBe('Dataset description')
    expect(first.find('.v2-legacy__value').text()).toBe('Mouse intestine section')
    const empty = mountView()
    expect(empty.find('.v2-legacy__description .v2-legacy__value').text()).toBe('—')
  })

  it('formats the provenance line', () => {
    expect(legacyProvenance('2019-04-17T10:00:00Z', 'L. Vieira')).toBe(
      'As recorded 17 Apr 2019 by L. Vieira · schema v1 · read-only'
    )
    expect(legacyProvenance(null, null)).toBe('As recorded · schema v1 · read-only')
  })

  it('an empty legacy value gets no mapping tag; tags are not underlined', () => {
    const w = mount(LegacyRecordView, {
      props: {
        legacy: { ...legacy, Sample_Preparation: { ...legacy.Sample_Preparation, Solvent: '' } },
        fields,
        unmapped,
      },
    })
    const tags = w.findAll('button.v2-maptag')
    expect(tags.map((t) => t.text())).not.toContain('partly → Solvent + Protocol')
    expect(tags.map((t) => t.text())).toContain('partly → MALDI matrix application + Protocol')
    expect(tags.every((t) => !t.classes().includes('underline'))).toBe(true)
  })

  it('hides actions in read-only provenance mode', () => {
    const w = mount(LegacyRecordView, {
      props: {
        legacy,
        fields: {},
        unmapped: [],
        readOnlyProvenance: true,
      },
    })
    expect(w.find('button.v2-copy').exists()).toBe(false)
    expect(w.find('button.v2-maptag').exists()).toBe(false)
    expect(w.text()).toContain('Sample information')
  })
})
