import { datasetFilters } from '../../../datasetFilters'

describe('datasetFilters.disease', () => {
  it('filters by CURIE on the v2 ontology id field', () => {
    expect(datasetFilters.disease.esFilter('MONDO:0005070'))
      .toEqual({ term: { 'ds_meta_v2.sample.disease.value_ontology_id': 'MONDO:0005070' } })
  })

  it('builds the matching Postgres predicate', () => {
    const whereRaw = jest.fn()
    datasetFilters.disease.pgFilter({ whereRaw }, 'MONDO:0005070')
    expect(whereRaw).toHaveBeenCalledWith(
      "metadata_v2#>>'{document,sample,disease,value_ontology_id}' = ?",
      ['MONDO:0005070']
    )
  })
})

describe('datasetFilters.organism (merged legacy + v2)', () => {
  it('matches the legacy field or the v2 label', () => {
    expect(datasetFilters.organism.esFilter('Mus musculus')).toEqual({
      bool: {
        should: [
          { term: { 'ds_meta.Sample_Information.Organism': 'Mus musculus' } },
          { term: { 'ds_meta_v2.sample.organism.value_label': 'Mus musculus' } },
        ],
        minimum_should_match: 1,
      },
    })
  })

  it('builds the OR predicate for Postgres', () => {
    const whereRaw = jest.fn()
    datasetFilters.organism.pgFilter({ whereRaw }, 'Mus musculus')
    expect(whereRaw).toHaveBeenCalledWith(
      "(metadata#>>'{Sample_Information,Organism}' = ? OR metadata_v2#>>'{document,sample,organism,value_label}' = ?)",
      ['Mus musculus', 'Mus musculus']
    )
  })

  it('keeps the legacy schemaPath used by the Dataset resolvers', () => {
    expect(datasetFilters.organism.schemaPath).toEqual('Sample_Information.Organism')
    expect(datasetFilters.organismPart.schemaPath).toEqual('Sample_Information.Organism_Part')
  })
})

describe('datasetFilters v2 enum and CURIE filters', () => {
  it('filters sampleType by stored enum value', () => {
    expect(datasetFilters.sampleType.esFilter('cell_culture'))
      .toEqual({ term: { 'ds_meta_v2.sample.sample_type': 'cell_culture' } })
  })
})
