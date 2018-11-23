import gql from 'graphql-tag';
import { datasetSubmitterFragment } from './user';

export const editDatasetFragment =
  gql`fragment EditDatasetFragment on Dataset {
    id
    metadataJson
    isPublic
    group {
      id
      name
    }
    projects {
      id
      name
    }
    principalInvestigator {
      name
      email
    }
    molDBs
    adducts
    name
  }`;

export const editDatasetQuery =
  gql`query editDatasetQuery($id: String!) {
    dataset(id: $id) {
      ...EditDatasetFragment
      submitter {
        id
      }
    }
    currentUser {
      ...DatasetSubmitterFragment
    }
  }
  ${editDatasetFragment}
  ${datasetSubmitterFragment}
  `;

export const editDatasetSubmitterQuery =
  gql`query editDatasetQuery($userId: ID!) {
    user(userId: $userId) {
      ...DatasetSubmitterFragment
    }
  }
  ${datasetSubmitterFragment}
  `;

export const newDatasetQuery =
  gql`query newDatasetQuery {
    currentUserLastSubmittedDataset {
      ...EditDatasetFragment
    }
    currentUser {
      ...DatasetSubmitterFragment
      primaryGroup {
        group {
          id
          name
        }
      }
    }
  }
  ${editDatasetFragment}
  ${datasetSubmitterFragment}
  `;

export const datasetSubmitterQuery =
  gql`query datasetSubmitterQuery($userId: ID!) {
    user(userId: $userId) {
      ...DatasetSubmitterFragment
    }
  }
  ${datasetSubmitterFragment}
  `;

export const fetchAutocompleteSuggestionsQuery =
  gql`query suggestions($field: String!, $query: String!) {
    metadataSuggestions(field: $field, query: $query, limit: 5)
  }`;

export const updateDatasetQuery =
  gql`mutation ($id: String!, $reprocess: Boolean, $skipValidation: Boolean, $input: DatasetUpdateInput!) {
    updateDataset(id: $id, input: $input, reprocess: $reprocess, skipValidation: $skipValidation, priority: 1)
  }`;

// TODO: use autocompletion for filter values, same as on the upload page
export const fetchOptionListsQuery = gql`query fetchOptionListsQuery {
  organisms: metadataSuggestions(field: "Sample_Information.Organism", query: "", limit: 1000)
  organismParts: metadataSuggestions(field: "Sample_Information.Organism_Part", query: "", limit: 1000)
  conditions: metadataSuggestions(field: "Sample_Information.Condition", query: "", limit: 1000)
  growthConditions: metadataSuggestions(field: "Sample_Information.Sample_Growth_Conditions", query: "", limit: 1000)
  ionisationSources: metadataSuggestions(field: "MS_Analysis.Ionisation_Source", query: "", limit: 1000)
  maldiMatrices: metadataSuggestions(field: "Sample_Preparation.MALDI_Matrix", query: "", limit: 1000)
  analyzerTypes: metadataSuggestions(field: "MS_Analysis.Analyzer", query: "", limit: 1000)
  molecularDatabases: molecularDatabases(hideDeprecated: false){name, default}
  adducts: adductSuggestions{adduct, charge}
}`;

export const metadataOptionsQuery = gql`query metadataOptionsQuery {
  molecularDatabases: molecularDatabases{name, default}
  adducts: adductSuggestions{adduct, charge}
}`;

export const metadataExportQuery = gql`
  query MetadataExport($dFilter: DatasetFilter, $offset: Int, $limit: Int,
                       $query: String, $inpFdrLvls: [Int!]!, $checkLvl: Int!) {
    datasets: allDatasets(filter: $dFilter, simpleQuery: $query,
                          offset: $offset, limit: $limit) {
      id
      name
      submitter {
        id
        name
      }
      principalInvestigator {
        name
      }
      group {
        id
        name
        shortName
      }
      groupApproved
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
      fdrCounts(inpFdrLvls: $inpFdrLvls, checkLvl: $checkLvl) {
        dbName
        levels
        counts
      }
      rawOpticalImageUrl
    }
  } `;
