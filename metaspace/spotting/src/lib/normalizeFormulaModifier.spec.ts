import { normalizeFormulaModifier } from './normalizeFormulaModifier'

describe('normalizeFormulaModifier', () => {
  const validCases = [
    '-NaCHO',
    '+CHIPS',
    '-O+C5H12N3O',
    // All allowed elements from the regex:
    '+AcAgAlArAsAtAuBBaBeBiBrCCaCdCeClCoCrCsCuDyErEuFFeFrGaGdGeHHeHfHgHoIInIrKKrLaLiLuMgMnMo'
    + 'NNaNbNdNeNiOOsPPaPbPdPmPoPrPtRbReRhRuSSbScSeSiSmSnSrTaTbTcTeTiTlTmUVWXeYYbZnZr',
  ]
  it.each(validCases)('should validate valid formula modifiers', (input) => {
    expect(normalizeFormulaModifier(input, '+')).toEqual(input)
  })

  const casesWithoutSigns = [
    ['NaCHO', '-', '-NaCHO'],
    ['NaCHO', '+', '+NaCHO'],
    ['NaCHOS+CoLa', '-', '-NaCHOS+CoLa'],
    ['NaCHO-CHIPS', '+', '+NaCHO-CHIPS'],
  ] as const
  it.each(casesWithoutSigns)('should prepend a sign when necessary', (input, defaultSign, expected) => {
    expect(normalizeFormulaModifier(input, defaultSign)).toEqual(expected)
  })

  const invalidCases = [
    'H2o', // 'o' should be capital
    '',
    '(CH)2', // Parentheses not supported
    'Ad', // Invalid element
    'D', // Invalid element (Shorthand for Deuterium, but isotopes aren't supported)
    'Ee', // Invalid element (pyMSpec uses it for Electron - not supported)
    // Elements not supported by pyMSpec
    'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr', 'Rf', 'Db', 'Sg',
  ]
  it.each(invalidCases)('should reject invalid formulas', (input) => {
    expect(normalizeFormulaModifier(input, '-')).toBe(null)
  })

  const lowerCaseCases = [
    ['h2o', '+H2O'],
    ['co2', '+CO2'],
    ['nacl', null],
  ] as const
  it.each(lowerCaseCases)('should capitalize trivial formulas', (input, expected) => {
    expect(normalizeFormulaModifier(input, '+')).toBe(expected)
  })
})
