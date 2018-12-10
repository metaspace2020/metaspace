import gql from 'graphql-tag';

// Prefixing these with `Gql` because differently-cased variants are used elsewhere
export type GqlPolarity = 'POSITIVE' | 'NEGATIVE';
export type GqlJobStatus = 'QUEUED' | 'ANNOTATING' | 'FINISHED' | 'FAILED';

export interface DatasetDetailItem {
  id: string;
  name: string;
  submitter: {
    id: string | null;
    name: string;
  };
  principalInvestigator: {
    name: string;
    email: string | null;
  } | null;
  group: {
    id: string;
    name: string;
    shortName: string;
  };
  groupApproved: boolean;
  polarity: GqlPolarity;
  ionisationSource: string;
  analyzer: {
    type: string;
    resolvingPower: number;
  };
  organism: string | null;
  organismPart: string | null;
  condition: string | null;
  growthConditions: string | null;
  metadataJson: string;
  isPublic: boolean;
  molDBs: string[];
  status: GqlJobStatus | null;
  metadataType: string;
  fdrCounts: {
    dbName: string;
    levels: number[];
    counts: number[];
  };
  rawOpticalImageUrl: string;
}

export const datasetDetailItemFragment =
  gql`fragment DatasetDetailItem on Dataset {
    id
    name
    submitter {
      id
      name
      email
    }
    principalInvestigator { name email }
    group { id name shortName }
    groupApproved
    projects { id name }
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
    thumbnailOpticalImageUrl
  }`;

export const datasetDetailItemsQuery =
  gql`query GetDatasets($dFilter: DatasetFilter, $query: String, $inpFdrLvls: [Int!]!, $checkLvl: Int!) {
    allDatasets(offset: 0, limit: 100, filter: $dFilter, simpleQuery: $query) {
      ...DatasetDetailItem
    }
  }
  ${datasetDetailItemFragment}
  `;

export const datasetCountQuery =
  gql`query CountDatasets($dFilter: DatasetFilter, $query: String) {
    countDatasets(filter: $dFilter, simpleQuery: $query)
  }`;

export interface DatasetListItem {
  id: string;
  name: string;
  uploadDT: string;
}

export const datasetListItemsQuery =
  gql`query GetDatasets($dFilter: DatasetFilter, $query: String) {
    allDatasets(offset: 0, limit: 100, filter: $dFilter, simpleQuery: $query) {
      id
      name
      uploadDT
    }
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
  gql`mutation ($id: String!, $force: Boolean) {
    deleteDataset(id: $id, force: $force)
  }`;

export const reprocessDatasetQuery =
  gql`mutation ($id: String!) {
    reprocessDataset(id: $id)
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
      id
      acquisitionGeometry
    }
  }`;

export const datasetVisibilityQuery =
  gql`query DatasetVisibility($id: String!) {
     datasetVisibility: dataset(id: $id) {
       id
       submitter { id name }
       group { id name }
       projects { id name }
     }
   }`;

export interface DatasetVisibilityResult {
  id: string;
  submitter: { id: string, name: string };
  group: { id: string, name: string } | null;
  projects: { id: string, name: string }[] | null;
}

export const datasetStatusUpdatedQuery = gql`subscription datasetStatusUpdated($inpFdrLvls: [Int!] = [10], $checkLvl: Int = 10) {
  datasetStatusUpdated {
    dataset {
      ...DatasetDetailItem
    }
    relationship {
      type
      id
      name
    }
    action
    stage
    is_new
  }
}
${datasetDetailItemFragment}`;

export const datasetDeletedQuery = gql`subscription datasetDeleted {
  datasetDeleted {
    id
  }
}`;
