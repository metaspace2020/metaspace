import gql from 'graphql-tag'

export const annotationDetailItemFragment =
gql`fragment AnnotationDetailItem on Annotation {
  id
  sumFormula
  adduct
  ion
  centroidMz
  isMono
  ionFormula
  database
  msmScore
  rhoSpatial
  rhoSpectral
  rhoChaos
  fdrLevel
  mz
  colocalizationCoeff(colocalizationCoeffFilter: $colocalizationCoeffFilter)
  offSample
  offSampleProb
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
    configJson
    isPublic
    canEdit
    opticalImages(type: $type) {
      id
      url
      type
      zoom
      transform
    }
  }
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
  countPossibleCompounds(includeIsomers: $countIsomerCompounds)
  possibleCompounds {
    name
    imageURL
    information {
      database
      url
      databaseId
    }
  }
}`

export const annotationListQuery =
gql`query GetAnnotations($orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
                           $offset: Int, $limit: Int, $query: String,
                           $filter: AnnotationFilter, $dFilter: DatasetFilter,
                           $colocalizationCoeffFilter: ColocalizationCoeffFilter,
                           $countIsomerCompounds: Boolean,
  $type: OpticalImageType) {
    allAnnotations(filter: $filter, datasetFilter: $dFilter, simpleQuery: $query,
      orderBy: $orderBy, sortingOrder: $sortingOrder,
      offset: $offset, limit: $limit) {
        ...AnnotationDetailItem
      }

    countAnnotations(filter: $filter, datasetFilter: $dFilter, simpleQuery: $query)
  }
  ${annotationDetailItemFragment}`

export const comparisonAnnotationListQuery =
gql`query GetAggregatedAnnotations($orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
  $query: String,
  $filter: AnnotationFilter, $dFilter: DatasetFilter,
  $colocalizationCoeffFilter: ColocalizationCoeffFilter,
  $countIsomerCompounds: Boolean,
  $type: OpticalImageType) {
  allAggregatedAnnotations(filter: $filter, datasetFilter: $dFilter, simpleQuery: $query,
      orderBy: $orderBy, sortingOrder: $sortingOrder) {
    ion
    dbId
    datasetIds
    annotations {
      ...AnnotationDetailItem

      # Extra fields needed for CSV export
      chemMod
      neutralLoss
      possibleCompounds {
        information {
          databaseId
        }
      }
    }
  }
  }
${annotationDetailItemFragment}`

export const tableExportQuery =
gql`query Export($orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
                   $offset: Int, $limit: Int, $query: String,
                   $filter: AnnotationFilter, $dFilter: DatasetFilter,
                   $colocalizationCoeffFilter: ColocalizationCoeffFilter) {
    annotations: allAnnotations(filter: $filter, datasetFilter: $dFilter,
                                simpleQuery: $query,
                                orderBy: $orderBy, sortingOrder: $sortingOrder,
                                offset: $offset, limit: $limit) {
      id
      sumFormula
      adduct
      chemMod
      neutralLoss
      ion
      mz
      msmScore
      fdrLevel
      rhoSpatial
      rhoSpectral
      rhoChaos
      offSample
      offSampleProb
      isomers {
        ion
      }
      isobars {
        ion
      }
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
      isotopeImages {
        minIntensity
        maxIntensity
        totalIntensity
      }
      colocalizationCoeff(colocalizationCoeffFilter: $colocalizationCoeffFilter)
    }
  }`

export const diagnosticsDataQuery =
gql`query GetAnnotation($id: String!) {
    annotation(id: $id) {
      id
      peakChartData

      dataset { id configJson scoringModel { id name } }

      msmScore
      fdrLevel

      metricsJson

      theoreticalPeakMz
      theoreticalPeakIntensity
      observedPeakMz
      observedPeakMzStddev

      offSample
      offSampleProb
    }
  }`

export const relatedAnnotationsQuery =
gql`query GetRelatedAnnotations($datasetId: String!, $filter: AnnotationFilter!,
                                $orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder,
                                $colocalizationCoeffFilter: ColocalizationCoeffFilter) {
    allAnnotations(datasetFilter: {
      ids: $datasetId
    }, filter: $filter, limit: 12, orderBy: $orderBy, sortingOrder: $sortingOrder) {
      id
      mz
      sumFormula
      adduct
      ion
      msmScore
      rhoSpatial
      rhoSpectral
      rhoChaos
      fdrLevel
      isotopeImages {
        url
        minIntensity
        maxIntensity
      }
      possibleCompounds {
        name
      }
      isomers {
        ion
      }
      isobars {
        shouldWarn
      }
      colocalizationCoeff(colocalizationCoeffFilter: $colocalizationCoeffFilter)
    }
  }`

export const relatedMoleculesQuery =
  gql`query RelatedMoleculesQuery($datasetId: String!, $filter: AnnotationFilter!,
                                $orderBy: AnnotationOrderBy, $sortingOrder: SortingOrder) {
    allAnnotations(datasetFilter: {
      ids: $datasetId
    }, filter: $filter, limit: 12, orderBy: $orderBy, sortingOrder: $sortingOrder) {
      id
      sumFormula
      chemMod
      neutralLoss
      adduct
      ion
      ionFormula
      mz
      msmScore
      fdrLevel
      possibleCompounds {
        name
        imageURL
        information {
          database
          url
        }
      }
    }
  }`

export const isobarsQuery =
  gql`query IsobarsQuery($datasetId: String!, $filter: AnnotationFilter!) {
    allAnnotations(
      datasetFilter: { ids: $datasetId },
      filter: $filter,
      orderBy: ORDER_BY_FDR_MSM,
      sortingOrder: ASCENDING
    ) {
      id
      ion
      ionFormula
      mz
      fdrLevel
      msmScore
      rhoSpatial
      rhoSpectral
      rhoChaos
      offSample
      offSampleProb
      peakChartData
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
  }`
