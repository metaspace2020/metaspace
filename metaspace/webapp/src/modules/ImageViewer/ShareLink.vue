<template>
  <el-popover
    v-if="multiImagesEnabled"
    trigger="manual"
    placement="bottom"
    :value="status !== 'CLOSED'"
  >
    <button
      slot="reference"
      class="button-reset h-6 w-6 block"
      @click="handleClick"
      @mouseover="setStatus('OPEN')"
      @mouseout="setStatus('CLOSED')"
      @focus="setStatus('OPEN')"
      @blur="setStatus('CLOSED')"
    >
      <stateful-icon class="h-6 w-6 pointer-events-none">
        <external-window-svg />
      </stateful-icon>
    </button>
    <fade-transition class="m-0 leading-5 text-center">
      <p
        v-if="status === 'OPEN'"
        key="open"
      >
        Link to this annotation
      </p>
      <p
        v-if="status === 'SAVING'"
        key="saving"
      >
        Saving &hellip;
      </p>
      <div
        v-if="status === 'HAS_LINK'"
        key="link"
      >
        <router-link
          target="_blank"
          :to="routeWithViewId"
        >
          Share this link<!-- -->
        </router-link>
        <span class="block text-xs tracking-wide">
          opens in a new window
        </span>
      </div>
    </fade-transition>
  </el-popover>
  <el-popover
    v-else
    trigger="hover"
    placement="bottom"
  >
    <router-link
      slot="reference"
      target="_blank"
      :to="route"
    >
      <stateful-icon class="h-6 w-6">
        <external-window-svg />
      </stateful-icon>
    </router-link>
    Link to this annotation (opens in a new tab)
  </el-popover>
</template>
<script lang="ts">
import { defineComponent, ref, computed } from '@vue/composition-api'
import gql from 'graphql-tag'

import FadeTransition from '../../components/FadeTransition'
import StatefulIcon from '../../components/StatefulIcon.vue'

import ExternalWindowSvg from '../../assets/inline/refactoring-ui/icon-external-window.svg'

import { exportIonImageState } from './ionImageState'
import { exportImageViewerState } from './state'
import reportError from '../../lib/reportError'
import config from '../../lib/config'
import useOutClick from '../../lib/useOutClick'
import store from '../../store'

interface Route {
  query: Record<string, string>
  path: string
}

interface Props {
  annotation: {
    dataset: { id: string }
  }
  route: Route
}

export default defineComponent<Props>({
  components: {
    FadeTransition,
    StatefulIcon,
    ExternalWindowSvg,
  },
  props: {
    annotation: Object,
    route: Object,
  },
  setup(props, { root }) {
    const viewId = ref<string>()
    const status = ref('CLOSED')
    const ds = store.getters.filter.datasetIds || props.route.query.ds

    const routeWithViewId = computed(() => ({
      ...props.route,
      query: {
        ds,
        viewId: viewId.value,
      },
    }))

    const handleClick = async() => {
      if (status.value !== 'OPEN') {
        return
      }

      const imageViewer = exportImageViewerState()
      const ionImage = exportIonImageState()

      status.value = 'SAVING'
      try {
        const annotationIonsQuery = await root.$apollo.query({
          query: gql`query AnnotationNames($ids: String) {
                    options: allAnnotations(filter: {annotationId: $ids}, limit: 100) {
                      ion
                      database
                      databaseDetails {
                        id
                      }
                    }
                  }`,
          variables: {
            ids: ionImage.annotationIds.join('|'),
          },
        })
        const annotationIons = annotationIonsQuery.data.options
        const result = await root.$apollo.mutate({
          mutation: gql`mutation saveImageViewerSnapshotMutation($input: ImageViewerSnapshotInput!) {
            saveImageViewerSnapshot(input: $input)
          }`,
          variables: {
            input: {
              version: 1,
              annotationIds: ionImage.annotationIds,
              ionFormulas: annotationIons.map((annotation: any) => annotation.ion),
              dbIds: annotationIons.map((annotation: any) => annotation.databaseDetails.id.toString()),
              snapshot: JSON.stringify({
                imageViewer,
                annotationIons,
                filter: store.getters.filter,
                ionImage: ionImage.snapshot,
                query: props.route.query,
              }),
              datasetId: props.annotation.dataset.id,
            },
          },
        })
        viewId.value = result.data.saveImageViewerSnapshot
        status.value = 'HAS_LINK'
        useOutClick(() => { status.value = 'CLOSED' })
      } catch (e) {
        reportError(e)
        status.value = 'CLOSED'
      }
    }

    return {
      status,
      handleClick,
      routeWithViewId,
      multiImagesEnabled: config.features.multiple_ion_images,
      setStatus(newStatus: string) {
        switch (newStatus) {
          case 'OPEN': {
            if (status.value === 'CLOSED') {
              status.value = newStatus
            }
            return
          }
          case 'CLOSED': {
            if (status.value === 'OPEN') {
              status.value = newStatus
            }
            return
          }
          default: {
            status.value = newStatus
          }
        }
      },
    }
  },
})
</script>
