<template>
  <div
    v-loading="loading"
    class="related-molecules"
  >
    <div
      v-for="other in sortedAnnotations"
      :key="other.ion"
    >
      <el-divider v-if="sortedAnnotations.length > 1">
        <div class="ion-heading">
          <component
            :is="other.ion !== annotation.ion ? 'router-link' : 'div'"
            :to="other.ion !== annotation.ion ? linkToAnnotation(other) : undefined"
            class="ion-link"
          >
            <div>
              <span v-if="other.isIsomer">Isomer:</span>
              <span v-else-if="other.isIsobar">
                Isobar
                <el-popover trigger="hover">
                  <template #reference>
                    <span>{{ renderMassShift(annotation.mz, other.mz) }}</span>
                  </template>
                  <p><molecular-formula :ion="annotation.ion" /> (Selected annotation): {{ annotation.mz.toFixed(4) }}</p>
                  <p><molecular-formula :ion="other.ion" /> (Isobar): {{ other.mz.toFixed(4) }}</p>
                  <p>Check the <b>Diagnostics</b> panel for more detail about the overlapping peaks.</p>
                </el-popover>:
              </span>
              <molecular-formula
                class="ion-formula"
                :ion="other.ion"
              />
            </div>

            <fdr-badge
              v-if="other.fdrLevel !== null && !hideFdr"
              :fdr-level="other.fdrLevel"
            />
            <msm-badge
              v-if="other.isIsobar"
              :msm-score="other.msmScore"
            />
          </component>

          <el-popover
            v-if="other.isIsomer"
            trigger="hover"
            placement="top"
          >
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
            <template #reference>
              <el-icon class="el-icon-question help-icon"><QuestionFilled /></el-icon>
            </template>
          </el-popover>

          <el-popover
            v-else-if="other.isIsobar"
            trigger="hover"
            placement="top"
          >
            <div style="max-width: 400px; width: 400px">
              <p>
                When two isobaric ions are annotated with significantly different MSM scores (>0.5),
                it is generally reasonable to assume that the lower-scoring ion is a false discovery.
              </p>
              <p>
                To help manually review cases when the MSM scores are not significantly different,
                the <b>Diagnostics</b> panel allows side-by-side comparison of isotopic ion images and spectra.
              </p>
            </div>
            <template #reference>
              <el-icon class="el-icon-question help-icon"><QuestionFilled /></el-icon>
            </template>
          </el-popover>
        </div>
      </el-divider>

      <compounds-list :compounds="other.possibleCompounds" />
    </div>

    <p
      v-if="sortedAnnotations != null && sortedAnnotations.length === 0"
      class="empty-message"
    >
      No annotations found.
    </p>
  </div>
</template>

<script>
import { defineComponent, ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import CompoundsList from './CompoundsList.vue';
import FdrBadge from './FdrBadge.vue';
import MsmBadge from './MsmBadge.vue';
import MolecularFormula from '../../../components/MolecularFormula';
import { renderMassShift } from '../../../lib/util';
import { relatedMoleculesQuery } from '../../../api/annotation';
import config from '../../../lib/config';
import {QuestionFilled} from "@element-plus/icons-vue";
import {useQuery} from "@vue/apollo-composable";
import {omit, sortBy, uniqBy} from "lodash-es";
import {encodeParams, stripFilteringParams} from "../../../modules/Filters";
import {ANNOTATION_SPECIFIC_FILTERS} from "../../../modules/Filters/filterSpecs";
import {ElDivider, ElLoading} from "element-plus";

export default defineComponent({
  components: {
    CompoundsList,
    FdrBadge,
    MsmBadge,
    MolecularFormula,
    QuestionFilled,
    ElDivider,
  },
  directives: {
    'loading': ElLoading.directive,
  },
  props: {
    annotation: { type: Object, required: true },
    annotations: { type: Array, required: false },
    databaseId: { type: Number, required: true },
    hideFdr: { type: Boolean, default: false },
  },
  setup(props) {
    const store = useStore();
    const route = useRoute();
    const loading = ref(false);

    const { result: isomerAnnotationsResult, loading: isomerLoading } = useQuery(
      relatedMoleculesQuery,
      () => ({
        datasetId: props.annotation.dataset.id,
        filter: { databaseId: props.databaseId, ionFormula: props.annotation.ionFormula },
        orderBy: 'ORDER_BY_FDR_MSM',
        sortingOrder: 'ASCENDING',
      }),
      { enabled: config.features.isomers }
    );
    const isomerAnnotations = computed(() => !config.features.isomers ? [] : isomerAnnotationsResult.value?.allAnnotations)
    const { result: isobarAnnotationsResult, loading: isobarLoading } = useQuery(
      relatedMoleculesQuery,
      () => ({
        datasetId: props.annotation.dataset.id,
        filter: { databaseId: props.databaseId, isobaricWith: props.annotation.ionFormula },
        orderBy: 'ORDER_BY_FDR_MSM',
        sortingOrder: 'ASCENDING',
      }),
      { enabled: config.features.isobars }
    );
    const isobarAnnotations = computed(() => !config.features.isobars ? [] : isobarAnnotationsResult.value?.allAnnotations)


    watch([isomerLoading, isobarLoading], ([isomerLoad, isobarLoad]) => {
      loading.value = isomerLoad || isobarLoad;
    });

    const sortedAnnotations = computed(() => {
      const isomers = isomerAnnotations.value || [];
      const isobars = isobarAnnotations.value || [];
      let annotations = props.annotations ? [
        ...props.annotations,
        ...isomers.map(ann => ({ ...ann, isIsomer: true })),
        ...isobars.map(ann => ({ ...ann, isIsobar: true })),
      ] : [
        props.annotation,
        ...isomers.map(ann => ({ ...ann, isIsomer: true })),
        ...isobars.map(ann => ({ ...ann, isIsobar: true })),
      ];
      // Sort order: reference annotation first, then best by FDR, then best by MSM
      // (consistent with the default sort in AnnotationsTable and RelatedMolecules)
      annotations = uniqBy(annotations, a => a.ion);
      annotations = sortBy(annotations,
        a => a.ion === props.annotation.ion ? 0 : 1,
        a => a.fdrLevel,
        a => -a.msmScore,
      );
      return annotations;
    });

    const linkToAnnotation = (other) => {
      const filters = {
        datasetIds: props.annotations ? props.annotations.map((annotation) => annotation.dataset.id)
          : [props.annotation.dataset.id],
        compoundName: other.sumFormula,
        chemMod: other.chemMod,
        neutralLoss: other.neutralLoss,
        adduct: other.adduct,
        fdrLevel: Math.max(other.fdrLevel, store.getters.filter.fdrLevel || 0),
      }

      // Make a best effort to remove existing filters that might prevent showing the linked annotation, while
      // keeping the rest. e.g. keep expanded sections and selected FDR, but remove page and m/z
      const nonFilterParams = stripFilteringParams(route.query)
      const filtersToKeep = omit(store.getters.filter, ANNOTATION_SPECIFIC_FILTERS)
      const filterParams = encodeParams({
        ...filtersToKeep,
        ...filters,
      }, route.path, store.state.filterLists)
      return {
        query: {
          ...nonFilterParams,
          ...filterParams,
          page: undefined,
          sort: undefined,
        },
      }
    };

    return {
      loading,
      sortedAnnotations,
      linkToAnnotation,
      renderMassShift,
    };
  },
});
</script>

<style scoped lang="scss">
  @import "element-plus/theme-chalk/src/mixins/mixins";

  .ion-heading {
    display: flex;
    align-items: center;
  }
  .ion-link, a.ion-link:link {
    display: flex;
    align-items: center;
    text-decoration: none;
    white-space: nowrap;
    font-size: 1.2em;
    color: inherit;

    .ion-formula {
      font-weight: bold;
    }
    .mass-shift {
      font-weight: bold;
    }
  }
  .help-icon {
    font-size: 16px;
    color: inherit;
  }
</style>
