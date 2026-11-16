// ElasticSearch must be mocked before importing any other graphql code. It uses doMock so that it can reference
// MockElasticSearchClient without jest's "jest.mock hoisting" causing problems.
class MockElasticSearchClient {
  static search = jest.fn()
  search = MockElasticSearchClient.search
}
jest.doMock('@elastic/elasticsearch', () => ({ Client: MockElasticSearchClient }))

import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
} from '../../tests/graphqlTestEnvironment'

const q = `query ($field: String!, $query: String!, $limit: Int) {
  metadataV2TermSuggestions(field: $field, query: $query, limit: $limit) { curie label count }
}`

describe('Query.metadataV2TermSuggestions', () => {
  beforeAll(onBeforeAll)
  afterAll(onAfterAll)
  beforeEach(async() => {
    await onBeforeEach()
    MockElasticSearchClient.search.mockReset()
    MockElasticSearchClient.search.mockResolvedValue({ aggregations: { field_counts: { buckets: [] } } })
  })
  afterEach(onAfterEach)

  const requestBody = () => MockElasticSearchClient.search.mock.calls[0][0].body

  it('aggregates CURIE+label from ds_meta_v2 and maps buckets', async() => {
    MockElasticSearchClient.search.mockResolvedValue({
      aggregations: {
        field_counts: {
          buckets: [
            { key: 'MONDO:0005070\u0001glioma', doc_count: 3 },
            { key: 'MONDO:0007254\u0001breast cancer', doc_count: 1 },
          ],
        },
      },
    })
    const result = await doQuery(q, { field: 'sample.disease', query: 'gli' })
    expect(result).toEqual([
      { curie: 'MONDO:0005070', label: 'glioma', count: 3 },
      { curie: 'MONDO:0007254', label: 'breast cancer', count: 1 },
    ])
    const body = requestBody()
    expect(body.size).toBe(0)
    expect(body.query.bool.filter).toEqual(expect.arrayContaining([
      { exists: { field: 'ds_meta_v2.sample.disease.value_ontology_id' } },
      {
        bool: {
          minimum_should_match: 1,
          should: [
            { wildcard: { 'ds_meta_v2.sample.disease.value_ontology_id': { value: '*gli*', case_insensitive: true } } },
            { wildcard: { 'ds_meta_v2.sample.disease.value_label': { value: '*gli*', case_insensitive: true } } },
          ],
        },
      },
    ]))
    expect(body.aggs.field_counts.terms.size).toBe(20)
    expect(body.aggs.field_counts.terms.script.inline).toContain("doc['ds_meta_v2.sample.disease.value_label.raw']")
    expect(body.aggs.field_counts.terms.script.inline).toContain('containsKey(')
    // The CURIE comes from the case-keeping .raw subfield; the normalized field would yield 'mondo:0005070'.
    expect(body.aggs.field_counts.terms.script.inline).toContain("doc['ds_meta_v2.sample.disease.value_ontology_id.raw'].value")
  })

  it('sorts by count and skips buckets without a CURIE', async() => {
    MockElasticSearchClient.search.mockResolvedValue({
      aggregations: {
        field_counts: {
          buckets: [
            { key: 'MONDO:0007254\u0001breast cancer', doc_count: 1 },
            { key: '\u0001orphan', doc_count: 9 },
            { key: 'MONDO:0005070\u0001', doc_count: 4 },
          ],
        },
      },
    })
    const result = await doQuery(q, { field: 'sample.disease', query: '', limit: 5 })
    expect(result).toEqual([
      { curie: 'MONDO:0005070', label: '', count: 4 },
      { curie: 'MONDO:0007254', label: 'breast cancer', count: 1 },
    ])
    expect(requestBody().aggs.field_counts.terms.size).toBe(5)
  })

  it('matches every controlled term when the query is empty', async() => {
    await doQuery(q, { field: 'sample.disease', query: '' })
    const filter = requestBody().query.bool.filter
    expect(filter).toContainEqual({ exists: { field: 'ds_meta_v2.sample.disease.value_ontology_id' } })
    // The visibility filters esFilterValueCountResults prepends carry their own bool.should; none may touch ds_meta_v2.
    const v2Should = filter.filter((clause: any) => clause.bool?.should && JSON.stringify(clause).includes('ds_meta_v2'))
    expect(v2Should).toEqual([])
    expect(JSON.stringify(filter)).not.toContain('wildcard')
  })

  it('accepts a reconciled acquisition field', async() => {
    await doQuery(q, { field: 'acquisition.instrument_model.user_value', query: 'orbi' })
    const body = requestBody()
    const base = 'ds_meta_v2.acquisition.instrument_model.user_value'
    expect(body.query.bool.filter).toEqual(expect.arrayContaining([
      { exists: { field: `${base}.value_ontology_id` } },
      {
        bool: {
          minimum_should_match: 1,
          should: [
            { wildcard: { [`${base}.value_ontology_id`]: { value: '*orbi*', case_insensitive: true } } },
            { wildcard: { [`${base}.value_label`]: { value: '*orbi*', case_insensitive: true } } },
          ],
        },
      },
    ]))
    expect(body.aggs.field_counts.terms.script.inline).toContain(`doc['${base}.value_ontology_id.raw'].value`)
    expect(body.aggs.field_counts.terms.script.inline).toContain(`doc['${base}.value_label.raw']`)
  })

  it('clamps limit', async() => {
    await doQuery(q, { field: 'sample.disease', query: '', limit: -5 })
    await doQuery(q, { field: 'sample.disease', query: '', limit: 5000 })
    expect(MockElasticSearchClient.search.mock.calls[0][0].body.aggs.field_counts.terms.size).toBe(1)
    expect(MockElasticSearchClient.search.mock.calls[1][0].body.aggs.field_counts.terms.size).toBe(200)
  })

  it('rejects a field outside the v2 document', async() => {
    await expect(doQuery(q, { field: "sample.disease'] + doc['ds_name", query: '' })).rejects.toThrow()
    await expect(doQuery(q, { field: 'ds_name', query: '' })).rejects.toThrow()
    expect(MockElasticSearchClient.search).not.toHaveBeenCalled()
  })
})
