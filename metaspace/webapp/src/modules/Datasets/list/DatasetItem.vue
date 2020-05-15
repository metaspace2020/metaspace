<template>
  <div
    v-if="!deferRender"
    class="dataset-item border border-solid border-gray-200 leading-5"
    :class="disabledClass"
  >
    <el-dialog
      title="Provided metadata"
      :lock-scroll="false"
      :visible.sync="showMetadataDialog"
    >
      <dataset-info
        :metadata="metadata"
        :current-user="currentUser"
      />
    </el-dialog>

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

    <div class="ds-actions">
      <span v-if="dataset.status == 'FINISHED'">
        <i class="el-icon-picture" />
        <el-popover
          trigger="hover"
          placement="top"
        >
          <div class="db-link-list">
            Select a database:
            <div
              v-for="database in metaboliteDatabases"
              :key="database"
            >
              <FilterLink :filter="{database, datasetIds: [dataset.id]}">
                {{ database }}
              </FilterLink>
            </div>
          </div>
          <a slot="reference">Browse annotations</a>
        </el-popover>
        <br>
      </span>

      <span v-if="dataset.status === 'ANNOTATING'">
        <div
          class="striped-progressbar processing"
          title="Processing is under way"
        />
      </span>

      <span v-if="dataset.status === 'QUEUED'">
        <div
          class="striped-progressbar queued"
          title="Waiting in the queue"
        />
      </span>

      <div>
        <i class="el-icon-view" />
        <a
          href="#"
          @click="showMetadata"
        >Show full metadata</a>
      </div>

      <div v-if="canEdit">
        <i class="el-icon-edit" />
        <router-link :to="editHref">
          Edit metadata
        </router-link>
      </div>

      <div
        v-if="dataset.canDownload"
        class="ds-download"
      >
        <i class="el-icon-download" />
        <a
          href="#"
          @click.prevent="() => { showDownloadDialog = true }"
        >Download</a>
      </div>

      <div
        v-if="canDelete"
        class="ds-delete"
      >
        <i class="el-icon-delete" />
        <a
          href="#"
          class="text-danger"
          @click.prevent="openDeleteDialog"
        >Delete dataset</a>
      </div>

      <div
        v-if="canReprocess"
        class="ds-reprocess"
      >
        <i class="el-icon-refresh" />
        <a
          href="#"
          class="text-danger"
          @click.prevent="handleReprocess"
        >Reprocess dataset</a>
      </div>

      <div
        v-else-if="canViewPublicationStatus"
        class="mt-auto text-right text-gray-700 text-sm test-publication-status"
      >
        {{ publicationStatus }}
      </div>
    </div>
    <DownloadDialog
      v-if="showDownloadDialog"
      :dataset-id="dataset.id"
      :dataset-name="dataset.name"
      @close="() => { showDownloadDialog = false }"
    />
  </div>
</template>

<script>
import DatasetInfo from '../../../components/DatasetInfo.vue'
import DatasetThumbnail from './DatasetThumbnail.vue'
import { get } from 'lodash-es'
import {
  deleteDatasetQuery,
  reprocessDatasetQuery,
} from '../../../api/dataset'
import { mdTypeSupportsOpticalImages } from '../../../lib/util'
import reportError from '../../../lib/reportError'
import safeJsonParse from '../../../lib/safeJsonParse'
import { plural } from '../../../lib/vueFilters'
import DownloadDialog from './DownloadDialog'
import { defaultMetadataType } from '../../../lib/metadataRegistry'
import DatasetItemMetadata from './DatasetItemMetadata'
import FilterLink from './FilterLink'

export default {
  name: 'DatasetItem',
  components: {
    DatasetInfo,
    DatasetThumbnail,
    DownloadDialog,
    DatasetItemMetadata,
    FilterLink,
  },
  filters: {
    plural,
  },
  props: ['dataset', 'currentUser', 'idx', 'hideGroupMenu'],
  data() {
    return {
      showMetadataDialog: false,
      disabled: false,
      deferRender: this.idx >= 20,
      showDownloadDialog: false,
    }
  },

  computed: {
    opticalImageAlignmentHref() {
      return {
        name: 'add-optical-image',
        params: { dataset_id: this.dataset.id },
      }
    },

    isOpticalImageSupported() {
      return mdTypeSupportsOpticalImages(get(this.metadata, 'Data_Type') || defaultMetadataType)
    },

    metadata() {
      const datasetMetadataExternals = {
        Submitter: this.dataset.submitter,
        PI: this.dataset.principalInvestigator,
        Group: this.dataset.groupApproved ? this.dataset.group : null,
        Projects: this.dataset.projects,
      }
      return Object.assign(safeJsonParse(this.dataset.metadataJson), datasetMetadataExternals)
    },

    metaboliteDatabases() {
      const dbs = this.dataset.molDBs
      if (typeof dbs === 'string') {
        return [dbs]
      } else {
        return dbs
      }
    },

    canEdit() {
      if (this.currentUser != null) {
        if (this.currentUser.role === 'admin') {
          return true
        }
        if (
          this.currentUser.id === this.dataset.submitter.id
          && !['QUEUED', 'ANNOTATING'].includes(this.dataset.status)
        ) {
          return true
        }
      }
      return false
    },

    canDelete() {
      return (
        (this.currentUser && this.currentUser.role === 'admin')
        || (this.canEdit && this.publicationStatus === null)
      )
    },

    canEditOpticalImage() {
      return this.canEdit && this.dataset.status === 'FINISHED'
    },

    canReprocess() {
      return this.currentUser != null
         && this.currentUser.role === 'admin'
    },

    editHref() {
      return {
        name: 'edit-metadata',
        params: { dataset_id: this.dataset.id },
      }
    },

    disabledClass() {
      return this.disabled ? 'ds-item-disabled' : ''
    },

    canViewPublicationStatus() {
      return (
        this.dataset.status === 'FINISHED'
        && this.canEdit
        && this.publicationStatus !== null
      )
    },

    publicationStatus() {
      let status = null
      for (const project of this.dataset.projects) {
        if (project.publicationStatus === 'PUBLISHED') {
          status = 'Published'
          break
        }
        if (project.publicationStatus === 'UNDER_REVIEW') {
          status = 'Under review'
        }
      }
      return status
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

  methods: {
    showMetadata(e) {
      e.preventDefault()
      this.showMetadataDialog = true
    },

    async openDeleteDialog() {
      const force = this.currentUser != null
         && this.currentUser.role === 'admin'
         && this.dataset.status !== 'FINISHED'
      try {
        const msg = `Are you sure you want to ${force ? 'FORCE-DELETE' : 'delete'} ${this.formatDatasetName}?`
        await this.$confirm(msg, {
          type: force ? 'warning' : null,
          lockScroll: false,
        })
      } catch (cancel) {
        return
      }

      try {
        this.disabled = true
        const resp = await this.$apollo.mutate({
          mutation: deleteDatasetQuery,
          variables: {
            id: this.dataset.id,
            force,
          },
        })
        this.$emit('datasetMutated')
      } catch (err) {
        this.disabled = false
        reportError(err, 'Deletion failed :( Please contact us at contact@metaspace2020.eu')
      }
    },

    async handleReprocess() {
      try {
        this.disabled = true
        await this.$apollo.mutate({
          mutation: reprocessDatasetQuery,
          variables: {
            id: this.dataset.id,
            force: true,
          },
        })
        this.$notify.success('Dataset sent for reprocessing')
        this.$emit('datasetMutated')
      } catch (err) {
        reportError(err)
      } finally {
        this.disabled = false
      }
    },

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
   // Can't use box-sizing:border-box due to IE11 flexbox limitations, so instead using `calc(100% - 2px)`
   flex: 1 1 calc(100% - 2px);
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
   font-variant-numeric: proportional-nums;
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
   padding: 10px 22px 10px 0px;
   margin: 0px;
   flex: none;
   display: flex;
   flex-direction: column;
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
