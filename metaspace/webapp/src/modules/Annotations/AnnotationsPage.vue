<template>
  <div id="annot-page">
    <filter-panel
      :level="currentLevel"
    />
    <div class="my-2 w-full">
      <router-link
        v-if="isFromDatasetOverview"
        :to="datasetOverviewLink"
      >
        <span><i class="el-icon-arrow-left"></i>Dataset Overview</span>
      </router-link>
    </div>
    <el-row>
      <el-col
        id="annot-table-container"
        :xs="24"
        :sm="24"
        :md="24"
        :lg="hideImageViewer ? 24 : tableWidth"
      >
        <annotation-table
          :hide-columns="hiddenColumns"
          :is-full-screen="!hideImageViewer"
          @screen="toggleHideImageViewer"
        />
      </el-col>

      <el-col
        v-if="!hideImageViewer"
        id="annot-view-container"
        :xs="24"
        :sm="24"
        :md="24"
        :lg="24 - tableWidth"
      >
        <annotation-view
          v-if="selectedAnnotation && selectedAnnotation.status !== 'reprocessed_snapshot'"
          :annotation="selectedAnnotation"
          :normalization="selectedNormalizationMatrix"
        />
        <div
          v-if="selectedAnnotation && selectedAnnotation.status === 'reprocessed_snapshot'"
        >
          <el-alert
            title="This share link is no longer valid as the dataset has been reprocessed since
            the link was created."
            type="warning"
            effect="dark"
            :closable="false"
            :show-icon="true"
          >
            <ul
              v-if="selectedAnnotation && selectedAnnotation.annotationIons"
              id="ions"
              class="mt-0 ml-0 pl-2"
            >
              <p class="mb-1 font-bold text-xs">
                This link was supposed to show the following annotation(s):
              </p>
              <li
                v-for="item in selectedAnnotation.annotationIons"
                :key="item.ion"
                class="ml-4"
              >
                {{ item.ion }} - {{ item.database }}
              </li>
            </ul>
          </el-alert>
        </div>

        <el-col
          v-else
          class="av-centered no-selection"
        >
          <div style="align-self: center;">
            <i
              v-if="this.$store.state.tableIsLoading"
              class="el-icon-loading"
            />
          </div>
        </el-col>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import AnnotationTable from './AnnotationTable.vue'
import AnnotationView from './AnnotationView.vue'
import { FilterPanel } from '../Filters/index'
import config from '../../lib/config'
import { useRestoredState } from '../ImageViewer'
import isSnapshot from '../../lib/isSnapshot'

export default {
  name: 'AnnotationsPage',
  components: {
    AnnotationTable,
    AnnotationView,
    FilterPanel,
  },
  data() {
    return {
      hideImageViewer: false,
    }
  },
  computed: {
    hiddenColumns() {
      const { group, database, datasetIds, colocalizedWith, fdrLevel } = this.filter
      const hiddenColumns = []
      const singleDatasetSelected = datasetIds && datasetIds.length === 1
      if (singleDatasetSelected) {
        hiddenColumns.push('Dataset')
      }
      if (group || singleDatasetSelected) {
        hiddenColumns.push('Group')
      }
      if (database) {
        hiddenColumns.push('Database')
      }
      if (!singleDatasetSelected || colocalizedWith == null || fdrLevel == null) {
        hiddenColumns.push('ColocalizationCoeff')
      }
      if (!config.features.off_sample_col) {
        hiddenColumns.push('OffSampleProb')
      }
      return hiddenColumns
    },

    tableWidth() {
      return (14
         - (this.hiddenColumns.filter(c => ['Dataset', 'Group'].includes(c)).length * 2)
         - (this.hiddenColumns.filter(c => ['ColocalizationCoeff', 'OffSampleProb'].includes(c)).length * 1))
    },

    currentLevel() {
      return this.$route.name === 'dataset-annotations' ? 'dataset-annotation' : 'annotation'
    },

    isFromDatasetOverview() {
      return this.$route.name === 'dataset-annotations'
    },

    datasetOverviewLink() {
      return {
        name: 'dataset-overview',
        params: { dataset_id: this.$route.params.dataset_id },
      }
    },

    selectedAnnotation() {
      return this.$store.state.annotation
    },

    selectedNormalizationMatrix() {
      return this.$store.state.normalization
    },

    filter() {
      return this.$store?.getters?.filter
    },
  },
  created() {
    const filter = this.filter
    delete filter.annotationIds
    this.$store.commit('updateFilter', filter)
    this.$store.commit('resetRoiInfo')

    if (isSnapshot()) {
      const { viewId } = this.$route.query
      const { datasetIds } = this.filter
      useRestoredState(this.$apollo, viewId, datasetIds[0])
    }
  },
  destroyed() {
    this.$store.commit('setAnnotation', undefined)
    this.$store.commit('setSnapshotAnnotationIds', undefined)
  },
  methods: {
    toggleHideImageViewer() {
      this.hideImageViewer = !this.hideImageViewer
    },
  },
}
</script>

<style>
  #annot-page {
    padding-left: 5px;
    padding-right: 5px;
  }

  #annot-table-container {
    padding-right: 5px;
  }

  @media (min-width: 1200px) {
    #annot-table-container {
      position: sticky;
      position: -webkit-sticky;
    }
  }

  #annot-view-container {
    padding-left: 5px;
  }

</style>
