
import gql from 'graphql-tag'
import reportError from '../../lib/reportError'

import { restoreImageViewerState } from './state'
import { restoreIonImageState } from './ionImageState'
import store from '../../store'
import safeJsonParse from '../../lib/safeJsonParse'

export default async($apollo: any, id: string, datasetId: string) => {
  try {
    const result: any = await $apollo.query({
      query: gql`query fetchImageViewerSnapshot($id: String!, $datasetId: String!) {
        imageViewerSnapshot(id: $id, datasetId: $datasetId) {
          version
          snapshot
          annotations {
            id
            ion
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
              minIntensity,
              maxIntensity,
              url
            }
            possibleCompounds {
              name
            }
          }
        }
      }`,
      variables: {
        id,
        datasetId,
      },
    })

    const { version, snapshot, annotations } = result.data.imageViewerSnapshot
    const parsed = JSON.parse(snapshot)
    let filter = store.getters.filter

    store.commit('setSnapshotAnnotationIds', annotations.map((annotation: any) => annotation.id))

    // set snapshot filters
    if (parsed.filter) {
      delete parsed.filter.datasetIds
      filter = { ...filter, ...parsed.filter }
      store.commit('updateFilter', {
        ...filter,
      })
    }

    if (annotations.length > 0) {
      store.commit('setAnnotation', annotations[0])
    } else {
      store.commit('setAnnotation', {
        status: 'reprocessed_snapshot',
        annotationIons: parsed.annotationIons,
      })
    }

    restoreImageViewerState({
      version,
      snapshot: parsed.imageViewer,
    })

    restoreIonImageState({
      version,
      snapshot: parsed.ionImage,
      annotations,
    })
  } catch (e) {
    reportError(e)
  }
}
