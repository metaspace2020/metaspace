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

  it('parses solvent strings into a compound, its percentage and the remainder', () => {
    expect(parseSolvent('70% ACN')).toEqual({ compound: 'acetonitrile', percent: 70, remainder: '70% ACN' })
    expect(parseSolvent('MeOH')).toEqual({ compound: 'methanol', percent: null, remainder: null })
    expect(parseSolvent('50% MeOH 0.1% TFA')).toEqual({
      compound: 'methanol',
      percent: 50,
      remainder: '50% MeOH 0.1% TFA',
    })
    expect(parseSolvent('acetonitrile')).toEqual({ compound: 'acetonitrile', percent: null, remainder: null })
    expect(parseSolvent('none of these')).toEqual({ compound: null, percent: null, remainder: 'none of these' })
  })

  it('a later solvent token wins over an earlier additive and keeps its own percentage', () => {
    expect(parseSolvent('0.1% TFA in 70% ACN')).toEqual({
      compound: 'acetonitrile',
      percent: 70,
      remainder: '0.1% TFA in 70% ACN',
    })
    expect(parseSolvent('0.1% FA, 80% MeOH')).toMatchObject({ compound: 'methanol', percent: 80 })
    // among solvents the first one still wins
    expect(parseSolvent('70% ACN / 30% water')).toMatchObject({ compound: 'acetonitrile', percent: 70 })
    expect(parseSolvent('water 30% ACN')).toMatchObject({ compound: 'water', percent: null })
    // an additive alone is still recognised
    expect(parseSolvent('0.1% TFA')).toEqual({ compound: 'trifluoroacetic acid', percent: 0.1, remainder: '0.1% TFA' })
  })

  it('parses a percentage glued to the solvent', () => {
    expect(parseSolvent('70%ACN')).toEqual({ compound: 'acetonitrile', percent: 70, remainder: '70%ACN' })
    expect(parseSolvent('0.1%TFA in 50%MeOH')).toMatchObject({ compound: 'methanol', percent: 50 })
  })

  it('strips trailing punctuation from solvent tokens', () => {
    expect(parseSolvent('ACN.')).toEqual({ compound: 'acetonitrile', percent: null, remainder: null })
    expect(parseSolvent('ACN,')).toEqual({ compound: 'acetonitrile', percent: null, remainder: null })
    expect(parseSolvent('70% ACN.')).toEqual({ compound: 'acetonitrile', percent: 70, remainder: '70% ACN.' })
    expect(parseSolvent('(MeOH)')).toMatchObject({ compound: 'methanol' })
  })

  it.each(['(none)', '(not specified)', 'N/A (unknown)', '- (n/a)', '( none )', 'not specified'])(
    '%s is a parenthetical placeholder',
    (v) => {
      expect(isPlaceholder(v)).toBe(true)
    }
  )

  it('a real value with a placeholder parenthetical is not a placeholder', () => {
    expect(isPlaceholder('Mus musculus (none)')).toBe(false)
    expect(isPlaceholder('none (washed in ethanol)')).toBe(false)
    expect(isPlaceholder('(liver)')).toBe(false)
  })

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'prototype key %s never hits a table',
    (key) => {
      expect(lookupTable(key, STABILISATION_TABLE)).toBeNull()
      expect(applyAliases(key, MATRIX_ALIASES)).toBe(key)
      expect(parseSolvent(key)).toEqual({ compound: null, percent: null, remainder: key })
    }
  )
})
