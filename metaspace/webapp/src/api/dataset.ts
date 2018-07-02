import gql from 'graphql-tag';

export const datasetListQuery =
  gql`query GetDatasets($dFilter: DatasetFilter, $query: String, $inpFdrLvls: [Int!]!, $checkLvl: Int!) {
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
      isPublic
      molDBs
      status
      metadataType
      fdrCounts(inpFdrLvls: $inpFdrLvls, checkLvl: $checkLvl) {
        dbName
        levels
        counts
      }
      opticalImage
    }
  }`;

export const datasetCountQuery =
  gql`query CountDatasets($dFilter: DatasetFilter, $query: String) {
    countDatasets(filter: $dFilter, simpleQuery: $query)
  }`;

export const opticalImageQuery =
    gql`query ($datasetId: String!, $zoom: Float!) {
    opticalImageUrl(datasetId: $datasetId, zoom: $zoom)
  }`;

export const rawOpticalImageQuery =
    gql`query Q($ds_id: String!) {
    rawOpticalImage(datasetId: $ds_id) {
      url
      transform
    }
  }`;

export const thumbnailOptImageQuery =
    gql`query ($datasetId: String!) {
      thumbnailImage(datasetId: $datasetId) 
  }`;

export const createDatasetQuery =
  gql`mutation ($input: DatasetCreateInput!) {
      createDataset(input: $input, priority: 1)
  }`;

export const deleteDatasetQuery =
  gql`mutation ($id: String!) {
    deleteDataset(id: $id)
  }`;

export const addOpticalImageQuery =
  gql`mutation ($imageUrl: String!,
                $datasetId: String!, $transform: [[Float]]!) {
    addOpticalImage(input: {datasetId: $datasetId,
                            imageUrl: $imageUrl, transform: $transform})
  }`;

export const deleteOpticalImageQuery =
  gql`mutation ($id: String!) {
    deleteOpticalImage(datasetId: $id)
  }`;

export const msAcqGeometryQuery =
  gql`query ($datasetId: String!) {
    dataset(id: $datasetId) {
      acquisitionGeometry
    }
  }`;
