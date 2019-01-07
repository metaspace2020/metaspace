import gql from 'graphql-tag';

export const annotationListQuery =
gql`query GetAnnotations($orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
                           $offset: Int, $limit: Int, $query: String,
                           $filter: AnnotationFilter, $dFilter: DatasetFilter) {
    allAnnotations(filter: $filter, datasetFilter: $dFilter, simpleQuery: $query,
      orderBy: $orderBy, sortingOrder: $sortingOrder,
      offset: $offset, limit: $limit) {
        id
        sumFormula
        adduct
        msmScore
        rhoSpatial
        rhoSpectral
        rhoChaos
        fdrLevel
        mz
        dataset {
          id
          submitter { id name email }
          principalInvestigator { name email }
          group { id name shortName }
          groupApproved
          projects { id name }
          name
          polarity
          metadataJson
          isPublic
        }
        isotopeImages {
          mz
          url
          minIntensity
          maxIntensity
          totalIntensity
        }
        possibleCompounds {
          name
          imageURL
          information {
            database
            url
          }
        }
      }

    countAnnotations(filter: $filter, datasetFilter: $dFilter, simpleQuery: $query)
  }`;

export const tableExportQuery =
gql`query Export($orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
                   $offset: Int, $limit: Int, $query: String,
                   $filter: AnnotationFilter, $dFilter: DatasetFilter) {
    annotations: allAnnotations(filter: $filter, datasetFilter: $dFilter,
                                simpleQuery: $query,
                                orderBy: $orderBy, sortingOrder: $sortingOrder,
                                offset: $offset, limit: $limit) {
      id
      sumFormula
      adduct
      msmScore
      rhoSpatial
      rhoSpectral
      rhoChaos
      fdrLevel
      mz
      dataset {
        id
        name
        group { id name }
        groupApproved
      }
      possibleCompounds {
        name
        information {
          databaseId
        }
      }
    }
  }`;

export const annotationQuery =
gql`query GetAnnotation($id: String!) {
    annotation(id: $id) {
      id
      peakChartData
      isotopeImages {
        mz
        totalIntensity
      }
    }
  }`;

export const allAdductsQuery =
gql`query GetAdductData($datasetId: String!, $molFormula: String!, $db: String!) {
    allAnnotations(datasetFilter: {
      ids: $datasetId
    }, filter: {
      sumFormula: $molFormula, database: $db
    }) {
      id
      mz
      adduct
      msmScore
      rhoSpatial
      rhoSpectral
      rhoChaos
      fdrLevel
      isotopeImages {
        url
        maxIntensity
      }
    }
  }`;
