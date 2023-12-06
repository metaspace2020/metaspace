import {defineComponent, ref, computed, nextTick} from 'vue';
// @ts-ignore
import {inject} from 'vue';
import { useStore } from 'vuex';
import {RouteLocationRaw, useRoute} from 'vue-router';
import {ElRow, ElCollapse, ElCollapseItem} from "element-plus";
import {DefaultApolloClient, useQuery} from "@vue/apollo-composable";
import CandidateMoleculesPopover from './annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../components/MolecularFormula'
import CopyButton from '../../components/CopyButton.vue'
import { parseFormulaAndCharge } from '../../lib/formulaParser'
import { encodeParams } from '../Filters'
import { cloneDeep, omit, pick, sortBy, throttle } from 'lodash-es'
import ShareLink from '../ImageViewer/ShareLink.vue'
import {datasetVisibilityQuery} from "@/api/dataset";
import {reactive, defineAsyncComponent} from "vue";
import {currentUserRoleQuery} from "@/api/user";
import config from "@/lib/config";
import {ANNOTATION_SPECIFIC_FILTERS} from "@/modules/Filters/filterSpecs";
import ModeButton from '../ImageViewer/ModeButton.vue'

const LockSvg = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-lock.svg')
);

const LocationPinSvg = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-location-pin.svg')
);

export default defineComponent({
  name: 'AnnotationView',
  components: {
    ElRow,
    ElCollapse,
    CandidateMoleculesPopover,
    MolecularFormula,
    CopyButton,
    ShareLink,
    LockSvg,
    LocationPinSvg,
    ModeButton,
    ElCollapseItem,
  },
  props: ['annotation'],
  setup(props) {
    const apolloClient = inject(DefaultApolloClient);
    const store = useStore();
    const route = useRoute();

    const queryOptions = reactive({ enabled: false })
    const { result: datasetVisibilityResult } = useQuery(datasetVisibilityQuery, { id: props.annotation.dataset.id }, () => {
      return {
        enabled: queryOptions.enabled,
        fetchPolicy: 'cache-first',
      }
    });
    const { result: currentUserResult } = useQuery(currentUserRoleQuery, { id: props.annotation.dataset.id }, {
      fetchPolicy: 'cache-first',
    });
    const datasetVisibility = computed(() => datasetVisibilityResult.value?.datasetVisibility)
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const activeSections = computed(() : string[] =>  {
      return store.getters.settings.annotationView.activeSections
    })

    const onSectionsChange = async (activeSections: string[]): Promise<void> => {
      // FIXME: this is a hack to make isotope images redraw
      // so that they pick up the changes in parent div widths
      await nextTick()
      window.dispatchEvent(new Event('resize'))
      store.commit('updateAnnotationViewSections', activeSections)
    }

    const getParsedFormula = (ion: string) : string  => {
      return parseFormulaAndCharge(ion)
    }

    const permalinkHref = computed((): RouteLocationRaw => {
      const path = '/annotations'
      const filter: any = {
        datasetIds: [props.annotation.dataset.id],
        compoundName: props.annotation.sumFormula,
        adduct: props.annotation.adduct,
        fdrLevel: props.annotation.fdrLevel,
        database: store.getters.filter.database,
        simpleQuery: '',
      }
      return {
        path,
        query: {
          ...encodeParams(filter, path, store.state.filterLists),
          ...pick(route.query, 'sections', 'sort', 'hideopt', 'cmap', 'scale', 'norm', 'feat'),
          cols: route.query.cols,
        },
      }
    })

    const loadVisibility = () => {
      queryOptions.enabled = true
    }

    const visibilityText = computed(() => {
      console.log('datasetVisibility.value', datasetVisibility.value)
      if (datasetVisibility.value != null && datasetVisibility.value?.id === props.annotation.dataset.id) {
        const { submitter, group, projects } = datasetVisibility.value
        const submitterName = currentUser.value && submitter.id === currentUser.value.id ? 'you' : submitter.name
        const all = [
          submitterName,
          ...(group ? [group.name] : []),
          ...(projects || []).map(p => p.name),
        ]
        return ('These annotation results are not publicly visible. '
          + `They are visible to ${all.join(', ')} and METASPACE Administrators.`)
      }
      return null
    })

    const showColoc = computed(() => config.features.coloc)
    const multiImagesEnabled = computed(() => config.features.multiple_ion_images)
    const filterColocSamples = () => {
      store.commit('updateFilter', {
        ...omit(store.getters.filter, ANNOTATION_SPECIFIC_FILTERS),
        datasetIds: [props.annotation.dataset.id],
        colocalizationSamples: true,
      })
    }
    const filterByDataset = () => {
      const { datasetIds } = store.getters.filter
      if (datasetIds && datasetIds.length === 1) {
        return
      }
      store.commit('updateFilter', {
        ...omit(store.getters.filter, ANNOTATION_SPECIFIC_FILTERS),
        datasetIds: [props.annotation.dataset.id],
      })
    }

    return {
      activeSections,
      onSectionsChange,
      getParsedFormula,
      permalinkHref,
      loadVisibility,
      visibilityText,
      showColoc,
      filterColocSamples,
      multiImagesEnabled,
      filterByDataset
    };
  },
});
