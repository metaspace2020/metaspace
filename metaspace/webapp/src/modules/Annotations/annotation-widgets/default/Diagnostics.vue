<template>
<div>
    <div v-for="grp in annotationGroups">
        <div v-if="grp.isReference">
            <h4>Current annotation</h4>
        </div>
        <div v-else>
            Potential misclassification of the {{formatPeakN(grp.peakN)}} peak of:
            <h4 v-for="ann in grp.annotations" v-html="renderMolFormulaHtml(ann.ion)" />
        </div>
        <diagnostics-row
          :annotation="grp.annotations[0]"
          :peakChartData="grp.peakChartData"
          :colormap="colormap"
          :imageLoaderSettings="imageLoaderSettings"
        />
    </div>
    <div v-if="loading" v-loading style="height: 200px" />
</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Component, Prop } from 'vue-property-decorator';

import DiagnosticsRow from './DiagnosticsRow.vue';
import {groupBy, intersection, sortBy, xor} from 'lodash-es';
import {isobarsQuery} from '../../../../api/annotation';
import { renderMolFormulaHtml } from '../../../../util';
import safeJsonParse from '../../../../lib/safeJsonParse';

@Component<Diagnostics>({
    name: 'diagnostics',
    components: {
        DiagnosticsRow,
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
    annotation: any
    @Prop()
    peakChartData: any
    @Prop()
    colormap: any
    @Prop()
    imageLoaderSettings: any

    loading = 0
    isobarAnnotations: any[] = []
    renderMolFormulaHtml = renderMolFormulaHtml;

    get annotationGroups() {
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
                peakN: isReference ? 1 : isobars[0].peakN,
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

    formatPeakN(peakN: number) {
        if (peakN === 1) {
            return '1st';
        } else if (peakN === 2) {
            return '2nd';
        } else if (peakN === 2) {
            return '3rd';
        } else {
            return `${peakN}th`
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
