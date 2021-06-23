import { normalizeFormulaModifier } from './normalizeFormulaModifier'

describe('normalizeFormulaModifier', () => {
  const validCases = [
    '-NaCHO',
    '+CHEsSe',
    '-O+C5H12N3O',
  ]
  it.each(validCases)('should validate valid formula modifiers', (input) => {
    expect(normalizeFormulaModifier(input, '+')).toEqual(input)
  })

  const casesWithoutSigns = [
    ['NaCHO', '-', '-NaCHO'],
    ['NaCHO', '+', '+NaCHO'],
    ['NaCHO+CHEsSe', '-', '-NaCHO+CHEsSe'],
    ['NaCHO-CHEsSe', '+', '+NaCHO-CHEsSe'],
  ] as const
  it.each(casesWithoutSigns)('should prepend a sign when necessary', (input, defaultSign, expected) => {
    expect(normalizeFormulaModifier(input, defaultSign)).toEqual(expected)
  })

  const invalidCases = [
    'H2o', // 'o' should be capital
    '',
    '(CH)2', // Parentheses not supported
    'Ad', // Invalid element
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
