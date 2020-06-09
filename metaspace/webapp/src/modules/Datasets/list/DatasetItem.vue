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

    <div class="ds-info">
      <div class="ds-item-line flex">
        <!-- title is set to make it easier to see overflowing datasets' names by hovering over the name -->
        <span
          :title="formatDatasetName"
          class="font-bold truncate"
        >{{ formatDatasetName }}</span>
        <el-popover
          v-if="!dataset.isPublic"
          class="ml-1"
          trigger="hover"
          placement="top"
          @show="loadVisibility"
        >
          <div v-loading="visibilityText == null">
            {{ visibilityText }}
          </div>
          <i
            slot="reference"
            class="el-icon-lock"
          />
        </el-popover>
      </div>

      <div class="ds-item-line text-gray-700">
        <span
          class="ds-add-filter"
          title="Filter by species"
          @click="addFilter('organism')"
        >
          {{ formatOrganism }}</span>,
        <span
          class="ds-add-filter"
          title="Filter by organism part"
          @click="addFilter('organismPart')"
        >
          {{ formatOrganismPart }}</span>

        <span
          class="ds-add-filter"
          title="Filter by condition"
          @click="addFilter('condition')"
        >
          ({{ formatCondition }})</span>
      </div>
      <div class="ds-item-line">
        <span
          class="ds-add-filter"
          title="Filter by ionisation source"
          @click="addFilter('ionisationSource')"
        >
          {{ dataset.ionisationSource }}</span> +
        <span
          class="ds-add-filter"
          title="Filter by analyzer type"
          @click="addFilter('analyzerType')"
        >
          {{ dataset.analyzer.type }}</span>,
        <span
          class="ds-add-filter"
          title="Filter by polarity"
          @click="addFilter('polarity')"
        >
          {{ dataset.polarity.toLowerCase() }} mode</span>,
        RP {{ formatResolvingPower }}
      </div>

      <div class="ds-item-line">
        Submitted <elapsed-time :date="dataset.uploadDT" /> by
        <span
          class="ds-add-filter"
          title="Filter by submitter"
          @click="addFilter('submitter')"
        >
          {{ formatSubmitter }}</span><!--
          Be careful not to add empty space before the comma
          --><span v-if="dataset.groupApproved && dataset.group">,
          <el-dropdown
            :show-timeout="50"
            placement="bottom"
            :trigger="hideGroupMenu ? 'never' : 'hover'"
            @command="handleDropdownCommand"
          >
            <span
              class="text-base text-primary cursor-pointer"
              @click="addFilter('group')"
            >
              {{ dataset.group.shortName }}
            </span>
            <el-dropdown-menu slot="dropdown">
              <el-dropdown-item command="filter_group">Filter by this group</el-dropdown-item>
              <el-dropdown-item command="view_group">View group</el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </span>
      </div>
      <div
        v-if="dataset.status == 'FINISHED' && dataset.fdrCounts"
        class="ds-item-line"
      >
        <span>
          <router-link :to="resultsHref(dataset.fdrCounts.databaseId)">{{ formatFdrCounts() | plural('annotation', 'annotations') }}</router-link>
          @ FDR {{ formatFdrLevel() }}% in {{ formatDbName() }}
        </span>
      </div>
    </div>

    <div class="ds-actions">
      <span v-if="dataset.status == 'FINISHED'">
        <i class="el-icon-picture" />
        <el-popover
          trigger="hover"
          placement="top"
        >
          <div class="db-link-list">
            <span class="text-sm text-gray-700">Select database:</span>
            <div
              v-for="db in dataset.databases"
              :key="db.id"
            >
              <router-link :to="resultsHref(db.id)">
                {{ db.name }}
              </router-link>
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
        class="mt-auto text-right text-gray-700 text-sm"
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
import { capitalize } from 'lodash-es'
import {
  datasetVisibilityQuery,
  deleteDatasetQuery,
  reprocessDatasetQuery,
} from '../../../api/dataset'
import { mdTypeSupportsOpticalImages } from '../../../lib/util'
import { encodeParams } from '../../Filters/index'
import reportError from '../../../lib/reportError'
import safeJsonParse from '../../../lib/safeJsonParse'
import { plural } from '../../../lib/vueFilters'
import ElapsedTime from '../../../components/ElapsedTime'
import DownloadDialog from './DownloadDialog'

function removeUnderscores(str) {
  return str.replace(/_/g, ' ')
}

export default {
  name: 'DatasetItem',
  components: {
    DatasetInfo,
    DatasetThumbnail,
    ElapsedTime,
    DownloadDialog,
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
      return mdTypeSupportsOpticalImages(this.$store.getters.filter.metadataType)
    },

    formatSubmitter() {
      const { name } = this.dataset.submitter
      return name
    },

    formatDatasetName() {
      return this.dataset.name
    },

    analyzerType() {
      return this.dataset.analyzer.type
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

    formatOrganism() {
      return removeUnderscores(this.dataset.organism)
    },

    formatCondition() {
      return removeUnderscores(this.dataset.condition).toLowerCase()
    },

    formatOrganismPart() {
      return removeUnderscores(this.dataset.organismPart).toLowerCase()
    },

    formatResolvingPower() {
      const rpSection = this.metadata.MS_Analysis.Detector_Resolving_Power
      const { mz, Resolving_Power: rp } = rpSection
      return (rp / 1000).toFixed(0) + 'k @ ' + mz
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

    visibilityText() {
      if (this.datasetVisibility != null) {
        const { submitter, group, projects } = this.datasetVisibility
        const submitterName = this.currentUser && submitter.id === this.currentUser.id ? 'you' : submitter.name
        const all = [
          submitterName,
          ...(group ? [group.name] : []),
          ...(projects || []).map(p => p.name),
        ]
        return 'These annotation results are not publicly visible. '
          + `They are visible to ${all.join(', ')} and METASPACE Administrators.`
      }
      return null
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
  apollo: {
    datasetVisibility: {
      query: datasetVisibilityQuery,
      skip: true,
      variables() {
        return { id: this.dataset.id }
      },
    },
  },

  methods: {
    resultsHref(database) {
      const filter = Object.assign({}, this.$store.getters.filter, {
        database,
        datasetIds: [this.dataset.id],
      })
      return {
        path: '/annotations',
        query: Object.assign({},
          encodeParams(filter, '/annotations', this.$store.state.filterLists),
          { mdtype: this.dataset.metadataType }),
      }
    },

    showMetadata(e) {
      e.preventDefault()
      this.showMetadataDialog = true
    },

    addFilter(field) {
      const filter = Object.assign({}, this.$store.getters.filter)
      if (field === 'polarity') {
        filter.polarity = capitalize(this.dataset.polarity)
      } else if (field === 'submitter') {
        filter[field] = this.dataset.submitter.id
      } else if (field === 'group') {
        filter[field] = this.dataset.group.id
      } else {
        filter[field] = this.dataset[field] || this[field]
      }
      this.$store.commit('updateFilter', filter)
      this.$emit('filterUpdate', filter)
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

    handleDropdownCommand(command) {
      if (command.startsWith('filter_')) {
        this.addFilter(command.substring('filter_'.length))
      } else if (command === 'view_group') {
        this.$router.push({
          name: 'group',
          params: {
            groupIdOrSlug: this.dataset.group.id,
          },
        })
      }
    },

    formatFdrLevel() {
      return this.dataset.fdrCounts.levels.join(', ')
    },

    formatFdrCounts() {
      return this.dataset.fdrCounts.counts.join(', ')
    },

    formatDbName() {
      return this.dataset.fdrCounts.dbName
    },

    loadVisibility() {
      this.$apollo.queries.datasetVisibility.start()
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
