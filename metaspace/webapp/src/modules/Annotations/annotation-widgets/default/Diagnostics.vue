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
import Vue from 'vue'
import { Component, Prop, Watch } from 'vue-property-decorator'

import DiagnosticsMetrics from './DiagnosticsMetrics.vue'
import DiagnosticsImages from './DiagnosticsImages.vue'
import DiagnosticsPlot from '../DiagnosticsPlot.vue'
import CandidateMoleculesPopover from '../CandidateMoleculesPopover.vue'
import { groupBy, intersection, sortBy, xor } from 'lodash-es'
import { diagnosticsDataQuery, isobarsQuery } from '../../../../api/annotation'
import { renderMassShift, renderMolFormula, renderMolFormulaHtml } from '../../../../lib/util'
import safeJsonParse from '../../../../lib/safeJsonParse'
import reportError from '../../../../lib/reportError'
import config from '../../../../lib/config'

interface AnnotationGroup {
    isReference: boolean;
    ionFormula: string;
    annotations: any[];
    peakChartData: any;
    peakNs: [number, number][];
}

@Component<Diagnostics>({
  name: 'diagnostics',
  components: {
    DiagnosticsMetrics,
    DiagnosticsImages,
    DiagnosticsPlot,
    CandidateMoleculesPopover,
  },
  apollo: {
    diagnosticsData: {
      query: diagnosticsDataQuery,
      loadingKey: 'loading',
      fetchPolicy: 'cache-first',
      update: (data: any) => {
        return data.annotation
      },
      variables(): any {
        return {
          id: this.annotation.id,
        }
      },
    },
    comparisonDiagnosticsData: {
      query: diagnosticsDataQuery,
      loadingKey: 'comparisonLoading',
      fetchPolicy: 'cache-first',
      update: (data: any) => {
        return data.annotation
      },
      skip() {
        return this.comparisonAnnotationGroup?.annotations[0].id == null
      },
      variables(): any {
        return {
          id: this.comparisonAnnotationGroup?.annotations[0].id,
        }
      },
    },
    isobarAnnotations: {
      query: isobarsQuery,
      loadingKey: 'loading',
      fetchPolicy: 'cache-first',
      skip() {
        return !this.hasIsobars
      },
      variables() {
        this.isobarAnnotationsIonFormula = this.annotation.ionFormula
        return {
          datasetId: this.annotation.dataset.id,
          filter: {
            isobaricWith: this.annotation.ionFormula,
            databaseId: this.annotation.databaseDetails.id,
          },
        }
      },
      update(data) {
        return data.allAnnotations
      },
    },
  },
})
export default class Diagnostics extends Vue {
    @Prop()
    annotation: any;

    @Prop()
    colormap: any;

    @Prop()
    imageLoaderSettings: any;

    loading = 0;
    comparisonLoading = 0;
    diagnosticsData: any;
    comparisonDiagnosticsData: any;
    isobarAnnotations: any[] = [];
    // Keep track of the last ionFormula used for fetching isobars, so that discrepancies can be reported
    isobarAnnotationsIonFormula: string | null = null;
    renderMolFormula = renderMolFormula;
    renderMolFormulaHtml = renderMolFormulaHtml;
    comparisonIonFormula: string | null = null;

    @Watch('annotationGroups')
    resetComparisonIfInvalid() {
      if (this.comparisonIonFormula
          && !this.annotationGroups.some(ag => ag.ionFormula === this.comparisonIonFormula)) {
        this.comparisonIonFormula = null
      }
    }

    get peakChartData() {
      return this.diagnosticsData != null ? safeJsonParse(this.diagnosticsData.peakChartData) : null
    }

    get annotationGroups(): AnnotationGroup[] {
      const allAnnotations = [this.annotation, ...(this.loading ? [] : this.isobarAnnotations)]
      const isobarsByIonFormula = groupBy(this.annotation.isobars, 'ionFormula')
      const isobarsKeys = [this.annotation.ionFormula, ...Object.keys(isobarsByIonFormula)]
      const annotationsByIonFormula = groupBy(allAnnotations, 'ionFormula')
      const annotationsKeys = Object.keys(annotationsByIonFormula)
      // isobarsByIonFormula and annotationsByIonFormula should line up, but do an inner join just to be safe
      const ionFormulas = intersection(isobarsKeys, annotationsKeys)
      const missingIonFormulas = xor(isobarsKeys, annotationsKeys)
      if (!this.loading
          && this.isobarAnnotationsIonFormula === this.annotation.ionFormula
          && missingIonFormulas.length > 0) {
        reportError(
          new Error('Inconsistent annotations between Annotation.isobars and isobaricWith query results.'),
          null,
          {
            annotationId: this.annotation.id,
            ion: this.annotation.ion,
            isobarsFromPropsAnnotation: isobarsKeys.join(','),
            isobarsFromQuery: annotationsKeys.join(','),
          })
      }

      const groups = ionFormulas.map(ionFormula => {
        const isReference = ionFormula === this.annotation.ionFormula
        const isobars = isobarsByIonFormula[ionFormula]
        const annotations = annotationsByIonFormula[ionFormula]
        const massShiftText = isReference ? '' : renderMassShift(this.annotation.mz, annotations[0].mz) + ': '
        const isomersText = annotations.length < 2 ? '' : ' (isomers)'
        return {
          ionFormula,
          isReference,
          annotations,
          peakNs: isReference ? [] : isobars[0].peakNs,
          peakChartData: isReference ? this.peakChartData : safeJsonParse(annotations[0].peakChartData),
          label: massShiftText + annotations.map(ann => renderMolFormula(ann.ion)).join(', ') + isomersText,
          labelHtml: massShiftText + annotations.map(ann => renderMolFormulaHtml(ann.ion)).join(', ') + isomersText,
        }
      })

      // Sort order: reference annotation first, then best by FDR, then best by MSM
      // (consistent with the default sort in AnnotationsTable and RelatedMolecules)
      return sortBy<AnnotationGroup>(groups,
        grp => grp.isReference ? 0 : 1,
        grp => grp.annotations[0].fdrLevel,
        grp => -grp.annotations[0].msmScore,
      )
    }

    get nonReferenceGroups() {
      return this.annotationGroups.filter(g => !g.isReference)
    }

    get hasIsobars() {
      return config.features.isobars && this.annotation.isobars.length !== 0
    }

    get hasWarnIsobar() {
      return this.annotation.isobars.some((isobar: any) => isobar.shouldWarn)
    }

    get comparisonAnnotationGroup() {
      return this.annotationGroups.find(grp => grp.ionFormula === this.comparisonIonFormula)
    }

    get comparisonPeakNs() {
      return this.comparisonAnnotationGroup && this.comparisonAnnotationGroup.peakNs.map(([a, b]) => ([b, a]))
    }

    get comparisonPeakChartData() {
      return this.comparisonAnnotationGroup && this.comparisonAnnotationGroup.peakChartData
    }

    get comparisonIon() {
      return this.comparisonAnnotationGroup && this.comparisonAnnotationGroup.annotations[0].ion
    }
}
</script>

<style lang="scss" scoped>
@import "~element-ui/packages/theme-chalk/src/common/var";

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
