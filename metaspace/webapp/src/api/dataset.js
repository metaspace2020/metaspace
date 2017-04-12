import gql from 'graphql-tag';

export const datasetListQuery =
  gql`query GetDatasets($dFilter: DatasetFilter) {
    allDatasets(offset: 0, limit: 100, filter: $dFilter) {
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
    }
  }`;

export const submitDatasetQuery =
  gql`mutation ($path: String!, $value: String!) {
    submitDataset(path: $path, metadataJson: $value)
  }`;
