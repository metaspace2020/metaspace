<template>
<div v-loading="loading">
    <el-alert v-if="hasIsobars" :closable="false" type="warning">
        This annotation has isobars!
    </el-alert>
    <div v-if="hasIsobars">
        Compare with:
        <ul>
            <li v-for="grp in annotationGroups">
                <a
                  href="#"
                  @click.prevent="handleSelectComparison(grp)">
                    <candidate-molecules-popover
                      v-if="grp.isReference || grp.annotations.length === 1"
                      class="mol-formula-line"
                      placement="top"
                      :possibleCompounds="grp.annotations[0].possibleCompounds"
                      :openDelay="100">
                        <span v-html="renderMolFormulaHtml(grp.annotations[0].ion)" />
                    </candidate-molecules-popover>
                    <span v-if="grp.isReference">(current annotation)</span>
                    <span v-if="!grp.isReference && grp.annotations.length > 1">
                        {{grp.annotations.length}} isomeric annotations at {{grp.annotations[0].mz.toFixed(4)}}
                    </span>
                </a>
                <ul v-if="!grp.isReference && grp.annotations.length > 1">
                    <li v-for="ann in grp.annotations">
                        <candidate-molecules-popover
                          class="mol-formula-line"
                          placement="top"
                          :possibleCompounds="ann.possibleCompounds"
                          :openDelay="100">
                            <span v-html="renderMolFormulaHtml(ann.ion)" />
                        </candidate-molecules-popover>
                    </li>
                </ul>
            </li>
        </ul>
    </div>
    <h4 v-if="comparisonAnnotation">Current annotation</h4>
    <diagnostics-metrics
      :annotation="annotation"
    />
    <diagnostics-images
      :annotation="annotation"
      :colormap="colormap"
      :imageLoaderSettings="imageLoaderSettings"
    />
    <candidate-molecules-popover
      v-if="comparisonAnnotation"
      placement="top"
      :possibleCompounds="comparisonAnnotation.possibleCompounds"
      :openDelay="100">
        <h4 v-html="renderMolFormulaHtml(comparisonAnnotation.ion)" />
    </candidate-molecules-popover>
    <diagnostics-metrics
      v-if="comparisonAnnotation"
      :annotation="comparisonAnnotation"
    />
    <diagnostics-images
      v-if="comparisonAnnotation"
      :annotation="comparisonAnnotation"
      :colormap="colormap"
      :imageLoaderSettings="imageLoaderSettings"
    />
    <diagnostics-plot
      :peakChartData="peakChartData"
      :comparisonPeakChartData="comparisonPeakChartData"
    />
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

import DiagnosticsMetrics from './DiagnosticsMetrics.vue';
import DiagnosticsImages from './DiagnosticsImages.vue';
import DiagnosticsPlot from './DiagnosticsPlot.vue';
import CandidateMoleculesPopover from '../CandidateMoleculesPopover.vue';
import {groupBy, intersection, sortBy, xor} from 'lodash-es';
import {isobarsQuery} from '../../../../api/annotation';
import { renderMolFormulaHtml } from '../../../../util';
import safeJsonParse from '../../../../lib/safeJsonParse';

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
    renderMolFormulaHtml = renderMolFormulaHtml;
    comparisonIonFormula: string | null = null;

    get annotationGroups(): AnnotationGroup[] {
        const allAnnotations = [this.annotation, ...(this.loading ? [] : this.isobarAnnotations)];
        const isobarsByIonFormula = groupBy(this.annotation.isobars, 'ionFormula');
        const isobarsKeys = [this.annotation.ionFormula, ...Object.keys(isobarsByIonFormula)];
        const annotationsByIonFormula = groupBy(allAnnotations, 'ionFormula');
        const annotationsKeys = Object.keys(annotationsByIonFormula);
        // isobarsByIonFormula and annotationsByIonFormula should line up, but do an inner join just to be safe
        const ionFormulas = intersection(isobarsKeys, annotationsKeys);
        const missingIonFormulas = xor(isobarsKeys, annotationsKeys);
        if (!this.loading && missingIonFormulas.length > 0) {
            console.error('Inconsistent annotations between Annotation.isobars and isobaricWith query results.',
              Object.keys(isobarsByIonFormula), Object.keys(annotationsByIonFormula), this.annotation.id)
        }

        const groups = ionFormulas.map(ionFormula => {
            const isReference = ionFormula === this.annotation.ionFormula;
            const isobars = isobarsByIonFormula[ionFormula];
            const annotations = annotationsByIonFormula[ionFormula];
            return {
                ionFormula, isReference, annotations,
                peakNs: isReference ? 1 : isobars[0].peakNs,
                peakChartData: isReference ? this.peakChartData : safeJsonParse(annotations[0].peakChartData)
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

    get comparisonAnnotation() {
        const grp = this.annotationGroups.find(grp => grp.ionFormula === this.comparisonIonFormula);
        if (grp != null) {
            return grp.annotations[0];
        }
        return null;
    }

    get comparisonPeakChartData() {
        const grp = this.annotationGroups.find(grp => grp.ionFormula === this.comparisonIonFormula);
        if (grp != null) {
            return grp.peakChartData;
        }
        return null;
    }

    handleSelectComparison(grp: AnnotationGroup) {
        if (grp.isReference) {
            this.comparisonIonFormula = null;
        } else {
            this.comparisonIonFormula = grp.ionFormula;
        }
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
</style>
