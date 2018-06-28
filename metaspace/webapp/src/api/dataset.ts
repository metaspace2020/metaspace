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

export const resubmitDatasetQuery =
  gql`mutation ($jwt: String!, $datasetId: String!, $name: String, 
                $metadataJson: String, $isPublic: Boolean, $delFirst: Boolean) {
    resubmitDataset(jwt: $jwt, datasetId: $datasetId, name: $name, 
                  metadataJson: $metadataJson, isPublic: $isPublic, 
                  delFirst: $delFirst, priority: 1)
  }`;

export const submitDatasetQuery =
  gql`mutation ($jwt: String!, $path: String!, $metadataJson: String!, $isPublic: Boolean!) {
    submitDataset(jwt: $jwt, path: $path, metadataJson: $metadataJson, isPublic: $isPublic, priority: 1)
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

export const deleteOpticalImageQuery =
  gql`mutation ($jwt: String!, $id: String!) {
    deleteOpticalImage(jwt: $jwt, datasetId: $id)
  }`;

export const msAcqGeometryQuery =
  gql`query ($datasetId: String!) {
    dataset(id: $datasetId) {
      acquisitionGeometry
    }
  }`;
