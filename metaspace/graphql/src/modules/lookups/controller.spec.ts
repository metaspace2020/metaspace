import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../tests/graphqlTestEnvironment'
import { clearOntologyTermSuggestionCache } from './controller'

const SUBTREE = 'MS:1000031'

const suggestionsQuery = `query ($slot: String!, $query: String!, $limit: Int) {
  ontologyTermSuggestions(slot: $slot, query: $query, limit: $limit) { curie label synonyms }
}`

const suggest = async(query: string, slot = 'instrument_model', limit?: number) =>
  await doQuery<{ curie: string, label: string, synonyms: string[] }[]>(suggestionsQuery, { slot, query, limit })

const insertTerms = async(rows: [string, string, string[], boolean?][]) => {
  for (const [curie, label, synonyms, obsolete = false] of rows) {
    await testEntityManager.query(
      'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology, obsolete) VALUES ($1, $2, $3, $4, $5, $6)',
      [curie, SUBTREE, label, synonyms, 'ms', obsolete]
    )
  }
}

describe('Query.ontologyTermSuggestions', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    clearOntologyTermSuggestionCache() // each test inserts its own rows under the same queries
    await onBeforeEach()
  })
  afterEach(onAfterEach)

  it('matches labels and synonyms within the slot subtree, best label match first, skipping obsolete terms', async() => {
    await insertTerms([
      ['MS:1001911', 'Q Exactive', []],
      ['MS:1002523', 'Q Exactive HF', []],
      ['MS:1000449', 'LTQ Orbitrap', ['Orbitrap XL exactive sibling']],
      ['MS:1000000', 'Exactive Classic', [], true],
    ])

    const results = await suggest('q exactive')

    expect(results.map(r => r.curie)).toEqual(['MS:1001911', 'MS:1002523'])
    expect((await suggest('exactive sibling')).map(r => r.curie)).toEqual(['MS:1000449'])
  })

  it('treats ILIKE wildcards in the query literally', async() => {
    // The decoys would match if '_' / '%' acted as wildcards, and are too dissimilar for the typo fallback.
    await insertTerms([
      ['MS:1', 'alpha_beta gamma', []],
      ['MS:2', 'alphaXbeta gamma delta epsilon zeta', []],
      ['MS:3', 'alpha beta gamma delta epsilon omega', []],
    ])

    expect((await suggest('alpha_beta')).map(r => r.label)).toEqual(['alpha_beta gamma'])
    expect(await suggest('alp%ega')).toEqual([])
  })

  it('falls back to trigram similarity for typos when nothing contains the text', async() => {
    // The similarity stage runs on its own pooled connection (so its timeouts are not logged as
    // query failures), which cannot see this test's uncommitted rows: commit them and clean up.
    const committed = testEntityManager.connection
    await committed.query(
      'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology) VALUES ($1, $2, $3, $4, $5), ($6, $2, $7, $4, $5)',
      ['MS:1000484', SUBTREE, 'orbitrap', [], 'ms', 'MS:1001911', 'Q Exactive']
    )
    try {
      expect((await suggest('orbitrpa')).map(r => r.label)).toEqual(['orbitrap'])
      expect(await suggest('zzqqxx')).toEqual([])
    } finally {
      await committed.query('DELETE FROM public.ontology_term WHERE curie IN ($1, $2)', ['MS:1000484', 'MS:1001911'])
    }
  })

  it('returns nothing for short queries and unknown slots', async() => {
    await insertTerms([['MS:1001911', 'Q Exactive', []]])

    expect(await suggest('')).toEqual([])
    expect(await suggest(' qe ')).toEqual([])
    expect(await suggest('q exactive', 'genetic_background')).toEqual([])
    expect(await suggest('q exactive', 'no_such_slot')).toEqual([])
  })

  it('serves repeated queries from the cache until it is cleared', async() => {
    await insertTerms([['MS:1001911', 'Q Exactive', []]])
    expect(await suggest('exactive')).toHaveLength(1)
    await insertTerms([['MS:1002523', 'Q Exactive HF', []]])
    expect(await suggest('exactive')).toHaveLength(1) // cached
    clearOntologyTermSuggestionCache()
    expect(await suggest('exactive')).toHaveLength(2)
  })

  it('clamps the limit', async() => {
    await insertTerms(Array.from({ length: 60 }, (_, i) => [`MS:${9000000 + i}`, `model ${i}`, []] as [string, string, string[]]))

    expect(await suggest('model', 'instrument_model', 100000)).toHaveLength(50)
    expect(await suggest('model', 'instrument_model', 3)).toHaveLength(3)
    expect(await suggest('model')).toHaveLength(10)
  })
})
