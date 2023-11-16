<template>
  <div id="annot-page">
    <filter-panel
      :level="currentLevel"
    />
  </div>
</template>

<script>
import {defineComponent, ref, computed, onMounted, onUnmounted} from 'vue';
import { useStore } from 'vuex';
import { useRoute } from 'vue-router';
// import AnnotationTable from './AnnotationTable.vue';
// import AnnotationView from './AnnotationView.vue';
import { FilterPanel } from '../Filters/index';
import config from '../../lib/config';
// import { useRestoredState } from '../ImageViewer';
// import isSnapshot from '../../lib/isSnapshot';

export default defineComponent({
  name: 'AnnotationsPage',
  components: {
    // AnnotationTable,
    // AnnotationView,
    FilterPanel,
  },
  setup() {
    const store = useStore();
    const route = useRoute();
    const hideImageViewer = ref(false);

    const filter = computed(() => store.getters.filter);

    const hiddenColumns = computed(() => {
      const { group, database, datasetIds, colocalizedWith, fdrLevel } = filter.value;
      const hiddenColumns = [];
      const singleDatasetSelected = datasetIds && datasetIds.length === 1;
      if (singleDatasetSelected) {
        hiddenColumns.push('Dataset');
      }
      if (group || singleDatasetSelected) {
        hiddenColumns.push('Group');
      }
      if (database) {
        hiddenColumns.push('Database');
      }
      if (!singleDatasetSelected || colocalizedWith == null || fdrLevel == null) {
        hiddenColumns.push('ColocalizationCoeff');
      }
      if (!config.features.off_sample_col) {
        hiddenColumns.push('OffSampleProb');
      }
      return hiddenColumns;
    });

    const tableWidth = computed(() => {
      return (14
        - (hiddenColumns.value.filter(c => ['Dataset', 'Group'].includes(c)).length * 2)
        - (hiddenColumns.value.filter(c => ['ColocalizationCoeff', 'OffSampleProb'].includes(c)).length * 1));
    });

    const currentLevel = computed(() => {
      return route.name === 'dataset-annotations' ? 'dataset-annotation' : 'annotation';
    });

    const isFromDatasetOverview = computed(() => {
      return route.name === 'dataset-annotations';
    });

    const datasetOverviewLink = computed(() => {
      return {
        name: 'dataset-overview',
        params: { dataset_id: route.params.dataset_id },
      };
    });

    const selectedAnnotation = computed(() => {
      return store.state.annotation;
    });

    const selectedNormalizationMatrix = computed(() => {
      return store.state.normalization;
    });

    function toggleHideImageViewer() {
      hideImageViewer.value = !hideImageViewer.value;
    }

    onMounted(() => {
      const filterValue = filter.value;
      delete filterValue.annotationIds;
      store.commit('updateFilter', filterValue);
      store.commit('resetRoiInfo');
      //
      // if (isSnapshot()) {
      //   const { viewId } = route.query;
      //   const { datasetIds } = filter.value;
      //   useRestoredState(store.$apollo, viewId, datasetIds[0]);
      // }
    });

    onUnmounted(() => {
      const store = useStore();
      store.commit('setAnnotation', undefined);
      store.commit('setSnapshotAnnotationIds', undefined);
    });

    return {
      hideImageViewer,
      hiddenColumns,
      tableWidth,
      currentLevel,
      isFromDatasetOverview,
      datasetOverviewLink,
      selectedAnnotation,
      selectedNormalizationMatrix,
      toggleHideImageViewer,
      filter
    };
  },
});

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
