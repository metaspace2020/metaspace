import { normalizeCurationText, isPlaceholderText } from './normalize'

describe('modules/metadataCuration/normalize', () => {
  const rows: [string | null | undefined, string, boolean][] = [
    ['  Mus   musculus (mouse) ', 'mus musculus', false],
    ['Disease-1', 'disease-1', false],
    ['(liver)', '', false],
    ['N/A (unknown)', 'n/a', true],
    ['none', 'none', true],
    ['', '', true],
    [null, '', true],
    [undefined, '', true],
    ['Mus musculus (none)', 'mus musculus', false],
  ]

  rows.forEach(([input, normalized, placeholder]) => {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(normalized)}, placeholder ${placeholder}`, () => {
      expect(normalizeCurationText(input)).toBe(normalized)
      expect(isPlaceholderText(input)).toBe(placeholder)
    })
  })
})
