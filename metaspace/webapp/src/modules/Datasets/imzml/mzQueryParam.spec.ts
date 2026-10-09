import { parseMzQueryParam } from './mzQueryParam'

describe('parseMzQueryParam', () => {
  it('parses a numeric string', () => {
    expect(parseMzQueryParam('136.0618')).toBe(136.0618)
  })

  it('takes the first value when the parameter is repeated', () => {
    expect(parseMzQueryParam(['136.0618', '200'])).toBe(136.0618)
  })

  it.each([undefined, null, '', 'abc', '0', '-5', 'Infinity', 'NaN'])('returns null for %p', (value) => {
    expect(parseMzQueryParam(value as any)).toBeNull()
  })
})
