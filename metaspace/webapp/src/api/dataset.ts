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
      growthConditions
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
    submitDataset(jwt: $jwt, path: $path, metadataJson: $value, priority: 1)
  }`;

export const deleteDatasetQuery =
  gql`mutation ($jwt: String!, $id: String!) {
    deleteDataset(jwt: $jwt, datasetId: $id)
  }`;

export const addOpticalImageQuery =
  gql`mutation ($jwt: String!, $imageUrl: String!,
                $datasetId: String!, $transform: [[Float]]!) {
    addOpticalImage(input: {jwt: $jwt, datasetId: $datasetId,
                            imageUrl: $imageUrl, transform: $transform})
  }`;

export const opticalImageQuery =
  gql`query ($datasetId: String!, $zoom: Float!) {
    opticalImageUrl(datasetId: $datasetId, zoom: $zoom)
  }`;

export const msAcqGeometryQuery =
  gql`query ($datasetId: String!) {
    dataset(id: $datasetId) {
      acquisitionGeometry
    }
  }`;
