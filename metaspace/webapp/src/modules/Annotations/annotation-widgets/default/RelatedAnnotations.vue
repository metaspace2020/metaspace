<template>
  <div class="adduct-info-container" v-loading="loading">
    <div class="small-peak-image" v-for="(other, idx) in annotations" :key="idx">
      <span v-if="other.ion !== colocReferenceIon" v-html="renderFormula(other)" />
      <span v-else>Reference annotation<sub><!-- Subscript to make height consistent with formulas --></sub></span>
      <br/>
      {{  other.mz.toFixed(4) }} <br/>
      <image-loader :src="other.isotopeImages[0].url"
            v-bind="imageLoaderSettings"
            :colormap="colormap"
            :max-height=250
            style="overflow: hidden">
      </image-loader>
      <el-popover
        trigger="hover"
        placement="bottom"
        class="rel-annot-details"
      >
        <div slot="reference">
          <span>{{ other.msmScore.toFixed(3) }},</span>
          <span>{{ other.fdrLevel * 100 }}%,</span>
          <span>{{ other.isotopeImages[0].maxIntensity.toExponential(2) }}</span>
          <span v-if="other.colocalizationCoeff != null"> | {{ (other.colocalizationCoeff).toFixed(2) }}</span>
        </div>
        <div>
          <div>MSM: {{ other.msmScore.toFixed(3) }}</div>
          <div>FDR: {{ other.fdrLevel * 100 }}%</div>
          <div>Max. intensity: {{ other.isotopeImages[0].maxIntensity.toExponential(2) }}</div>
          <div v-if="other.colocalizationCoeff != null">Colocalization: {{ (other.colocalizationCoeff).toFixed(2) }}</div>
        </div>
      </el-popover>
    </div>
    <p v-if="annotations != null && annotations.length === 0">No annotations found.</p>
  </div>
</template>

<script>
import { renderMolFormula } from '../../../../util';

import ImageLoader from '../../../../components/ImageLoader.vue';
import { relatedAnnotationsQuery } from '../../../../api/annotation';

export default {
  props: ['query', 'annotation', 'database', 'imageLoaderSettings'],
  components: { ImageLoader },
  data() {
    return {
      loading: 0,
    };
  },
  computed: {
    colormap() {
      return this.$store.getters.settings.annotationView.colormap;
    },
    colocReferenceIon() {
      return this.query === 'colocalized' ? this.annotation.ion : null;
    }
  },
  apollo: {
    annotations: {
      query: relatedAnnotationsQuery,
      loadingKey: 'loading',
      variables() {
        let vars = { datasetId: this.annotation.dataset.id };

        if (this.query === 'allAdducts') {
          vars.filter = { database: this.database, sumFormula: this.annotation.sumFormula };
          vars.orderBy = 'ORDER_BY_MZ';
          vars.sortingOrder = 'ASCENDING'
        } else if (this.query === 'colocalized') {
          const mol = this.annotation.ion;
          const colocalizationAlgo = this.$store.getters.settings.annotationView.colocalizationAlgo;
          const fdrLevel = this.$store.getters.filter.fdrLevel || this.annotation.fdrLevel;
          vars.filter = { database: this.database, colocalizedWith: mol, fdrLevel, colocalizationAlgo };
          vars.colocalizationCoeffFilter = vars.filter;
          vars.orderBy = 'ORDER_BY_COLOCALIZATION';
          vars.sortingOrder = 'DESCENDING';
        }

        return vars;
      },
      update(data) {
        return data.allAnnotations;
      }
    },
  },
  methods: {
    renderFormula(other) {
      return renderMolFormula(other.sumFormula, other.adduct, this.annotation.dataset.polarity);
    }
  }
}
</script>

<style lang="scss">
.adduct-info-container {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
}

.rel-annot-details {
  font-size: smaller;
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
</style>
