import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CURATED_VALUES, curatedValueResolver, MAX_VALUE_SUGGESTIONS, mergeValueSuggestions } from './curatedValues'
import { createValueResolver } from './termResolver'
import { fetchApprovedCurationValuesQuery, fetchAutocompleteSuggestionsQuery } from '../../../api/metadata'

describe('mergeValueSuggestions', () => {
  it('filters by substring, curated first, deduped case-insensitively keeping the curated spelling', () => {
    const out = mergeValueSuggestions(
      ['Fresh frozen', 'Snap frozen', 'Dried'],
      ['fresh FROZEN', 'Frozen at -80'],
      'FROZ'
    )
    expect(out).toEqual([{ label: 'Fresh frozen' }, { label: 'Snap frozen' }, { label: 'Frozen at -80' }])
  })

  it('drops community placeholders; keepNone keeps only "none"', () => {
    const community = ['None', 'N/A', 'none', 'n/a', '', 'Washed twice']
    expect(mergeValueSuggestions([], community, '')).toEqual([{ label: 'Washed twice' }])
    expect(mergeValueSuggestions([], community, '', { keepNone: true })).toEqual([
      { label: 'None' },
      { label: 'Washed twice' },
    ])
  })

  it('caps the list at 8 by default', () => {
    const many = Array.from({ length: 20 }, (_, i) => `value ${i}`)
    expect(mergeValueSuggestions(many, [], 'value')).toHaveLength(MAX_VALUE_SUGGESTIONS)
    expect(MAX_VALUE_SUGGESTIONS).toBe(8)
  })

  it('has the curated seed lists for the four community fields', () => {
    expect(CURATED_VALUES.sample_stabilisation).toContain('Formalin-fixed paraffin-embedded (FFPE)')
    expect(CURATED_VALUES.tissue_modification![0]).toBe('None')
    expect(CURATED_VALUES.maldi_matrix_application).toContain('Sprayer robot (TM-Sprayer / HTX)')
    expect(CURATED_VALUES.genetic_background).toContain('C57BL/6J')
  })

  it('curatedValueResolver returns curated values only', async () => {
    expect(await curatedValueResolver('tissue_modification', 'wa')).toEqual([{ label: 'Washed' }])
    expect(await curatedValueResolver('organism', 'mus')).toEqual([])
  })
})

describe('createValueResolver', () => {
  it('queries metadataSuggestions on the legacy path with limit 8 and merges after the curated values', async () => {
    const query = vi.fn(async () => ({ data: { metadataSuggestions: ['TM sprayer', 'spraying', 'N/A'] } }))
    const resolve = createValueResolver({ query })
    expect(await resolve('maldi_matrix_application', 'spr')).toEqual([
      { label: 'Spraying' },
      { label: 'Sprayer robot (TM-Sprayer / HTX)' },
      { label: 'Electrospray deposition' },
      { label: 'TM sprayer' },
    ])
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { field: 'Sample_Preparation.MALDI_Matrix_Application', query: 'spr', limit: 8 },
      })
    )
  })

  it('drops "None" from community stabilisation values; keeps it for tissue modification', async () => {
    const query = vi.fn(async () => ({ data: { metadataSuggestions: ['None', 'Fresh frozen'] } }))
    const resolve = createValueResolver({ query })
    expect(await resolve('sample_stabilisation', 'n')).toEqual([
      { label: 'Fresh frozen' },
      { label: 'Flash frozen (liquid nitrogen)' },
      { label: 'Snap frozen' },
      { label: 'Formalin-fixed paraffin-embedded (FFPE)' },
    ])
    expect((await resolve('tissue_modification', 'none')).map((v) => v.label)).toEqual(['None'])
  })

  it('falls back to the curated list when the lookup fails, and skips it for an empty query', async () => {
    const query = vi.fn(async () => Promise.reject(new Error('down')))
    const resolve = createValueResolver({ query })
    expect(await resolve('tissue_modification', 'wash')).toEqual([{ label: 'Washed' }])
    query.mockClear()
    expect(await resolve('tissue_modification', '')).toHaveLength(8)
    expect(query).not.toHaveBeenCalled()
  })

  it('never queries for fields outside the curated slots without a community source', async () => {
    const query = vi.fn()
    expect(await createValueResolver({ query })('instrument_model', 'orb')).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  describe('approved curation values', () => {
    const answer = (approved: string[] | Error, community: string[]) =>
      vi.fn(async (opts: any) => {
        if (opts.query === fetchApprovedCurationValuesQuery) {
          if (approved instanceof Error) throw approved
          return { data: { approvedCurationValues: approved } }
        }
        expect(opts.query).toBe(fetchAutocompleteSuggestionsQuery)
        return { data: { metadataSuggestions: community } }
      })

    it('merges approved values after curated and before community', async () => {
      const query = answer(['Fresh frozen', 'Flash frozen'], ['frozen at -80'])
      const out = await createValueResolver({ query })('sample_stabilisation', 'froz')
      expect(out.map((v) => v.label)).toEqual([
        'Fresh frozen',
        'Flash frozen (liquid nitrogen)',
        'Snap frozen',
        'Flash frozen',
        'frozen at -80',
      ])
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          query: fetchApprovedCurationValuesQuery,
          variables: { slot: 'sample_stabilisation', query: 'froz' },
        })
      )
    })

    it('bound slot gets approved values only', async () => {
      const query = answer(['Melanoma (community)'], ['should not be used'])
      expect(await createValueResolver({ query })('disease', 'mel')).toEqual([{ label: 'Melanoma (community)' }])
      expect(query.mock.calls.some(([o]) => o.query === fetchAutocompleteSuggestionsQuery)).toBe(false)
    })

    it('a failed approved query is ignored', async () => {
      const query = answer(new Error('down'), ['frozen at -80'])
      const out = await createValueResolver({ query })('sample_stabilisation', 'froz')
      expect(out.map((v) => v.label)).toEqual([
        'Fresh frozen',
        'Flash frozen (liquid nitrogen)',
        'Snap frozen',
        'frozen at -80',
      ])
    })

    it('skips the approved query for an empty query', async () => {
      const query = answer(['x'], [])
      await createValueResolver({ query })('disease', '  ')
      expect(query).not.toHaveBeenCalled()
    })
  })
})

describe('CURATED_VALUES', () => {
  it("the generated seed lists equal graphql's source", () => {
    // curated_values.json lives in the graphql project; the webapp bundles a generated copy of it.
    const sourcePath = resolve(__dirname, '../../../../../graphql/metadataSchemas/curated_values.json')
    expect(JSON.parse(readFileSync(sourcePath, 'utf8'))).toEqual(CURATED_VALUES)
  })
})
