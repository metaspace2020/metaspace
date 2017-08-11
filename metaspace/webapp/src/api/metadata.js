import gql from 'graphql-tag';

export const fetchMetadataQuery =
  gql`query fetchMetadataQuery($id: String!) {
    dataset(id: $id) {
      metadataJson
    }
  }`;

export const fetchAutocompleteSuggestionsQuery =
  gql`query suggestions($field: String!, $query: String!) {
    metadataSuggestions(field: $field, query: $query, limit: 5)
  }`;

export const updateMetadataQuery =
  gql`mutation ($jwt: String!, $dsId: String!, $value: String!) {
    updateMetadata(jwt: $jwt, datasetId: $dsId, metadataJson: $value, priority: 1)
  }`;

export const fetchOptionListsQuery = gql`{
  institutionNames: metadataSuggestions(field: "Submitted_By.Institution", query: "")
  organisms: metadataSuggestions(field: "Sample_Information.Organism", query: "")
  organismParts: metadataSuggestions(field: "Sample_Information.Organism_Part", query: "")
  conditions: metadataSuggestions(field: "Sample_Information.Condition", query: "")
  growthConditions: metadataSuggestions(field: "Sample_Information.Sample_Growth_Conditions", query: "")
  ionisationSources: metadataSuggestions(field: "MS_Analysis.Ionisation_Source", query: "")
  maldiMatrices: metadataSuggestions(field: "Sample_Preparation.MALDI_Matrix", query: "")
  analyzerTypes: metadataSuggestions(field: "MS_Analysis.Analyzer", query: "")
  molecularDatabases: molecularDatabases{name},
  submitterNames: peopleSuggestions(role: SUBMITTER, query: "") {
    name
    surname
  }
}`;

export const metadataExportQuery = gql`
  query MetadataExport($dFilter: DatasetFilter, $offset: Int, $limit: Int,
                       $query: String) {
    datasets: allDatasets(filter: $dFilter, simpleQuery: $query,
                          offset: $offset, limit: $limit) {
      id
      name
      institution
      submitter {
        name
        surname
      }
      principalInvestigator {
        name
        surname
      }
      organism
      organismPart
      condition
      growthConditions
      ionisationSource
      maldiMatrix
      analyzer {
        type
        resolvingPower(mz: 400)
      }
      polarity
      uploadDateTime
    }
  } `;
