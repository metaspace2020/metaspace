
import gql from 'graphql-tag'
import reportError from '../../lib/reportError'

import { restoreImageViewerState } from './state'
import { restoreIonImageState } from './ionImageState'
import store from '../../store'

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

    store.commit('setSnapshotAnnotationIds', annotations.map((annotation: any) => annotation.id))

    // set annotation id filter as default if multi annotation shared
    if (annotations.length > 1) {
      store.commit('updateFilter', {
        ...store.getters.filter,
        annotationIds: annotations.map((annotation: any) => annotation.id),
      })
    } else {
      store.commit('updateFilter', {
        ...store.getters.filter,
        annotationIds: undefined,
      })
    }

    if (annotations.length > 0) {
      store.commit('setAnnotation', annotations[0])
    } else {
      store.commit('setAnnotation', { status: 'reprocessed_snapshot' })
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
