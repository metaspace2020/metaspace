import { readFileSync } from 'fs'
import { resolve } from 'path'
import { get } from 'lodash-es'
import { ENUM_VALUES, FIELD_DEFS, fieldByKey, fieldsFor, requiredFor } from './formDefinition'

// The vendored schema is read with fs on purpose: it lives outside the webapp root and must never be
// bundled. This test is the only place the two are compared.
const schemaPath = resolve(__dirname, '../../../../../metadata/linkml/generated/metaspace_submission.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const defs = schema.$defs

const CLASS_BY_TYPE: Record<string, string> = {
  tissue: 'TissueSample',
  cell_culture: 'CellCultureSample',
  plant: 'PlantSample',
  environmental: 'EnvironmentalSample',
}

describe('formDefinition vs vendored schema', () => {
  it('hard-coded enums equal the schema enums', () => {
    expect(ENUM_VALUES.SampleType).toEqual(defs.SampleType.enum)
    expect(ENUM_VALUES.PolarityEnum).toEqual(defs.PolarityEnum.enum)
    expect(ENUM_VALUES.SexEnum).toEqual(defs.SexEnum.enum)
    expect(ENUM_VALUES.HealthStatusEnum).toEqual(defs.HealthStatusEnum.enum)
  })

  it.each(Object.entries(CLASS_BY_TYPE))('every document field for %s exists in %s', (sampleType, className) => {
    fieldsFor(sampleType as any)
      .filter((f) => f.path.startsWith('document.'))
      .forEach((f) => {
        const [, section, slot] = f.path.split('.')
        const container = section === 'sample' ? defs[className] : defs.AcquisitionInfo
        expect(container.properties[slot], `${f.key} -> ${f.path}`).toBeDefined()
      })
  })

  it.each(Object.entries(CLASS_BY_TYPE))(
    'schema-required slots for %s are required in the catalogue',
    (sampleType, className) => {
      const required = new Set(requiredFor(sampleType as any).map((f) => f.path.split('.')[2]))
      defs[className].required
        .filter((s: string) => s !== 'sample_class')
        .forEach((slot: string) => {
          expect(required.has(slot), slot).toBe(true)
        })
      defs.AcquisitionInfo.required.forEach((slot: string) => expect(required.has(slot), slot).toBe(true))
    }
  )

  it('keys are unique and legacy paths point at ims.json fields', () => {
    const keys = FIELD_DEFS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    const ims = require('../../../lib/metadataSchemas/ims.json')
    FIELD_DEFS.filter((f) => f.legacyPath).forEach((f) => {
      const [section, field] = f.legacyPath!.split('.')
      expect(get(ims, ['properties', section, 'properties', field]), f.legacyPath).toBeDefined()
    })
  })

  it('tissue requires exactly the union of schema and legacy projection requirements', () => {
    expect(
      requiredFor('tissue')
        .map((f) => f.key)
        .sort()
    ).toEqual(
      [
        'sample_type',
        'organism',
        'anatomical_site_coarse',
        'sample_stabilisation',
        'tissue_modification',
        'polarity',
        'ionization_source',
        'instrument_model',
        'resolving_power',
        'pixel_size',
      ].sort()
    )
    expect(fieldByKey('solvent').tier).toBe('advanced')
  })
})
