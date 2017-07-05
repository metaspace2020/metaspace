import gql from 'graphql-tag';

export const datasetListQuery =
  gql`query GetDatasets($dFilter: DatasetFilter, $query: String) {
    allDatasets(offset: 0, limit: 100, filter: $dFilter, simpleQuery: $query) {
      id
      name
      institution
      submitter {
        name
        surname
        email
      }
      polarity
      ionisationSource
      analyzer {
        type
        resolvingPower(mz: 400)
      }
      organism
      organismPart
      condition
      metadataJson
      status
    }
  }`;

export const datasetCountQuery =
  gql`query CountDatasets($dFilter: DatasetFilter, $query: String) {
    countDatasets(filter: $dFilter, simpleQuery: $query)
  }`;

export const submitDatasetQuery =
  gql`mutation ($jwt: String!, $path: String!, $value: String!) {
    submitDataset(jwt: $jwt, path: $path, metadataJson: $value)
  }`;
