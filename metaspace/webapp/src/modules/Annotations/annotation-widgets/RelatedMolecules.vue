<template>
  <div class="related-molecules" v-loading="loading">
    <div v-for="(other, idx) in annotations" :key="other.ion">
      <component v-if="annotations.length > 1"
                 :is="other.ion !== annotation.ion ? 'router-link' : 'div'"
                 :to="other.ion !== annotation.ion ? linkToAnnotation(other) : undefined"
                 class="ion-link">
        <h3>
          {{other.ion === annotation.ion ? 'Selected annotation' : 'Isomeric annotation'}}
          <span class="ion-formula" v-html="renderMolFormulaHtml(other.ion)" />
          <span :class="fdrBadgeClass(other)">{{Math.round(other.fdrLevel*100)}}% FDR</span>
        </h3>
      </component>

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
    }
  }
}
</script>

<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";

  .ion-link, a.ion-link:link {
    display: block;
    margin-left: 10px;
    color: $--color-text-primary;
    text-decoration: none;

    h3 {
      font-weight: normal;

      .ion-formula {
        font-weight: bold;
      }
    }
  }

  .fdr-badge {
    border-radius: 5px;
    padding: 5px;
    margin: 0 10px;

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
</style>
