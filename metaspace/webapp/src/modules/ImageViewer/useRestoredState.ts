
import gql from 'graphql-tag'
import reportError from '../../lib/reportError'

import { restoreImageViewerState } from './state'
import { restoreIonImageState } from './ionImageState'
import store from '../../store'
import { annotationDetailItemFragment } from '../../api/annotation'
import router from '../../router'
import { isEqual } from 'lodash-es'
import Vue from 'vue'

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

    if (parsed.query.cols) {
      router.replace({
        query: {
          // @ts-ignore
          ...router.history.current.query,
          cols: parsed.query.cols,
        },
      })
    }

    const annotationIds = annotations.map((annotation: any) => annotation.id).sort()
    store.commit('setSnapshotAnnotationIds', annotationIds)

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
    const searchParams = new URLSearchParams(window.location.search)

    if (parsed.query?.norm) {
      store.commit('setNormalization', parsed.query.norm)
    }

    if ((parsed.query?.feat || parsed.query?.norm) && !searchParams.get('feat')) {
      router.replace({
        query: {
          // @ts-ignore
          ...router.history.current.query,
          feat: !parsed.query.feat ? 'tic' : parsed.query?.feat,
        },
      })
      window.location.reload()
    }

    const restoreState = isEqual(annotationIds,
      (parsed.ionImage?.layers || []).map((layer: any) => layer.id).sort())

    // multiple annotations reprocessed, so saved layers based on id do not match
    if (!restoreState || annotations.length === 0) {
      Vue.nextTick(async() => { // wait for rendering and time before update viewer
        const MILISECONDS = 1000
        await new Promise(resolve => setTimeout(resolve, MILISECONDS))
        store.commit('setAnnotation', {
          status: 'reprocessed_snapshot',
          annotationIons: parsed.annotationIons,
        })
      })
      return
    }

    if (Array.isArray(annotations)) {
      store.commit('setAnnotation', annotations[0])
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
