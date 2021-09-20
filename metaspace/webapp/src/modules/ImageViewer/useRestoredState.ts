
import gql from 'graphql-tag'
import reportError from '../../lib/reportError'

import { restoreImageViewerState } from './state'
import { restoreIonImageState } from './ionImageState'
import store from '../../store'
import { annotationDetailItemFragment } from '../../api/annotation'

export default async($apollo: any, id: string, datasetId: string) => {
  try {
    const result: any = await $apollo.query({
      query: gql`query fetchImageViewerSnapshot(
        $id: String!,
        $datasetId: String!,
        $colocalizationCoeffFilter: ColocalizationCoeffFilter,
        $countIsomerCompounds: Boolean,
        $type: OpticalImageType
      ) {
        imageViewerSnapshot(id: $id, datasetId: $datasetId) {
          version
          snapshot
          annotations {
            ...AnnotationDetailItem
          }
        }
      }
      ${annotationDetailItemFragment}`,
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

    // set stored query params
    if (parsed.query?.cmap) {
      store.commit('setColormap', parsed.query.cmap)
    }
    if (parsed.query?.scale) {
      store.commit('setScaleType', parsed.query.scale)
    }
    if (parsed.query?.norm) {
      store.commit('setNormalization', parsed.query.norm)
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
