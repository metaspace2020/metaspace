<template>
  <el-popover
    v-if="multiImagesEnabled"
    placement="bottom"
  >
    <template v-slot:reference>
      <button
        class="button-reset h-6 w-6 block"
        @click="handleClick"
      >
        <stateful-icon class="h-6 w-6 pointer-events-none">
          <external-window-svg />
        </stateful-icon>
      </button>
    </template>
    <fade-transition class="m-0 leading-5 text-center">
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
      <p
        v-else
        key="open"
        class="m-0"
      >
        Link to this annotation
      </p>
    </fade-transition>
  </el-popover>
  <el-popover
    v-else
    trigger="hover"
    placement="bottom"
  >
    <template v-slot:reference>
      <router-link
        target="_blank"
        :to="route"
      >
        <stateful-icon class="h-6 w-6">
          <external-window-svg />
        </stateful-icon>
      </router-link>
    </template>
    Link to this annotation (opens in a new tab)
  </el-popover>
</template>
<script lang="ts">

import { defineComponent, ref, computed, defineAsyncComponent } from 'vue';
import { useStore } from 'vuex';
import gql from 'graphql-tag';
import FadeTransition from '../../components/FadeTransition';
import StatefulIcon from '../../components/StatefulIcon.vue';
import { exportIonImageState } from './ionImageState';
import { exportImageViewerState } from './state';
import reportError from '../../lib/reportError';
import config from '../../lib/config';
import useOutClick from '../../lib/useOutClick';
import {inject} from "vue";
import {DefaultApolloClient} from "@vue/apollo-composable";

const ExternalWindowSvg = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-external-window.svg')
);

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
  setup(props) {
    const store = useStore();
    const apolloClient = inject(DefaultApolloClient);
    const viewId = ref<string>()
    const status = ref('OPEN')

    const ds = store.getters.filter.datasetIds || props.route.query.ds

    const routeWithViewId = computed(() => ({
      ...props.route,
      query: {
        ds,
        viewId: viewId.value,
      },
    }))

    const handleClick = async() => {
      const imageViewer = exportImageViewerState()
      const ionImage = exportIonImageState()

      status.value = 'SAVING'
      try {
        const annotationIonsQuery = await apolloClient.query({
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
        const result = await apolloClient.mutate({
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
