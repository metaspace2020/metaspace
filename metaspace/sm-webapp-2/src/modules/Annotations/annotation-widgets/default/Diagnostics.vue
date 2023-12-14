<template>
  <div v-loading="loading">
    <el-alert
      v-if="hasIsobars"
      :closable="false"
      :type="hasWarnIsobar ? 'warning' : 'info'"
      show-icon
      class="isobar-alert"
    >
      {{ nonReferenceGroups.length === 1
        ? 'Another ion was annotated that is isobaric to the selected annotation.'
        : 'Other ions were annotated that are isobaric to the selected annotation.' }}
      <span v-if="!hasWarnIsobar">
        {{ nonReferenceGroups.length === 1
          ? 'However, as its MSM score is significantly lower, it is likely a false discovery.'
          : 'However, as their MSM scores are significantly lower, they are likely false discoveries.' }}
      </span>
      Select an isobaric annotation below to compare against.
    </el-alert>
    <div
      v-if="hasIsobars"
      class="compare-container"
    >
      Compare selected annotation to:
      <el-select
        v-model="comparisonIonFormula"
        class="compare-select"
        placeholder="None"
        clearable
      >
        <el-option
          v-for="grp in nonReferenceGroups"
          :key="grp.ionFormula"
          :value="grp.ionFormula"
          :label="grp.label"
          v-html="grp.labelHtml"
        />
      </el-select>
    </div>

    <!-- Reference annotation metrics -->
    <div
      v-if="comparisonAnnotationGroup"
      class="ref-annotation-header"
    >
      <candidate-molecules-popover
        placement="top"
        :possible-compounds="annotation.possibleCompounds"
        :open-delay="100"
      >
        <span
          class="annotation-ion"
          v-html="renderMolFormulaHtml(annotation.ion)"
        />
      </candidate-molecules-popover>
      <span style="padding-left: 5px">(Selected annotation)</span>
    </div>
    <div :class="comparisonAnnotationGroup ? 'ref-annotation-container' : ''">
      <diagnostics-metrics
        :loading="loading"
        :annotation="diagnosticsData"
      />
      <diagnostics-images
        :annotation="annotation"
        :colormap="colormap"
        :image-loader-settings="imageLoaderSettings"
        :isobar-peak-ns="comparisonAnnotationGroup ? comparisonAnnotationGroup.peakNs : null"
      />
    </div>

    <!-- Comparison annotation metrics -->
    <div
      v-if="comparisonAnnotationGroup"
      class="comp-annotation-header"
    >
      <span v-if="comparisonAnnotationGroup.annotations.length > 1">Isobars: </span>
      <span
        v-for="(ann, i) in comparisonAnnotationGroup.annotations"
        :key="i"
      >
        <candidate-molecules-popover
          placement="top"
          :possible-compounds="ann.possibleCompounds"
          :open-delay="100"
        >
          <span
            class="annotation-ion"
            v-html="renderMolFormulaHtml(ann.ion)"
          />
        </candidate-molecules-popover>
        <span v-if="i !== comparisonAnnotationGroup.annotations.length-1">, </span>
      </span>
    </div>
    <div
      v-if="comparisonAnnotationGroup"
      class="comp-annotation-container"
    >
      <diagnostics-metrics
        :loading="comparisonLoading"
        :annotation="comparisonDiagnosticsData"
      />
      <diagnostics-images
        :annotation="comparisonAnnotationGroup.annotations[0]"
        :colormap="colormap"
        :image-loader-settings="imageLoaderSettings"
        :isobar-peak-ns="comparisonPeakNs"
      />
    </div>
    <diagnostics-plot
      :peak-chart-data="peakChartData"
      :ion="annotation.ion"
      :comparison-peak-chart-data="comparisonPeakChartData"
      :comparison-ion="comparisonIon"
    />
  </div>
</template>


<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import { groupBy, intersection, sortBy, xor } from 'lodash-es';
import DiagnosticsMetrics from './DiagnosticsMetrics.vue';
import DiagnosticsImages from './DiagnosticsImages.vue';
import DiagnosticsPlot from '../DiagnosticsPlot.vue';
import CandidateMoleculesPopover from '../CandidateMoleculesPopover.vue';
import { diagnosticsDataQuery, isobarsQuery } from '../../../../api/annotation';
import { renderMassShift, renderMolFormula, renderMolFormulaHtml } from '../../../../lib/util';
import safeJsonParse from '../../../../lib/safeJsonParse';
import reportError from '../../../../lib/reportError';
import config from '../../../../lib/config';
import {ElAlert, ElLoading} from "element-plus";

interface AnnotationGroup {
  isReference: boolean;
  ionFormula: string;
  annotations: any[];
  peakChartData: any;
  peakNs: [number, number][];
}

export default defineComponent({
  components: {
    DiagnosticsMetrics,
    DiagnosticsImages,
    DiagnosticsPlot,
    CandidateMoleculesPopover,
    ElAlert,
  },
  directives: {
    'loading': ElLoading.directive,
  },
  props: {
    annotation: Object,
    colormap: String,
    imageLoaderSettings: Object,
  },
  setup(props) {
    const comparisonLoading = ref(0);
    const comparisonIonFormula = ref(null);
    const isobarAnnotationsIonFormula = ref(null);
    const currentAnnotation = computed(() => props.annotation)
    const peakChartData = computed(() => {
      return diagnosticsData.value != null ? safeJsonParse(diagnosticsData.value.peakChartData) : null
    })


    const hasIsobars = computed(() => {
      return config.features.isobars && currentAnnotation.value.isobars.length !== 0
    })


    const { result: isobarAnnotationsResult } =
      useQuery(isobarsQuery, () => {
        isobarAnnotationsIonFormula.value = currentAnnotation.value.ionFormula
        return {
          datasetId: currentAnnotation.value.dataset.id,
          filter: {
            isobaricWith: currentAnnotation.value.ionFormula,
            databaseId: currentAnnotation.value.databaseDetails.id,
          },
        }
      }, {
        fetchPolicy: 'cache-first',
        enabled: hasIsobars.value
      });
    const isobarAnnotations = computed(() => isobarAnnotationsResult.value?.allAnnotations)

    const annotationGroups = computed(() : AnnotationGroup[]  => {
      const allAnnotations = [currentAnnotation.value, ...(loading.value ? [] : (isobarAnnotations.value || []))]
      const isobarsByIonFormula = groupBy(currentAnnotation.value.isobars, 'ionFormula')
      const isobarsKeys = [currentAnnotation.value.ionFormula, ...Object.keys(isobarsByIonFormula)]
      const annotationsByIonFormula = groupBy(allAnnotations, 'ionFormula')
      const annotationsKeys = Object.keys(annotationsByIonFormula)
      // isobarsByIonFormula and annotationsByIonFormula should line up, but do an inner join just to be safe
      const ionFormulas = intersection(isobarsKeys, annotationsKeys)
      const missingIonFormulas = xor(isobarsKeys, annotationsKeys)
      if (!loading.value
        && isobarAnnotationsIonFormula.value === currentAnnotation.value.ionFormula
        && missingIonFormulas.length > 0) {
        reportError(
          new Error('Inconsistent annotations between Annotation.isobars and isobaricWith query results.'),
          null,
          {
            annotationId: currentAnnotation.value.id,
            ion: currentAnnotation.value.ion,
            isobarsFromPropsAnnotation: isobarsKeys.join(','),
            isobarsFromQuery: annotationsKeys.join(','),
          })
      }


      const groups = ionFormulas.map(ionFormula => {
        const isReference = ionFormula === currentAnnotation.value.ionFormula
        const isobars = isobarsByIonFormula[ionFormula]
        const annotations = annotationsByIonFormula[ionFormula]
        const massShiftText = isReference ? '' : renderMassShift(currentAnnotation.value.mz, annotations[0].mz) + ': '
        const isomersText = annotations.length < 2 ? '' : ' (isomers)'
        return {
          ionFormula,
          isReference,
          annotations,
          peakNs: isReference ? [] : isobars[0].peakNs,
          peakChartData: isReference ? peakChartData.value : safeJsonParse(annotations[0].peakChartData),
          label: massShiftText + annotations.map(ann => renderMolFormula(ann.ion)).join(', ') + isomersText,
          labelHtml: massShiftText + annotations.map(ann => renderMolFormulaHtml(ann.ion)).join(', ') + isomersText,
        }
      })

      // Sort order: reference annotation first, then best by FDR, then best by MSM
      // (consistent with the default sort in AnnotationsTable and RelatedMolecules)
      return sortBy(groups,
        grp => grp.isReference ? 0 : 1,
        grp => grp.annotations[0].fdrLevel,
        grp => -grp.annotations[0].msmScore,
      )
    })


    const comparisonAnnotationGroup = computed(() => {
      return annotationGroups.value.find(grp => grp.ionFormula === comparisonIonFormula.value)
    })

    const { result: diagnosticsDataResult, loading } = useQuery(diagnosticsDataQuery,
      () => ({ id: currentAnnotation.value.id }),
      {
        fetchPolicy: 'cache-first',
        enabled: currentAnnotation.value?.id !== undefined
      })
    const diagnosticsData = computed(() => diagnosticsDataResult.value?.annotation)
    const { result: comparisonDiagnosticsDataResult } =
      useQuery(diagnosticsDataQuery,
        () => ({id: comparisonAnnotationGroup.value?.annotations[0].id}),
    {
      fetchPolicy: 'cache-first',
      enabled: comparisonAnnotationGroup.value?.annotations[0].id !== undefined
    })

    const comparisonDiagnosticsData = computed(() => comparisonDiagnosticsDataResult.value?.annotation)



    const nonReferenceGroups = computed(() => {
      return annotationGroups.value.filter(g => !g.isReference)
    })

    const hasWarnIsobar = computed(() => {
      return currentAnnotation.value.isobars.some((isobar: any) => isobar.shouldWarn)
    })


    const comparisonPeakNs : any = computed(() => {
      return comparisonAnnotationGroup.value && comparisonAnnotationGroup.value.peakNs.map(([a, b]) => ([b, a]))
    })

    const comparisonPeakChartData = computed(() => {
      return comparisonAnnotationGroup.value && comparisonAnnotationGroup.value.peakChartData
    })

    const comparisonIon = computed(() => {
      return comparisonAnnotationGroup.value && comparisonAnnotationGroup.value.annotations[0].ion
    })

    watch(annotationGroups, () => { // resetComparisonIfInvalid
      if (comparisonIonFormula.value
        && !annotationGroups.value.some(ag => ag.ionFormula === comparisonIonFormula.value)) {
        comparisonIonFormula.value = null
      }
    });


    return {
      diagnosticsData,
      comparisonDiagnosticsData,
      isobarAnnotations,
      loading,
      comparisonLoading,
      isobarAnnotationsIonFormula,
      hasIsobars,
      peakChartData,
      comparisonIon,
      comparisonPeakChartData,
      comparisonPeakNs,
      hasWarnIsobar,
      comparisonAnnotationGroup,
      nonReferenceGroups,
      renderMolFormulaHtml,
      comparisonIonFormula,
    };
  },
});
</script>

<style lang="scss" scoped>
@import "element-plus/theme-chalk/src/mixins/mixins";

.isobar-alert {
    margin: 10px 0;
    width: 100%;
}

    .compare-container {
        margin-bottom: 10px;
    }
    .compare-select {
        width: 300px;
        margin-left: 5px;
    }

    $refColor: rgb(72, 120, 208);
    $compColor: rgb(214, 95, 95);
    $rad: 4px;
    .ref-annotation-container {
        border-left: $rad solid rgba($refColor, 0.25);
        border-radius: 0 0 $rad $rad;
        padding: $rad;
    }
    .ref-annotation-header {
        margin-top: 10px;
        background-color: rgba($refColor, 0.25);
        border-radius: $rad $rad 0 0;
        padding: $rad $rad + 10px;
    }
    .comp-annotation-container {
        margin-bottom: 10px;
        border-left: $rad solid rgba($compColor, 0.25);
        border-radius: 0 0 $rad $rad;
        padding: $rad;
    }
    .comp-annotation-header {
        margin-top: 10px;
        background-color: rgba($compColor, 0.25);
        border-radius: $rad $rad 0 0;
        padding: $rad $rad + 10px;
    }
    .annotation-ion {
        font-weight: bold;
    }
</style>
