<template>
  <div
    v-if="!deferRender"
    class="dataset-item border border-solid border-gray-200 leading-5"
  >
    <div
      v-if="isOpticalImageSupported"
      class="opt-image--container"
    >
      <dataset-thumbnail
        :dataset="dataset"
        :editable="canEditOpticalImage"
      />
    </div>

    <DatasetItemMetadata
      :dataset="dataset"
      :metadata="metadata"
      :hide-group-menu="hideGroupMenu"
    />

    <DatasetItemActions
      :dataset="dataset"
      :idx="idx"
      :metadata="metadata"
      :additional-settings="additionalSettings"
      :current-user="currentUser"
    />
  </div>
</template>

<script>
import DatasetThumbnail from './DatasetThumbnail.vue'
import { get } from 'lodash-es'
import { mdTypeSupportsOpticalImages } from '../../../lib/util'
import safeJsonParse from '../../../lib/safeJsonParse'
import { plural } from '../../../lib/vueFilters'
import { defaultMetadataType } from '../../../lib/metadataRegistry'
import DatasetItemMetadata from './DatasetItemMetadata'
import DatasetItemActions from './DatasetItemActions'

export default {
  name: 'DatasetItem',
  components: {
    DatasetThumbnail,
    DatasetItemMetadata,
    DatasetItemActions,
  },
  filters: {
    plural,
  },
  props: ['dataset', 'currentUser', 'idx', 'hideGroupMenu'],
  data() {
    return {
      deferRender: this.idx >= 20,
    }
  },

  computed: {
    isOpticalImageSupported() {
      return mdTypeSupportsOpticalImages(get(this.metadata, 'Data_Type') || defaultMetadataType)
    },

    metadata() {
      const datasetMetadataExternals = {
        Submitter: this.dataset.submitter,
        PI: this.dataset.principalInvestigator,
        Group: this.dataset.group,
        Projects: this.dataset.projects,
      }
      return Object.assign(safeJsonParse(this.dataset.metadataJson), datasetMetadataExternals)
    },

    additionalSettings() {
      try {
        const configJson = JSON.parse(this.dataset.configJson)
        return configJson
      } catch (e) {
        return {}
      }
    },

    canEditOpticalImage() {
      return this.currentUser?.role === 'admin'
        // Only allow editing after annotation has finished, as it requires ion images for alignment
        || (this.dataset.canEdit && this.dataset.status === 'FINISHED')
    },
  },
  async created() {
    // Defer rendering of most elements until after the first render, so that the page becomes interactive sooner
    const delayFrames = Math.floor(this.idx / 10)
    try {
      for (let i = 0; i < delayFrames; i++) {
        await new Promise(resolve => requestAnimationFrame(resolve))
      }
    } catch (err) { /* Browser/test doesn't support requestAnimationFrame? */ }
    this.deferRender = false
  },
}
</script>

<style lang="scss">
  .opt-image--container {
    padding: 10px 0 10px 10px;
    margin: 0px;
    flex: none;
  }

 .dataset-item {
   border-radius: 5px;
   min-height: 120px;
   min-width: 600px;
   max-width: 950px;
   margin: 3px;
   padding: 0px;
   display: flex;
   flex-direction: row;
   justify-content: space-between;
   transition: 0.2s cubic-bezier(.4, 0, .2, 1);
   transition-property: box-shadow;
 }

 .dataset-item:hover {
   box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
 }

 .ds-info {
   padding: 10px;
   margin: 0px;
   flex-grow: 1;
   min-width: 0%; /* This may seem pointless, but it's necessary to prevent text overflowing: https://css-tricks.com/flexbox-truncated-text/ */
 }

 .ds-actions {
   padding: 10px 20px 10px 0px;
   margin: 0px;
   flex: none;
   display: flex;
   flex-direction: column;
 }

 .ds-actions i {
   margin-right: 5px;
 }

 .ds-add-filter {
   cursor: pointer;
   font-weight: 500;
 }

 .striped-progressbar {
   height: 14px;
   border-radius: 2px;
   margin: 3px 0;
   width: 100%;
   background-size: 30px 30px;
   background-image: linear-gradient(135deg,
     rgba(255, 255, 255, .30) 25%, transparent 25%, transparent 50%,
     rgba(255, 255, 255, .30) 50%,
     rgba(255, 255, 255, .30) 75%, transparent 75%, transparent);

   animation: animate-stripes 3s linear infinite;
 }

 @keyframes animate-stripes {
   0% {background-position: 0 0;} 100% {background-position: 60px 0;}
 }

 .processing {
   background-color: lightgreen;
 }

 .queued {
   background-color: lightblue;
 }

 .db-link-list {
   font-size: initial;
 }

 .ds-item-line {
   overflow: hidden;
   white-space: nowrap;
   text-overflow: ellipsis;
 }

</style>
