import {defineComponent, ref, computed, nextTick} from 'vue';
// @ts-ignore
import {inject} from 'vue';
import { useStore } from 'vuex';
import {RouteLocationRaw, useRoute, useRouter} from 'vue-router';
import {ElRow, ElCollapse, ElCollapseItem} from "element-plus";
import {DefaultApolloClient, useQuery} from "@vue/apollo-composable";
import CandidateMoleculesPopover from './annotation-widgets/CandidateMoleculesPopover.vue'
import MolecularFormula from '../../components/MolecularFormula'
import CopyButton from '../../components/CopyButton.vue'
import { parseFormulaAndCharge } from '../../lib/formulaParser'
import { encodeParams } from '../Filters'
import { cloneDeep, omit, pick, sortBy, throttle } from 'lodash-es'
import ShareLink from '../ImageViewer/ShareLink.vue'
import {
  datasetVisibilityQuery,
  DatasetVisibilityResult,
  msAcqGeometryQuery,
  OpticalImage,
  opticalImagesQuery,
} from '../../api/dataset'
import {reactive, defineAsyncComponent} from "vue";
import {currentUserRoleQuery} from "@/api/user";
import config from "@/lib/config";
import {ANNOTATION_SPECIFIC_FILTERS} from "@/modules/Filters/filterSpecs";
import ModeButton from '../ImageViewer/ModeButton.vue'
import annotationWidgets from './annotation-widgets/index'
import viewerState from '../ImageViewer/state'

const LockSvg = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-lock.svg')
);

const LocationPinSvg = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-location-pin.svg')
);

const metadataDependentComponents: any = {}
const componentsToRegister: any = {
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
}
for (const category of Object.keys(annotationWidgets)) {
  metadataDependentComponents[category] = {}
  for (const mdType of Object.keys(annotationWidgets[category])) {
    const component = annotationWidgets[category][mdType]
    metadataDependentComponents[category][mdType] = component
    componentsToRegister[`${category}-${mdType}`] = component
  }
}

export default defineComponent({
  name: 'AnnotationView',
  components: componentsToRegister,
  props: ['annotation'],
  setup(props) {
    const apolloClient = inject(DefaultApolloClient);
    const store = useStore();
    const route = useRoute();
    const router = useRouter();
    const scaleBarColor = ref<string | null>('#000000')


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
    const { result: opticalImagesResult } = useQuery(opticalImagesQuery, {
      datasetId: props.annotation.dataset.id,
      type: config.features.optical_transform ? 'SCALED' : 'CLIPPED_TO_ION_IMAGE',
    }, {
      fetchPolicy: 'cache-first',
    });
    const datasetVisibility = computed(() => datasetVisibilityResult.value?.datasetVisibility)
    const currentUser = computed(() => currentUserResult.value?.currentUser)
    const opticalImages = computed(() => opticalImagesResult.value?.dataset?.opticalImages || [])

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

    const metadataDependentComponent = (category: string): any => {
      const currentMdType: string = store.getters.filter.metadataType
      const componentKey: string = currentMdType in metadataDependentComponents[category] ? currentMdType : 'default'
      return metadataDependentComponents[category][componentKey]
    }

    const bestOpticalImage = computed(() : OpticalImage | null => {
      if (opticalImages.value != null && opticalImages.value.length > 0) {
        // Try to guess a zoom level that is likely to be close to 1 image pixel per display pixel
        // MainImage is ~2/3rds of the window width. Optical images are 1000 px wide * zoom level
        const targetZoom = imagePosition.value.zoom
          * Math.max(1, window.innerWidth * window.devicePixelRatio * 2 / 3 / 1000)

        // Find the best optical image, preferring images with a higher zoom level than the current zoom
        const sortedOpticalImages = sortBy(opticalImages.value, optImg =>
          optImg.zoom >= targetZoom
            ? optImg.zoom - targetZoom
            : 100 + (targetZoom - optImg.zoom))

        return sortedOpticalImages[0]
      }
      return null
    })

    const showOpticalImage = computed((): boolean => {
      return !route.query.hideopt
    })

    const imagePosition = computed(() => {
      return viewerState.imagePosition.value
    })

    const resetViewport = (event: any): void => {
      event.stopPropagation()
      imagePosition.value.xOffset = 0
      imagePosition.value.yOffset = 0
      imagePosition.value.zoom = 1
    }

    const toggleOpticalImage = (event: any): void => {
      event.stopPropagation()
      if (showOpticalImage.value) {
        router.replace({
          query: {
            ...route.query,
            hideopt: '1',
          },
        })
      } else {
        router.replace({
          query: omit(route.query, 'hideopt'),
        })
      }
    }


    const setScaleBarColor = (color: string | null) => {
      scaleBarColor.value = color
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
      filterByDataset,
      metadataDependentComponent,
      bestOpticalImage,
      showOpticalImage,
      resetViewport,
      toggleOpticalImage,
      setScaleBarColor
    };
  },
});
