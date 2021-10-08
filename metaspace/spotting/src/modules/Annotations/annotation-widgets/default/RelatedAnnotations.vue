<template>
  <div
    v-loading="loading"
    class="adduct-info-container"
  >
    <div
      v-for="other in annotations"
      :key="other.ion"
      class="small-peak-image"
    >
      <component
        :is="other.ion !== colocReferenceIon ? 'router-link' : 'span'"
        :to="linkToAnnotation(other)"
        class="ion-link"
      >
        <candidate-molecules-popover
          class="mol-formula-line"
          placement="top"
          :possible-compounds="other.possibleCompounds"
          :isomers="other.isomers"
          :isobars="other.isobars"
          :open-delay="100"
        >
          <molecular-formula
            v-if="other.ion !== colocReferenceIon"
            :ion="other.ion"
          />
          <span v-else>Reference annotation<sub><!-- Subscript to make height consistent with formulas --></sub></span>
        </candidate-molecules-popover>

        <br>
        {{ other.mz.toFixed(4) }} <br>
        <image-loader
          :src="other.isotopeImages[0].url"
          :image-fit-params="{areaWidth: 260, areaHeight: 250, areaMinHeight: 50}"
          v-bind="imageLoaderSettings"
          :colormap="colormap"
          :min-intensity="other.isotopeImages[0].minIntensity"
          :max-intensity="other.isotopeImages[0].maxIntensity"
          show-pixel-intensity
        />
        <el-popover
          trigger="hover"
          class="rel-annot-details"
          placement="top"
          :open-delay="100"
        >
          <div slot="reference">
            <span>{{ other.msmScore.toFixed(3) }},</span>
            <span v-if="other.fdrLevel !== null">{{ other.fdrLevel * 100 }}%,</span>
            <span>{{ other.isotopeImages[0].maxIntensity.toExponential(2) }}</span>
            <span v-if="other.colocalizationCoeff != null"> | {{ (other.colocalizationCoeff).toFixed(2) }}</span>
          </div>
          <div>
            <div>MSM: {{ other.msmScore.toFixed(3) }}</div>
            <div v-if="other.fdrLevel !== null">
              FDR: {{ other.fdrLevel * 100 }}%
            </div>
            <div>Max. intensity: {{ other.isotopeImages[0].maxIntensity.toExponential(2) }}</div>
            <div v-if="other.colocalizationCoeff != null">
              Colocalization: {{ (other.colocalizationCoeff).toFixed(2) }}
            </div>
          </div>
        </el-popover>
      </component>
    </div>

    <p
      v-if="noColocJobError"
      class="empty-message"
    >
      Colocalization data not found. <br>
      This can be caused by having no annotations match the current filters,
      or not having enough annotations at this FDR level for analysis.
    </p>
    <p
      v-else-if="annotations != null && annotations.length === 0"
      class="empty-message"
    >
      No annotations found.
    </p>

    <div
      v-if="query === 'colocalized'"
      id="new-feature-popup-coloc"
    />
  </div>
</template>

<script>
import { omit } from 'lodash-es'
import ImageLoader from '../../../../components/ImageLoader.vue'
import { relatedAnnotationsQuery } from '../../../../api/annotation'
import { encodeParams, stripFilteringParams } from '../../../Filters'
import { ANNOTATION_SPECIFIC_FILTERS } from '../../../Filters/filterSpecs'
import CandidateMoleculesPopover from '../CandidateMoleculesPopover'
import MolecularFormula from '../../../../components/MolecularFormula'

export default {
  components: { ImageLoader, CandidateMoleculesPopover, MolecularFormula },
  props: ['query', 'annotation', 'databaseId', 'imageLoaderSettings'],
  data() {
    return {
      loading: 0,
    }
  },
  computed: {
    colormap() {
      return this.$store.getters.settings.annotationView.colormap
    },
    colocReferenceIon() {
      return this.query === 'colocalized' ? this.annotation.ion : null
    },
    noColocJobError() {
      return this.query === 'colocalized' && !this.loading && this.annotations.length === 0
    },
  },
  apollo: {
    annotations: {
      query: relatedAnnotationsQuery,
      loadingKey: 'loading',
      variables() {
        const vars = { datasetId: this.annotation.dataset.id }

        if (this.query === 'allAdducts') {
          vars.filter = { databaseId: this.databaseId, sumFormula: this.annotation.sumFormula }
          vars.orderBy = 'ORDER_BY_MZ'
          vars.sortingOrder = 'ASCENDING'
        } else if (this.query === 'colocalized') {
          const mol = this.annotation.ion
          const colocalizationAlgo = this.$store.getters.settings.annotationView.colocalizationAlgo
          const fdrLevel = this.$store.getters.filter.fdrLevel || this.annotation.fdrLevel
          vars.filter = { databaseId: this.databaseId, colocalizedWith: mol, fdrLevel, colocalizationAlgo }
          vars.colocalizationCoeffFilter = vars.filter
          vars.orderBy = 'ORDER_BY_COLOCALIZATION'
          vars.sortingOrder = 'DESCENDING'
        }

        return vars
      },
      update(data) {
        return data.allAnnotations
      },
    },
  },
  methods: {
    linkToAnnotation(other) {
      let filters = null
      if (this.query === 'allAdducts') {
        filters = {
          datasetIds: [this.annotation.dataset.id],
          compoundName: other.sumFormula,
          adduct: other.adduct,
          fdrLevel: Math.max(other.fdrLevel, this.$store.getters.filter.fdrLevel),
        }
      } else if (this.query === 'colocalized') {
        filters = {
          datasetIds: [this.annotation.dataset.id],
          colocalizedWith: other.ion,
        }
      }

      if (filters != null) {
        // Make a best effort to remove existing filters that might prevent showing the linked annotation, while
        // keeping the rest. e.g. keep expanded sections and selected FDR, but remove page and m/z
        const nonFilterParams = stripFilteringParams(this.$route.query)
        const filtersToKeep = omit(this.$store.getters.filter, ANNOTATION_SPECIFIC_FILTERS)
        const filterParams = encodeParams({
          ...filtersToKeep,
          ...filters,
        }, this.$route.path, this.$store.state.filterLists)
        return {
          query: {
            ...nonFilterParams,
            ...filterParams,
            page: undefined,
            sort: this.query === 'colocalized' ? '-colocalization' : undefined,
          },
        }
      } else {
        return null
      }
    },
  },
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
    color: inherit;
    text-decoration: none;
  }
  .empty-message {
    @apply text-gray-600;
    text-align: center;
  }
</style>
