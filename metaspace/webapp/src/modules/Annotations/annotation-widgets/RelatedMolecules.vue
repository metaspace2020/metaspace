<template>
  <div class="related-molecules" v-loading="loading">
    <div v-for="(other, idx) in sortedAnnotations" :key="other.ion">
      <el-divider v-if="sortedAnnotations.length > 1">
        <div class="ion-heading">
          <component :is="other.ion !== annotation.ion ? 'router-link' : 'div'"
                     :to="other.ion !== annotation.ion ? linkToAnnotation(other) : undefined"
                     class="ion-link">
            <div>
              <span v-if="other.isIsomer">Isomer:</span>
              <span v-else-if="other.isIsobar">Isobar:</span>
              <span class="ion-formula" v-html="renderMolFormulaHtml(other.ion)" />
            </div>

            <div :class="fdrBadgeClass(other)">{{Math.round(other.fdrLevel*100)}}% FDR</div>
            <div v-if="other.isIsobar" :class="msmBadgeClass(other)">{{other.msmScore.toFixed(3)}} MSM</div>
          </component>

          <el-popover v-if="other.isIsomer" trigger="hover" placement="top">
            <div style="max-width: 500px;">
              <p>
                The False Discovery Rate (FDR) for each annotation is calculated among all ions that share the same adduct.
              </p>
              <p>
                It is possible for isomeric annotations to show different FDRs due to having different adducts.
                In these cases, it is an indicator of certain adducts having a higher or lower probability of
                incorrectly labelling unknown molecules.
              </p>
              <p>
                The FDR should not be used to decide which isomeric molecule is more likely to be correct.
              </p>
            </div>
            <i slot="reference" class="el-icon-question help-icon" />
          </el-popover>

          <el-popover v-else-if="other.isIsobar" trigger="hover" placement="top">
            <div style="max-width: 400px;">
              <p>
                When two isobaric ions are annotated with significantly different MSM scores (>0.5),
                it is generally reasonable to assume that the lower-scoring ion is a mis-annotation.
              </p>
              <p>
                To help manually review cases when the MSM scores are similar, the <b>Diagnostics</b> panel
                allows side-by-side comparison of isotopic ion images and spectra.
              </p>
            </div>
            <i slot="reference" class="el-icon-question help-icon" />
          </el-popover>
        </div>
      </el-divider>

      <compounds-list :compounds="other.possibleCompounds" />
    </div>

    <p v-if="sortedAnnotations != null && sortedAnnotations.length === 0" class="empty-message">
      No annotations found.
    </p>
  </div>
</template>

<script>
  import {omit, sortBy, uniqBy} from 'lodash-es';
  import {renderMolFormulaHtml} from '../../../util';
  import {relatedMoleculesQuery} from '../../../api/annotation';
  import {encodeParams, stripFilteringParams} from '../../Filters';
  import {ANNOTATION_SPECIFIC_FILTERS} from '../../Filters/filterSpecs';
  import CompoundsList from './CompoundsList.vue';
  import config from '../../../config';

export default {
  props: {
    annotation: { type: Object, required: true },
    database: { type: String, requried: true },
  },
  components: { CompoundsList },
  data() {
    return {
      loading: 0,
    };
  },
  apollo: {
    isomerAnnotations: {
      query: relatedMoleculesQuery,
      loadingKey: 'loading',
      skip() {
        return !config.features.isomers;
      },
      variables() {
        return {
          datasetId: this.annotation.dataset.id,
          filter: { database: this.database, ionFormula: this.annotation.ionFormula },
          orderBy: 'ORDER_BY_FDR_MSM',
          sortingOrder: 'ASCENDING',
        };
      },
      update(data) {
        return data.allAnnotations;
      }
    },
    isobarAnnotations: {
      query: relatedMoleculesQuery,
      loadingKey: 'loading',
      skip() {
        return !config.features.isobars;
      },
      variables() {
        return {
          datasetId: this.annotation.dataset.id,
          filter: { database: this.database, isobaricWith: this.annotation.ionFormula },
          orderBy: 'ORDER_BY_FDR_MSM',
          sortingOrder: 'ASCENDING',
        };
      },
      update(data) {
        return data.allAnnotations;
      }
    },
  },
  computed: {
    sortedAnnotations() {
      let annotations = [
        this.annotation,
        ...(this.isomerAnnotations || []).map(ann => ({...ann, isIsomer: true})),
        ...(this.isobarAnnotations || []).map(ann => ({...ann, isIsobar: true})),
      ];
      annotations = sortBy(annotations, a => a.ion === this.annotation.ion ? 0 : 1);
      annotations = uniqBy(annotations, a => a.ion);

      return annotations;
    }
  },
  methods: {
    renderMolFormulaHtml,
    linkToAnnotation(other) {
      const filters = {
        datasetIds: [this.annotation.dataset.id],
        ionFormula: other.ionFormula,
        fdrLevel: Math.max(other.fdrLevel, this.$store.getters.filter.fdrLevel),
      };

      // Make a best effort to remove existing filters that might prevent showing the linked annotation, while
      // keeping the rest. e.g. keep expanded sections and selected FDR, but remove page and m/z
      const nonFilterParams = stripFilteringParams(this.$route.query);
      const filtersToKeep = omit(this.$store.getters.filter, ANNOTATION_SPECIFIC_FILTERS);
      const filterParams = encodeParams({
        ...filtersToKeep,
        ...filters,
      }, this.$route.path, this.$store.state.filterLists);
      return {
        query: {
          ...nonFilterParams,
          ...filterParams,
          page: undefined,
          sort: undefined,
        }
      }
    },
    fdrBadgeClass(other) {
      if (other.fdrLevel <= 0.05) {
        return 'fdr-badge fdr-badge-5'
      } else if (other.fdrLevel <= 0.10) {
        return 'fdr-badge fdr-badge-10'
      } else if (other.fdrLevel <= 0.20) {
        return 'fdr-badge fdr-badge-20'
      } else {
        return 'fdr-badge fdr-badge-50'
      }
    },
    msmBadgeClass(other) {
      if (other.msmScore >= 0.9) {
        return 'msm-badge msm-badge-900'
      } else if (other.msmScore >= 0.5) {
        return 'msm-badge msm-badge-500'
      } else if (other.msmScore >= 0.1) {
        return 'msm-badge msm-badge-100'
      } else {
        return 'msm-badge msm-badge-000'
      }
    }
  }
}
</script>

<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";

  .ion-heading {
    display: flex;
    align-items: center;
  }
  .ion-link, a.ion-link:link {
    display: flex;
    align-items: center;
    text-decoration: none;
    font-size: 1.2em;
    color: $--color-text-regular;

    .ion-formula {
      font-weight: bold;
    }
  }
  .help-icon {
    font-size: 16px;
    color: $--color-text-regular;
  }

  .fdr-badge {
    border-radius: 5px;
    padding: 2px 5px;
    margin: auto 10px;

    &.fdr-badge-5 {
      background-color: #c8ffc8;
    }

    &.fdr-badge-10 {
      background-color: #e0ffe0;
    }

    &.fdr-badge-20 {
      background-color: #ffe;
    }

    &.fdr-badge-50 {
      background-color: #fff5e0;
    }
  }

  .msm-badge {
    border-radius: 5px;
    padding: 2px 5px;
    margin: auto 10px;

    &.msm-badge-900 {
      background-color: #76c6ba;
    }

    &.msm-badge-500 {
      background-color: #d4ede9;
    }

    &.msm-badge-100 {
      background-color: #f6ecd1;
    }

    &.msm-badge-000 {
      background-color: #dbb972;
    }
  }
</style>
