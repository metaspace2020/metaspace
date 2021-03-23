<template>
  <div id="annot-page">
    <filter-panel
      :level="currentLevel"
    />
    <el-row>
      <el-col
        id="annot-table-container"
        :xs="24"
        :sm="24"
        :md="24"
        :lg="tableWidth"
      >
        <annotation-table :hide-columns="hiddenColumns" />
      </el-col>

      <el-col
        id="annot-view-container"
        :xs="24"
        :sm="24"
        :md="24"
        :lg="24 - tableWidth"
      >
        <annotation-view
          v-if="selectedAnnotation"
          :annotation="selectedAnnotation"
        />

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

export default {
  name: 'AnnotationsPage',
  components: {
    AnnotationTable,
    AnnotationView,
    FilterPanel,
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

    selectedAnnotation() {
      return this.$store.state.annotation
    },

    filter() {
      const filterAux = this.$store?.getters?.filter
      if (this.$route?.name === 'dataset-annotations') { // apply dataset filter if a dataset annotation
        filterAux.datasetIds = [this.$route.params.datasetId]
      }
      return filterAux
    },
  },
  created() {
    this.$store.commit('updateFilter', this.filter)

    if (config.features.multiple_ion_images) {
      const { viewId } = this.$route.query
      const { datasetIds } = this.filter
      if (viewId && datasetIds.length === 1) {
        useRestoredState(this.$apollo, viewId, datasetIds[0])
      }
    }
  },
  destroyed() {
    this.$store.commit('setAnnotation', undefined)
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
