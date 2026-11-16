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
  anatomical_site_coarse: { state: 'empty' as const },
  maldi_matrix_application: { state: 'migrated' as const, note: 'device → method' },
  solvent: { state: 'migrated' as const, note: 'concentration kept in Protocol description' },
  instrument_model: {
    state: 'required-empty' as const,
    source: { legacyKey: 'MS_Analysis.Analyzer', raw: 'Orbitrap' },
  },
  polarity: { state: 'migrated' as const },
}
const unmapped = [
  { legacyKey: 'Sample_Information.Condition' },
  { legacyKey: 'Sample_Information.Sample_Growth_Conditions' },
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
    expect(tags).toContain('not migrated → Anatomical site (coarse)')
    expect(tags).toContain('partly → MALDI matrix application + Protocol')
    expect(tags).toContain('partly → Solvent + Protocol')
    expect(w.findAll('.v2-maptag--none').map((t) => t.text())).toEqual(['no v2 field', 'no v2 field', 'no v2 field'])
  })

  it('emits jump and search', async () => {
    const w = mountView()
    await w
      .findAll('button.v2-maptag')
      .find((b) => b.text() === 'mapped → Organism')!
      .trigger('click')
    expect(w.emitted('jump')![0]).toEqual(['organism'])
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
    expect(w.find('button.v2-maptag').exists()).toBe(false)
    expect(w.text()).toContain('Sample information')
  })
  it('renders partial or null numeric pairs without "undefined" or "null"', () => {
    const cases: [Record<string, unknown> | null, Record<string, unknown> | null, string, string][] = [
      [{ Resolving_Power: 140000 }, { Xaxis: 85 }, '140000 @ — m/z', '85 × — µm'],
      [{ mz: 200 }, { Yaxis: 85 }, '— @ 200 m/z', '— × 85 µm'],
      [{ mz: null, Resolving_Power: null }, { Xaxis: null, Yaxis: null }, '—', '—'],
      [null, null, '—', '—'],
      [{}, {}, '—', '—'],
    ]
    for (const [rp, px, rpText, pxText] of cases) {
      const w = mount(LegacyRecordView, {
        props: {
          legacy: { ...legacy, MS_Analysis: { ...legacy.MS_Analysis, Detector_Resolving_Power: rp, Pixel_Size: px } },
          fields,
          unmapped,
        },
      })
      const values = w.findAll('.v2-legacy__value').map((v) => v.text())
      expect(values).toContain(rpText)
      expect(values).toContain(pxText)
      expect(w.text()).not.toContain('undefined')
      expect(w.text()).not.toContain('null')
    }
  })

  it('shows no Search button when the analyzer has no raw value to search', () => {
    for (const source of [{ legacyKey: 'MS_Analysis.Analyzer', raw: '' }, undefined]) {
      const w = mount(LegacyRecordView, {
        props: {
          legacy,
          fields: { ...fields, instrument_model: { state: 'required-empty' as const, source } },
          unmapped,
        },
      })
      expect(w.find('button.v2-search').exists()).toBe(false)
      expect(w.text()).not.toContain('Search ""')
    }
  })

  it('mapping tag buttons get a focus-visible ring', () => {
    const w = mountView()
    const tag = w.findAll('button.v2-maptag')[0]
    expect(tag.classes()).toEqual(expect.arrayContaining(['focus-visible:outline-none', 'focus-visible:ring-2']))
  })
})
