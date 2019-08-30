<template>
  <div class="related-molecules" v-loading="loading">
    <div class="small-peak-image" v-for="(other, idx) in annotations" :key="other.ion">
      <span v-if="other.ion === annotation.ion"
            v-html="renderMolFormulaHtml(other.ion)"
            class="ion-link" />
      <router-link v-else
                   v-html="renderMolFormulaHtml(other.ion)"
                   class="ion-link"
                   :to="linkToAnnotation(other)" />

      <compounds-list :compounds="other.possibleCompounds" />
    </div>

    <p v-if="annotations != null && annotations.length === 0" class="empty-message">
      No annotations found.
    </p>
  </div>
</template>

<script>
  import {omit, sortBy} from 'lodash-es';
  import {renderMolFormulaHtml} from '../../../util';
  import {relatedMoleculesQuery} from '../../../api/annotation';
  import {encodeParams, stripFilteringParams} from '../../Filters';
  import {ANNOTATION_SPECIFIC_FILTERS} from '../../Filters/filterSpecs';
  import CompoundsList from './CompoundsList.vue';

export default {
  props: ['query', 'annotation', 'database'],
  components: { CompoundsList },
  data() {
    return {
      loading: 0,
    };
  },
  apollo: {
    annotations: {
      query: relatedMoleculesQuery,
      loadingKey: 'loading',
      variables() {
        let vars = { datasetId: this.annotation.dataset.id };

        vars.filter = { database: this.database, ionFormula: this.annotation.ionFormula };
        vars.orderBy = 'ORDER_BY_FDR_MSM';
        vars.sortingOrder = 'DESCENDING';

        return vars;
      },
      update(data) {
        return sortBy(data.allAnnotations, a => a.ion === this.annotation.ion ? 0 : 1);
      }
    },
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
          sort: this.query === 'colocalized' ? '-colocalization' : undefined,
        }
      }
    }
  }
}
</script>

<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";
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
    padding: 8px 5px;
    text-align: center;
    flex: 0 1 260px;
    box-sizing: border-box;

    @media (max-width: 768px) {
      flex-basis: 100%;
    }
  }
  .mol-formula-line {
    line-height: 1em;
  }

  .ion-link, a.ion-link:link {
    color: $--color-text-primary;
    text-decoration: none;
  }
  .empty-message {
    color: #909399;
    text-align: center;
  }
</style>
