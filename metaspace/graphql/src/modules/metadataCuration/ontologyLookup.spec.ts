import {
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  testEntityManager,
} from '../../tests/graphqlTestEnvironment'
import { clearOntologyTermSuggestionCache } from '../lookups/controller'
import { findExactOntologyTerm, suggestOntologyTermWithScore } from './ontologyLookup'

const SUBTREE = 'MONDO:0000001'

const insertTerms = async(rows: [string, string, string[], boolean?][]) => {
  for (const [curie, label, synonyms, obsolete = false] of rows) {
    await testEntityManager.query(
      'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology, obsolete) VALUES ($1, $2, $3, $4, $5, $6)',
      [curie, SUBTREE, label, synonyms, 'mondo', obsolete]
    )
  }
}

describe('ontologyLookup', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    clearOntologyTermSuggestionCache() // each test inserts its own rows under the same queries
    await onBeforeEach()
  })
  afterEach(onAfterEach)

  describe('findExactOntologyTerm', () => {
    it('exact label wins', async() => {
      await insertTerms([['MONDO:1', 'Melanoma', []], ['MONDO:2', 'Skin cancer', ['melanoma']]])

      expect(await findExactOntologyTerm(testEntityManager, 'disease', 'melanoma'))
        .toEqual({ curie: 'MONDO:1', label: 'Melanoma' })
    })

    it('exact synonym when no label', async() => {
      await insertTerms([['MONDO:1', 'Melanoma', []], ['MONDO:3', 'Cutaneous melanoma', ['Skin melanoma']]])

      expect(await findExactOntologyTerm(testEntityManager, 'disease', 'skin melanoma'))
        .toEqual({ curie: 'MONDO:3', label: 'Cutaneous melanoma' })
    })

    it('exact synonym containing LIKE wildcards resolves', async() => {
      await insertTerms([['MONDO:5', 'Wildcard melanoma', ['100% melanoma_x']]])

      expect(await findExactOntologyTerm(testEntityManager, 'disease', '100% melanoma_x'))
        .toEqual({ curie: 'MONDO:5', label: 'Wildcard melanoma' })
    })

    it('two labels is ambiguous', async() => {
      await insertTerms([['MONDO:1', 'Melanoma', []], ['MONDO:4', 'Melanoma', []]])

      expect(await findExactOntologyTerm(testEntityManager, 'disease', 'melanoma')).toBe('ambiguous')
    })

    it('obsolete rows are ignored', async() => {
      await insertTerms([['MONDO:1', 'Melanoma', ['melanoma'], true]])

      expect(await findExactOntologyTerm(testEntityManager, 'disease', 'melanoma')).toBeNull()
    })

    it('a text under 3 characters matches labels only', async() => {
      await insertTerms([['MONDO:6', 'Skin lesion', ['SL']], ['MONDO:7', 'MS', []]])

      expect(await findExactOntologyTerm(testEntityManager, 'disease', 'sl')).toBeNull()
      expect(await findExactOntologyTerm(testEntityManager, 'disease', 'ms'))
        .toEqual({ curie: 'MONDO:7', label: 'MS' })
    })

    it('unbound slot returns null', async() => {
      expect(await findExactOntologyTerm(testEntityManager, 'sample_stabilisation', 'x')).toBeNull()
    })
  })

  describe('suggestOntologyTermWithScore', () => {
    it('suggestion carries a similarity score', async() => {
      // The typo stage runs on its own pooled connection, which cannot see this test's uncommitted
      // rows: commit them and clean up. The curie and label are unique to this file, so a parallel
      // spec can neither collide with the committed row nor match it.
      const committed = testEntityManager.connection
      await committed.query(
        'INSERT INTO public.ontology_term (curie, subtree, label, synonyms, ontology) VALUES ($1, $2, $3, $4, $5)',
        ['MONDO:9001', SUBTREE, 'Xyzzyplasm', [], 'mondo']
      )
      try {
        const suggestion = await suggestOntologyTermWithScore(testEntityManager, 'disease', 'xyzzyplasn')
        expect(suggestion).toEqual({ curie: 'MONDO:9001', label: 'Xyzzyplasm', score: expect.any(Number) })
        expect(suggestion!.score).toBeGreaterThan(0)
        expect(suggestion!.score).toBeLessThan(1)
        expect(await suggestOntologyTermWithScore(testEntityManager, 'disease', 'me')).toBeNull()
      } finally {
        await committed.query('DELETE FROM public.ontology_term WHERE curie = $1', ['MONDO:9001'])
      }
    })
  })
})
