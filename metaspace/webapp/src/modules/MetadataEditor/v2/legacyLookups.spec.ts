import {
  applyAliases,
  isPlaceholder,
  lookupTable,
  MATRIX_ALIASES,
  matrixApplication,
  normaliseText,
  parseSolvent,
  SOURCE_ALIASES,
  STABILISATION_TABLE,
  TISSUE_MODIFICATION_TABLE,
} from './legacyLookups'

describe('legacyLookups', () => {
  it.each(['', '  ', 'none', 'None', 'N/A', 'n/a', 'NA', '-', 'not applicable', 'null'])('%s is a placeholder', (v) => {
    expect(isPlaceholder(v)).toBe(true)
  })
  it('real values are not placeholders', () => {
    expect(isPlaceholder('Nonenal')).toBe(false)
    expect(isPlaceholder('Mus musculus')).toBe(false)
  })

  it('normalises whitespace, case and trailing parentheticals', () => {
    expect(normaliseText('  Mus   musculus (mouse) ')).toBe('mus musculus')
    expect(normaliseText('Homo sapiens')).toBe('homo sapiens')
    expect(normaliseText('2,5-DHB (DHB)')).toBe('2,5-dhb')
  })

  it('applies matrix and source aliases case-insensitively', () => {
    expect(applyAliases('DHB', MATRIX_ALIASES)).toBe('2,5-dihydroxybenzoic acid')
    expect(applyAliases('chca', MATRIX_ALIASES)).toBe('alpha-cyano-4-hydroxycinnamic acid')
    expect(applyAliases('MALDI', SOURCE_ALIASES)).toBe('matrix-assisted laser desorption ionization')
    expect(applyAliases('AP-SMALDI5', SOURCE_ALIASES)).toBe('AP-SMALDI5')
  })

  it('looks up stabilisation and tissue modification tables', () => {
    expect(lookupTable('Flash Frozen', STABILISATION_TABLE)).toBe('fresh frozen')
    expect(lookupTable('FFPE', STABILISATION_TABLE)).toBe('formalin-fixed paraffin-embedded')
    expect(lookupTable('cryo-section', STABILISATION_TABLE)).toBeNull()
    expect(lookupTable('None', TISSUE_MODIFICATION_TABLE)).toBe('none')
    expect(lookupTable('Trypsin digestion', TISSUE_MODIFICATION_TABLE)).toBe('enzymatic digestion')
  })

  it('maps application devices to methods and keeps the device name', () => {
    expect(matrixApplication('TM-Sprayer')).toEqual({ method: 'spraying', device: 'TM-Sprayer' })
    expect(matrixApplication('HTX TM Sprayer')).toEqual({ method: 'spraying', device: 'HTX TM Sprayer' })
    expect(matrixApplication('Sublimation')).toEqual({ method: 'sublimation', device: null })
    expect(matrixApplication('ImagePrep')).toEqual({ method: 'spraying (vibrational)', device: 'ImagePrep' })
    expect(matrixApplication('hand pipetting')).toEqual({ method: null, device: null })
    expect(matrixApplication('Electrospray deposition')).toEqual({ method: 'electrospray deposition', device: null })
  })

  it('parses solvent strings into a compound and the remainder', () => {
    expect(parseSolvent('70% ACN')).toEqual({ compound: 'acetonitrile', remainder: '70% ACN' })
    expect(parseSolvent('MeOH')).toEqual({ compound: 'methanol', remainder: null })
    expect(parseSolvent('50% MeOH 0.1% TFA')).toEqual({ compound: 'methanol', remainder: '50% MeOH 0.1% TFA' })
    expect(parseSolvent('acetonitrile')).toEqual({ compound: 'acetonitrile', remainder: null })
  })
})
