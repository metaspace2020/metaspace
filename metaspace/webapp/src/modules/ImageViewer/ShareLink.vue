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
      <external-window-icon class="sm-stateful-icon h-6 w-6 pointer-events-none" />
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
        Saving state ...
      </p>
      <div
        v-if="status === 'HAS_LINK'"
        key="link"
        class="relative pt-2"
      >
        <button
          class="button-reset absolute top-0 right-0 -mt-2 -mr-2"
          title="Close tooltip"
          @click="status = 'CLOSED'"
        >
          <close-icon class="block h-6 w-6 fill-current text-gray-700" />
        </button>
        <router-link
          target="_blank"
          :to="routeWithLinkId"
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
      <external-window-icon class="sm-stateful-icon h-6 w-6" />
    </router-link>
    Link to this annotation (opens in a new tab)
  </el-popover>
</template>
<script lang="ts">
import { defineComponent, ref, watch, computed } from '@vue/composition-api'
import gql from 'graphql-tag'

import FadeTransition from '../../components/FadeTransition'

import '../../components/StatefulIcon.css'
import ExternalWindowIcon from '../../assets/inline/refactoring-ui/external-window.svg'
import CloseIcon from '../../assets/inline/refactoring-ui/close.svg'

import { exportIonImageState } from './ionImageState'
import { exportImageViewerState } from './state'
import reportError from '../../lib/reportError'
import config from '../../lib/config'

interface Route {
  query: Record<string, string>
}

interface Props {
  annotation: {
    dataset: { id: string }
  }
  route: Route
}

export default defineComponent<Props>({
  components: {
    ExternalWindowIcon,
    FadeTransition,
    CloseIcon,
  },
  props: {
    annotation: Object,
    route: Object,
  },
  setup(props, { root }) {
    const linkId = ref<string>()
    const status = ref('CLOSED')

    const routeWithLinkId = computed(() => ({
      ...props.route,
      query: {
        ...props.route.query,
        linkId: linkId.value,
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
        const result = await root.$apollo.mutate({
          mutation: gql`mutation createImageViewerLinkMutation($input: IVLCreateInput!) {
            createImageViewerLink(input: $input)
          }`,
          variables: {
            input: {
              version: 1,
              annotationIds: ionImage.annotationIds,
              snapshot: JSON.stringify({
                imageViewer,
                ionImage: ionImage.snapshot,
              }),
              datasetId: props.annotation.dataset.id,
            },
          },
        })
        linkId.value = result.data.createImageViewerLink
        status.value = 'HAS_LINK'
      } catch (e) {
        reportError(e)
        status.value = 'CLOSED'
      }
    }

    return {
      status,
      handleClick,
      routeWithLinkId,
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
