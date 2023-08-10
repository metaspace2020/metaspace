import gql from 'graphql-tag'

import { MolecularDB } from './moldb'

// Prefixing these with `Gql` because differently-cased variants are used elsewhere
export type GqlPolarity = 'POSITIVE' | 'NEGATIVE';
export type GqlJobStatus = 'QUEUED' | 'ANNOTATING' | 'FINISHED' | 'FAILED';

export interface FdrSingleCount {
  level: number
  n: number
}

export interface DatasetAnnotationCount {
  databaseId: number;
  dbName: string;
  dbVersion: string;
  counts: FdrSingleCount[];
}

export interface DatasetDetailItem {
  acquisitionGeometry: string | null;
  id: string;
  name: string;
  description: string | null;
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
  projects: {
    id: string;
    name: string;
    publicationStatus: String;
  }[],
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
  configJson: string;
  isPublic: boolean;
  molDBs: string[];
  databases: MolecularDB[];
  status: GqlJobStatus | null;
  metadataType: string;
  annotationCounts: DatasetAnnotationCount[];
  fdrCounts: {
    databaseId: number;
    dbName: string;
    dbVersion: string;
    levels: number[];
    counts: number[];
  };
  rawOpticalImageUrl: string;
  canEdit: boolean;
  canDelete: boolean;
  canDownload: boolean;
  uploadDT: string;
  diagnostics: any;
}

export const datasetDetailItemFragment =
  gql`fragment DatasetDetailItem on Dataset {
    id
    name
    description
    submitter {
      id
      name
      email
    }
    principalInvestigator { name email }
    group { id name shortName }
    groupApproved
    projects { id name publicationStatus }
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
    acquisitionGeometry
    sizeHash
    configJson
    isPublic
    databases {
      id
      name
      version
    }
    status
    statusUpdateDT
    metadataType
    fdrCounts(inpFdrLvls: $inpFdrLvls, checkLvl: $checkLvl) {
      databaseId
      dbName
      dbVersion
      levels
      counts
    }
    annotationCounts(inpFdrLvls: $inpFdrLvls) {
      databaseId
      dbName
      dbVersion
      counts {
        level
        n
      }
    }
    thumbnailOpticalImageUrl
    ionThumbnailUrl
    canEdit
    canDelete
    canDownload
    uploadDT
  }`

export const datasetDetailItemsQuery =
  gql`query GetDatasets(
    $dFilter: DatasetFilter, $query: String, $inpFdrLvls: [Int!]!, $checkLvl: Int!, $offset: Int = 0, $limit: Int = 100,
    $orderBy: DatasetOrderBy = ORDER_BY_DATE, $sortingOrder: SortingOrder = DESCENDING,
  ) {
    allDatasets(orderBy: $orderBy, sortingOrder: $sortingOrder, offset: $offset, limit: $limit, filter: $dFilter,
    simpleQuery: $query) {
      ...DatasetDetailItem
    }
  }
  ${datasetDetailItemFragment}
  `

export const countDatasetsByStatusQuery =
  gql`query CountDatasets($dFilter: DatasetFilter, $query: String) {
    countDatasetsPerGroup(query: {filter: $dFilter, simpleQuery: $query, fields: [DF_STATUS]}) {
      counts {
        fieldValues
        count
      }
    }
  }`

export const countDatasetsQuery =
  gql`query CountDatasets($dFilter: DatasetFilter, $query: String) {
    countDatasets(filter: $dFilter, simpleQuery: $query)
  }`

export interface DatasetListItem {
  id: string;
  name: string;
  uploadDT: string;
}

export interface DatasetListItemWithDiagnostics {
  id: string;
  name: string;
  uploadDT: string;
  diagnostics: any;
}

export const datasetListItemsQuery =
  gql`query GetDatasets($dFilter: DatasetFilter, $query: String, $limit: Int = 10000, $offset: Int = 0) {
    allDatasets(offset: $offset, limit: $limit, filter: $dFilter, simpleQuery: $query) {
      id
      name
      uploadDT
      submitter { name }
    }
  }`

export const getRoisQuery =
gql`query ($datasetId: String!) {
  dataset(id: $datasetId) {
    id
    roiJson
  }
}`

export const datasetListItemsWithDiagnosticsQuery =
  gql`query GetDatasets($dFilter: DatasetFilter, $query: String, $limit: Int = 10000) {
    allDatasets(offset: 0, limit: $limit, filter: $dFilter, simpleQuery: $query) {
      id
      name
      uploadDT
      databases {
        id
        name
        version
        archived
        group {
          id
          shortName
        }
      }
      diagnostics {
        id
        type
        updatedDT
        data
        images {
          key
          index
          url
          format
        }
      }
    }
  }`

export type OpticalImageType = 'SCALED' | 'CLIPPED_TO_ION_IMAGE';

export interface OpticalImage {
  url: string;
  type: OpticalImageType;
  zoom: number;
  transform: number[][];
}
export const opticalImagesQuery =
  gql`query ($datasetId: String!, $type: OpticalImageType) {
    dataset(id: $datasetId) {
      id
      opticalImages(type: $type) {
        id
        url
        type
        zoom
        transform
      }
    }
  }`

export const rawOpticalImageQuery =
    gql`query Q($ds_id: String!) {
    rawOpticalImage(datasetId: $ds_id) {
      url
      uuid
      transform
    }
  }`

export const createDatasetQuery =
  gql`mutation ($input: DatasetCreateInput!, $useLithops: Boolean, $performEnrichment: Boolean) {
      createDataset(input: $input, priority: 1, useLithops: $useLithops, performEnrichment: $performEnrichment)
  }`

export const deleteDatasetQuery =
  gql`mutation ($id: String!, $force: Boolean) {
    deleteDataset(id: $id, force: $force)
  }`

export const reprocessDatasetQuery =
  gql`mutation ($id: String!, $useLithops: Boolean, $performEnrichment: Boolean) {
    reprocessDataset(id: $id, useLithops: $useLithops, performEnrichment: $performEnrichment)
  }`

export const addOpticalImageQuery =
  gql`mutation ($imageUrl: String!,
                $datasetId: String!, $transform: [[Float]]!) {
    addOpticalImage(input: {datasetId: $datasetId,
                            imageUrl: $imageUrl, transform: $transform})
  }`

export const addRoiMutation =
  gql`mutation ($datasetId: String!, $geoJson: GeoJson!) {
    addRoi(datasetId: $datasetId, geoJson: $geoJson)
  }`

export const deleteOpticalImageQuery =
  gql`mutation ($id: String!) {
    deleteOpticalImage(datasetId: $id)
  }`

export const msAcqGeometryQuery =
  gql`query ($datasetId: String!) {
    dataset(id: $datasetId) {
      id
      acquisitionGeometry
    }
  }`

export const datasetVisibilityQuery =
  gql`query DatasetVisibility($id: String!) {
     datasetVisibility: dataset(id: $id) {
       id
       submitter { id name }
       group { id name }
       projects { id name }
     }
     currentUser { id }
   }`
export interface DatasetVisibilityQuery {
  datasetVisibility: DatasetVisibilityResult | null
  currentUser: { id: string } | null
}
export interface DatasetVisibilityResult {
  id: string;
  submitter: { id: string, name: string };
  group: { id: string, name: string } | null;
  projects: { id: string, name: string }[] | null;
}

export const datasetStatusUpdatedQuery = gql`subscription datasetStatusUpdated(
  $inpFdrLvls: [Int!] = [10],
  $checkLvl: Int = 10
) {
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
    isNew
  }
}
${datasetDetailItemFragment}`

export const datasetDeletedQuery = gql`subscription datasetDeleted {
  datasetDeleted {
    id
  }
}`

export const getDatasetDownloadLink = gql`query getDatasetDownloadLink ($datasetId: String!) {
  dataset(id: $datasetId) { downloadLinkJson }
}`
export interface GetDatasetDownloadLink {
  dataset: {
    downloadLinkJson: string | null
  }
}
export interface DownloadLinkJson {
  contributors: {name: string, institution?: string}[],
  license: {code: string, name: string, link: string},
  files: {filename: string, link: string}[],
}

export interface GetDatasetByIdQuery {
  dataset: DatasetDetailItem
}

export const getDatasetByIdQuery =
  gql`query getDatasetByIdQuery($id: String!, $inpFdrLvls: [Int!] = [5, 10, 20, 50],
  $checkLvl: Int = 10) {
    dataset(id: $id) {
      ...DatasetDetailItem
    }
  }
  ${datasetDetailItemFragment}
`

export const getDatasetDiagnosticsQuery =
gql`query getDatasetDiagnosticsQuery($id: String!) {
  dataset(id: $id) {
      id
      diagnostics {
        id
        type
        updatedDT
        data
        images {
          key
          index
          url
          format
        }
      }
    }
}`

export const getDatasetByIdWithPathQuery =
  gql`query getDatasetByIdQuery($id: String!, $inpFdrLvls: [Int!] = [5, 10, 20, 50],
  $checkLvl: Int = 10) {
    dataset(id: $id) {
      ...DatasetDetailItem
      inputPath
      diagnostics {
        id
        type
        updatedDT
        data
        images {
          key
          index
          url
          format
        }
      }
    }
  }
  ${datasetDetailItemFragment}
`

export interface GetDatabaseStatusQuery {
  dataset: {
    id: string
    status: GqlJobStatus | null
  }
}

export const getDatasetStatusQuery =
  gql`query getDatasetStatusQuery($id: String!) {
    dataset(id: $id) { id status }
  }`

export const getDatasetEnrichmentQuery =
  gql`query getDatasetEnrichmentQuery($id: String!, $dbId: Int = 3, $fdr: Float = 0.5, $offSample: Boolean,
    $pValue: Float) {
    lipidEnrichment(datasetId: $id, molDbId: $dbId, fdr: $fdr, offSample: $offSample, pValue: $pValue) {
      id
      termId
      name
      n
      observed
      expected
      median
      std
      pValue
      qValue
            annotations {
        id
        sumFormula
        adduct
        ion
        ionFormula
        database
        msmScore
        rhoSpatial
        rhoSpectral
        rhoChaos
        fdrLevel
        mz
        offSample
        offSampleProb
        databaseDetails {
          id
        }
        isotopeImages {
          mz
          url
          minIntensity
          maxIntensity
          totalIntensity
        }
        isomers {
          ion
        }
        isobars {
          ion
          ionFormula
          peakNs
          shouldWarn
        }
        possibleCompounds {
          name
          imageURL
          information {
            database
            url
            databaseId
          }
        }
      }
    }
  }`

export const checkIfHasBrowserFiles =
gql`query checkIfHasBrowserFilesQuery($datasetId: String!) {
  hasImzmlFiles(datasetId: $datasetId)
}`

export const getBrowserImage =
gql`query gerBrowserImageQuery($datasetId: String!, $mzLow: Float!, $mzHigh: Float!) {
  browserImage(datasetId: $datasetId, mzLow: $mzLow, mzHigh: $mzHigh){
    image
    maxIntensity
  }
}`

export const getSpectrum =
gql`query getSpectrumQuery($datasetId: String!, $x: Int!, $y: Int!) {
  pixelSpectrum(datasetId: $datasetId, x: $x, y: $y){
    x
    y
    mzs
    ints
  }
}`
