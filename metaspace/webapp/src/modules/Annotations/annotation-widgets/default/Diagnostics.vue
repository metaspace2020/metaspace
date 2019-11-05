<template>
<div v-loading="loading">
    <el-alert v-if="hasIsobars" :closable="false" type="warning" show-icon style="margin: 10px">
        {{annotationGroups.filter(g => !g.isReference).length === 1
        ? 'Another ion was annotated that is isobaric to the selected annotation.'
        : 'Other ions were annotated that are isobaric to the selected annotation.'}}
        Select an isobaric annotation below to compare against.
    </el-alert>
    <div class="compare-container" v-if="hasIsobars">
        Compare selected annotation to:
        <el-select
          v-model="comparisonIonFormula"
          class="compare-select"
          placeholder="None"
          clearable
        >
            <el-option
              v-for="grp in annotationGroups"
              v-if="!grp.isReference"
              :key="grp.ionFormula"
              :value="grp.ionFormula"
              :label="grp.label"
              v-html="grp.labelHtml"
            />
        </el-select>
    </div>

    <!-- Reference annotation metrics -->
    <div v-if="comparisonAnnotationGroup" class="ref-annotation-header">
        <candidate-molecules-popover
          placement="top"
          :possibleCompounds="annotation.possibleCompounds"
          :openDelay="100">
            <span class="annotation-ion" v-html="renderMolFormulaHtml(annotation.ion)" />
        </candidate-molecules-popover>
        <span style="padding-left: 5px">(Selected annotation)</span>
    </div>
    <div :class="comparisonAnnotationGroup ? 'ref-annotation-container' : ''">
        <diagnostics-metrics
          :annotation="annotation"
        />
        <diagnostics-images
          :annotation="annotation"
          :colormap="colormap"
          :imageLoaderSettings="imageLoaderSettings"
        />
    </div>

    <!-- Comparison annotation metrics -->
    <div v-if="comparisonAnnotationGroup" class="comp-annotation-header">
        <span v-if="comparisonAnnotationGroup.annotations.length > 1">Isobars: </span>
        <span v-for="(ann, i) in comparisonAnnotationGroup.annotations">
            <candidate-molecules-popover
              placement="top"
              :possibleCompounds="ann.possibleCompounds"
              :openDelay="100">
                <span class="annotation-ion" v-html="renderMolFormulaHtml(ann.ion)" />
            </candidate-molecules-popover>
            <span v-if="i !== comparisonAnnotationGroup.annotations.length-1">, </span>
        </span>
    </div>
    <div v-if="comparisonAnnotationGroup" class="comp-annotation-container">
        <diagnostics-metrics
          :annotation="comparisonAnnotationGroup.annotations[0]"
        />
        <diagnostics-images
          :annotation="comparisonAnnotationGroup.annotations[0]"
          :colormap="colormap"
          :imageLoaderSettings="imageLoaderSettings"
        />
    </div>
    <diagnostics-plot
      :peakChartData="peakChartData"
      :comparisonPeakChartData="comparisonPeakChartData"
    />
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import {Component, Prop, Watch} from 'vue-property-decorator';

import DiagnosticsMetrics from './DiagnosticsMetrics.vue';
import DiagnosticsImages from './DiagnosticsImages.vue';
import DiagnosticsPlot from './DiagnosticsPlot.vue';
import CandidateMoleculesPopover from '../CandidateMoleculesPopover.vue';
import {groupBy, intersection, sortBy, xor} from 'lodash-es';
import {isobarsQuery} from '../../../../api/annotation';
import { renderMolFormula, renderMolFormulaHtml } from '../../../../util';
import safeJsonParse from '../../../../lib/safeJsonParse';
import reportError from '../../../../lib/reportError';

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
        isobarAnnotations: {
            query: isobarsQuery,
            loadingKey: 'loading',
            skip() {
                return !this.hasIsobars;
            },
            variables() {
                this.isobarAnnotationsIonFormula = this.annotation.ionFormula;
                return {
                    datasetId: this.annotation.dataset.id,
                    ionFormula: this.annotation.ionFormula,
                };
            },
            update(data) {
                return data.allAnnotations;
            }
        },
    },
})
export default class Diagnostics extends Vue {
    @Prop()
    annotation: any;
    @Prop()
    peakChartData: any;
    @Prop()
    colormap: any;
    @Prop()
    imageLoaderSettings: any;

    loading = 0;
    isobarAnnotations: any[] = [];
    // Keep track of the last ionFormula used for fetching isobars, so that discrepancies can be reported
    isobarAnnotationsIonFormula: string | null = null;
    renderMolFormula = renderMolFormula;
    renderMolFormulaHtml = renderMolFormulaHtml;
    comparisonIonFormula: string | null = null;

    @Watch('annotationGroups')
    resetComparisonIfInvalid() {
        if (this.comparisonIonFormula
          && !this.annotationGroups.some(ag => ag.ionFormula == this.comparisonIonFormula)) {
            this.comparisonIonFormula = null;
        }
    }

    get annotationGroups(): AnnotationGroup[] {
        const allAnnotations = [this.annotation, ...(this.loading ? [] : this.isobarAnnotations)];
        const isobarsByIonFormula = groupBy(this.annotation.isobars, 'ionFormula');
        const isobarsKeys = [this.annotation.ionFormula, ...Object.keys(isobarsByIonFormula)];
        const annotationsByIonFormula = groupBy(allAnnotations, 'ionFormula');
        const annotationsKeys = Object.keys(annotationsByIonFormula);
        // isobarsByIonFormula and annotationsByIonFormula should line up, but do an inner join just to be safe
        const ionFormulas = intersection(isobarsKeys, annotationsKeys);
        const missingIonFormulas = xor(isobarsKeys, annotationsKeys);
        if (!this.loading
          && this.isobarAnnotationsIonFormula === this.annotation.ionFormula
          && missingIonFormulas.length > 0) {
            reportError(new Error(
              'Inconsistent annotations between Annotation.isobars and isobaricWith query results. '
              + `Annotation ${this.annotation.id} ${this.annotation.ion}: `
              + `${Object.keys(isobarsByIonFormula).join(',')} != ${Object.keys(annotationsByIonFormula).join(',')}`
            ), null);
        }

        const groups = ionFormulas.map(ionFormula => {
            const isReference = ionFormula === this.annotation.ionFormula;
            const isobars = isobarsByIonFormula[ionFormula];
            const annotations = annotationsByIonFormula[ionFormula];
            const deltaMz = annotations[0].mz - this.annotation.mz;
            const massShiftText = isReference ? '' : `[M${deltaMz >= 0 ? '+' : ''}${deltaMz.toFixed(4)}]: `;
            const isomersText = annotations.length < 2 ? '' : ' (isomers)';
            return {
                ionFormula, isReference, annotations,
                peakNs: isReference ? 1 : isobars[0].peakNs,
                peakChartData: isReference ? this.peakChartData : safeJsonParse(annotations[0].peakChartData),
                label: massShiftText + annotations.map(ann => renderMolFormula(ann.ion)).join(', ') + isomersText,
                labelHtml: massShiftText + annotations.map(ann => renderMolFormulaHtml(ann.ion)).join(', ') + isomersText,
            }
        });

        return sortBy(groups, [
          grp => grp.isReference ? 0 : 1,
          grp => -grp.annotations[0].msm
        ]);
    }

    get hasIsobars() {
        return this.annotation.isobars.length != 0;
    }

    get comparisonAnnotationGroup() {
        return this.annotationGroups.find(grp => grp.ionFormula === this.comparisonIonFormula);
    }

    get comparisonPeakChartData() {
        const grp = this.annotationGroups.find(grp => grp.ionFormula === this.comparisonIonFormula);
        if (grp != null) {
            return grp.peakChartData;
        }
        return null;
    }
}
</script>

<style lang="scss" scoped>
@import "~element-ui/packages/theme-chalk/src/common/var";

#scores-table {
    display: flex;
    border-collapse: collapse;
    border: 1px solid lightblue;
    font-size: 16px;
    padding: 3px 10px;
    align-items: center;
}

.msm-score-calc {
    text-align: center;
    flex-grow: 1;
    justify-content: center;
}

.msm-score-calc > span {
    color: blue;
}

#isotope-images-container {
    margin: 10px auto;
    text-align: center;
    font-size: 13px;
}

.small-peak-image {
    font-size: 1rem;
    vertical-align: top;
    padding: 0 5px 0 5px;
    text-align: center;
    flex: 0 1 260px;
    box-sizing: border-box;

    @media (max-width: 768px) {
        flex-basis: 100%;
    }
}

    .off-sample-tag {
        margin-left: 10px;
        color: white;
        padding: 0 3px;
        background: $--color-warning;
        border-radius: 3px;
    }
    .on-sample-tag {
        margin-left: 10px;
        color: white;
        padding: 0 3px;
        background: $--color-success;
        border-radius: 3px;
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
