import { defineComponent, ref, computed, nextTick } from 'vue'
import { useStore } from 'vuex'
import { RouteLocationRaw, useRoute, useRouter } from 'vue-router'
// @ts-ignore
import { ElRow, ElCollapse, ElCollapseItem } from '../../lib/element-plus'
import { useQuery } from '@vue/apollo-composable'
import CandidateMoleculesPopover from './annotation-widgets/CandidateMoleculesPopover.vue'
import AmbiguityAlert from './annotation-widgets/AmbiguityAlert.vue'
import RelatedMolecules from './annotation-widgets/RelatedMolecules.vue'
import MolecularFormula from '../../components/MolecularFormula'
import CopyButton from '../../components/CopyButton.vue'
import { parseFormulaAndCharge } from '../../lib/formulaParser'
import { encodeParams } from '../Filters'
import { omit, pick, sortBy } from 'lodash-es'
import ShareLink from '../ImageViewer/ShareLink.vue'
import { datasetVisibilityQuery, msAcqGeometryQuery, OpticalImage, opticalImagesQuery } from '../../api/dataset'
import { reactive, defineAsyncComponent } from 'vue'
import { currentUserRoleQuery } from '../../api/user'
import config from '../../lib/config'
import { ANNOTATION_SPECIFIC_FILTERS } from '../../modules/Filters/filterSpecs'
import ModeButton from '../ImageViewer/ModeButton.vue'
import annotationWidgets from './annotation-widgets/index'
import viewerState from '../ImageViewer/state'
import { ImageSettings, useIonImageSettings } from '../ImageViewer/ionImageState'
import { OpacityMode } from '../../lib/createColormap'
import safeJsonParse from '../../lib/safeJsonParse'
import OpacitySettings from '../ImageViewer/OpacitySettings.vue'
import { ElIcon } from '../../lib/element-plus'
import { Setting } from '@element-plus/icons-vue'
import ColocalizationSettings from './annotation-widgets/ColocalizationSettings.vue'
import DatasetInfo from '../../components/DatasetInfo.vue'
import StatefulIcon from '../../components/StatefulIcon.vue'

const LockSvg = defineAsyncComponent(() => import('../../assets/inline/refactoring-ui/icon-lock.svg'))

const LocationPinSvg = defineAsyncComponent(() => import('../../assets/inline/refactoring-ui/icon-location-pin.svg'))

const FilterIcon = defineAsyncComponent(() => import('../../assets/inline/filter.svg'))

const { settings: ionImageSettings } = useIonImageSettings()

const metadataDependentComponents: any = {}
const componentsToRegister: any = {
  ElRow,
  ElCollapse,
  ColocalizationSettings,
  CandidateMoleculesPopover,
  MolecularFormula,
  CopyButton,
  ShareLink,
  LockSvg,
  LocationPinSvg,
  ModeButton,
  ElCollapseItem,
  OpacitySettings,
  AmbiguityAlert,
  RelatedMolecules,
  ElIcon,
  Setting,
  FilterIcon,
  DatasetInfo,
  StatefulIcon,
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
  props: ['annotation', 'normalization'],
  setup(props) {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    const scaleBarColor = ref<string | null>('#000000')

    const queryOptions = reactive({ enabled: false })
    const { result: datasetVisibilityResult } = useQuery(
      datasetVisibilityQuery,
      { id: props.annotation.dataset.id },
      () => {
        return {
          enabled: queryOptions.enabled,
          fetchPolicy: 'cache-first',
        }
      }
    )
    const { result: currentUserResult } = useQuery(
      currentUserRoleQuery,
      { id: props.annotation.dataset.id },
      {
        fetchPolicy: 'cache-first',
      }
    )
    const { result: opticalImagesResult } = useQuery(
      opticalImagesQuery,
      {
        datasetId: props.annotation.dataset.id,
        type: config.features.optical_transform ? 'SCALED' : 'CLIPPED_TO_ION_IMAGE',
      },
      {
        fetchPolicy: 'cache-first',
      }
    )
    const { result: msAcqGeometryResult } = useQuery(
      msAcqGeometryQuery,
      {
        datasetId: props.annotation.dataset.id,
      },
      {
        fetchPolicy: 'cache-first',
      }
    )
    const datasetVisibility = computed(() => datasetVisibilityResult.value?.datasetVisibility)
    const currentUser = computed(() => currentUserResult.value?.currentUser)
    const opticalImages = computed(() => opticalImagesResult.value?.dataset?.opticalImages || [])
    const msAcqGeometry = computed(() => safeJsonParse(msAcqGeometryResult.value?.dataset.acquisitionGeometry))

    const activeSections = computed((): string[] => {
      return store.getters.settings.annotationView.activeSections
    })

    const onSectionsChange = async (activeSections: string[]): Promise<void> => {
      // Capture the current scroll position
      const originalScrollTop = window.pageYOffset || document.documentElement.scrollTop
      const originalOverflow = document.body.style.overflow

      // Lock the scroll
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.top = `-${originalScrollTop}px`

      // FIXME: this is a hack to make isotope images redraw
      // so that they pick up the changes in parent div widths
      await nextTick()
      window.dispatchEvent(new Event('resize'))
      store.commit('updateAnnotationViewSections', activeSections)

      // Restore the scroll position
      setTimeout(() => {
        // Unlock the scroll
        document.body.style.overflow = originalOverflow
        document.body.style.position = ''
        document.body.style.top = ''

        // Restore the original scroll position
        window.scrollTo(0, originalScrollTop)
      }, 0)
    }

    const getParsedFormula = (ion: string): string => {
      return parseFormulaAndCharge(ion)
    }

    const permalinkHref = computed((): RouteLocationRaw => {
      const path = '/annotations'
      const filter: any = {
        ...store.getters.filter,
        datasetIds: [props.annotation.dataset.id],
      }
      return {
        path,
        query: {
          ...encodeParams(filter, path, store.state.filterLists),
          ...pick(route.query, 'sections', 'sort', 'hideopt', 'cmap', 'scale', 'norm', 'feat', 'cols', 'fdr'),
        },
      }
    })

    const loadVisibility = () => {
      queryOptions.enabled = true
    }

    const visibilityText = computed(() => {
      if (datasetVisibility.value != null && datasetVisibility.value?.id === props.annotation.dataset.id) {
        const { submitter, group, projects } = datasetVisibility.value
        const submitterName = currentUser.value && submitter.id === currentUser.value.id ? 'you' : submitter.name
        const all = [submitterName, ...(group ? [group.name] : []), ...(projects || []).map((p) => p.name)]
        return (
          'These annotation results are not publicly visible. ' +
          `They are visible to ${all.join(', ')} and METASPACE Administrators.`
        )
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

    const filterColocalized = () => {
      store.commit('updateFilter', {
        ...omit(store.getters.filter, ANNOTATION_SPECIFIC_FILTERS),
        datasetIds: [props.annotation.dataset.id],
        colocalizedWith: props.annotation.ion,
      })
      store.commit('setSortOrder', {
        by: 'colocalization',
        dir: 'descending',
      })
    }

    const metadataDependentComponent = (category: string): any => {
      const currentMdType: string = store.getters.filter.metadataType
      const componentKey: string = currentMdType in metadataDependentComponents[category] ? currentMdType : 'default'
      return metadataDependentComponents[category][componentKey]
    }

    const bestOpticalImage = computed((): OpticalImage | null => {
      if (opticalImages.value != null && opticalImages.value.length > 0) {
        // Try to guess a zoom level that is likely to be close to 1 image pixel per display pixel
        // MainImage is ~2/3rds of the window width. Optical images are 1000 px wide * zoom level
        const targetZoom =
          imagePosition.value.zoom * Math.max(1, (window.innerWidth * window.devicePixelRatio * 2) / 3 / 1000)

        // Find the best optical image, preferring images with a higher zoom level than the current zoom
        const sortedOpticalImages = sortBy(opticalImages.value, (optImg) =>
          optImg.zoom >= targetZoom ? optImg.zoom - targetZoom : 100 + (targetZoom - optImg.zoom)
        )

        return sortedOpticalImages[0]
      }
      return null
    })

    const showOpticalImage = computed((): boolean => {
      return !route.query.hideopt
    })

    const imagePosition = computed(() => viewerState.imagePosition.value)

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

    const colormap = computed(() => store.getters.settings.annotationView.colormap)
    const opacity = computed(() => ionImageSettings.opacity)
    const opticalOpacity = computed(() => ionImageSettings.opticalOpacity)
    const imageOpacityMode = computed((): OpacityMode => {
      return showOpticalImage.value && bestOpticalImage.value != null ? 'linear' : 'constant'
    })

    const metadata = computed(() => {
      const datasetMetadataExternals = {
        Submitter: props.annotation.dataset.submitter,
        PI: props.annotation.dataset.principalInvestigator,
        Group: props.annotation.dataset.group,
        Projects: props.annotation.dataset.projects,
      }
      return Object.assign(safeJsonParse(props.annotation.dataset.metadataJson), datasetMetadataExternals)
    })

    const additionalSettings = computed(() => {
      try {
        const configJson = JSON.parse(props.annotation.dataset.configJson)
        return configJson
      } catch (e) {
        return {}
      }
    })

    const pixelSizeX = computed(() => {
      if (metadata.value.MS_Analysis != null && metadata.value.MS_Analysis.Pixel_Size != null) {
        return metadata.value.MS_Analysis.Pixel_Size.Xaxis
      }
      return 0
    })

    const pixelSizeY = computed(() => {
      if (metadata.value.MS_Analysis != null && metadata.value.MS_Analysis.Pixel_Size != null) {
        return metadata.value.MS_Analysis.Pixel_Size.Yaxis
      }
      return 0
    })

    const onImageMove = (event: any): void => {
      imagePosition.value.zoom = event.zoom
      imagePosition.value.xOffset = event.xOffset
      imagePosition.value.yOffset = event.yOffset
    }

    const imageLoaderSettings = computed((): ImageSettings => {
      const optImg = bestOpticalImage.value
      const hasOpticalImages = showOpticalImage.value && optImg != null

      return {
        annotImageOpacity: showOpticalImage.value && hasOpticalImages ? opacity.value : 1.0,
        opticalOpacity: showOpticalImage.value ? opticalOpacity.value : 1.0,
        opacityMode: imageOpacityMode.value,
        imagePosition: imagePosition.value,
        opticalSrc: (showOpticalImage.value && optImg && optImg.url) || null,
        opticalTransform: optImg && optImg.transform,
        pixelAspectRatio: config.features.ignore_pixel_aspect_ratio
          ? 1
          : (pixelSizeX.value && pixelSizeY.value && pixelSizeX.value / pixelSizeY.value) || 1,
      }
    })

    const scaleType = computed((): string => store.getters.settings.annotationView.scaleType)
    const ticData = computed((): string => store.getters.settings.annotationView.normalization)

    const handleOpacityChange = (value: number) => {
      ionImageSettings.opacity = value
    }

    const handleOpticalOpacityChange = (value: number) => {
      ionImageSettings.opticalOpacity = value
    }

    const roiInfo = computed((): any => {
      if (
        props.annotation &&
        props.annotation.dataset?.id &&
        store.state.roiInfo &&
        Object.keys(store.state.roiInfo).includes(props.annotation.dataset.id)
      ) {
        return store.state.roiInfo[props.annotation.dataset.id] || []
      }
      return []
    })

    const addRoiCoordinate = (roiPoint: any) => {
      const RADIUS = 2
      const isInsideCircle = (x: number, y: number, centerX: number, centerY: number, radius: number) => {
        return (x - centerX) ** 2 + (y - centerY) ** 2 < radius ** 2
      }

      const roi = roiInfo.value || []
      const roiIndex = roi.length - 1
      const coordinates: any[] = roi[roiIndex].coordinates
      let isRepeatedPoint: boolean = false

      if (roiPoint.isFixed) {
        if (coordinates.length === 0) {
          coordinates.push(roiPoint)
        } else {
          if (
            roiPoint.x === coordinates[coordinates.length - 1].x &&
            roiPoint.y === coordinates[coordinates.length - 1].y &&
            coordinates[coordinates.length - 1].isFixed
          ) {
            isRepeatedPoint = true
          }
          coordinates[coordinates.length - 1] = roiPoint
        }
        roi[roiIndex] = { ...roi[roiIndex], coordinates }

        coordinates.forEach((coordinate: any, index: number) => {
          if (
            (index !== coordinates.length - 1 || isRepeatedPoint) &&
            isInsideCircle(roiPoint.x, roiPoint.y, coordinate.x, coordinate.y, RADIUS)
          ) {
            coordinates[coordinates.length - 1].isEndPoint = true
            roi[roiIndex] = { ...roi[roiIndex], isDrawing: false }
          }
        })
      } else if (coordinates.length > 0) {
        if (coordinates[coordinates.length - 1].isFixed) {
          coordinates.push(roiPoint)
        } else {
          coordinates[coordinates.length - 1] = roiPoint
        }
        roi[roiIndex] = { ...roi[roiIndex], coordinates }
      }

      store.commit('setRoiInfo', { key: props.annotation.dataset.id, roi })
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
      setScaleBarColor,
      colormap,
      opacity,
      opticalOpacity,
      imagePosition,
      imageLoaderSettings,
      onImageMove,
      msAcqGeometry,
      pixelSizeX,
      pixelSizeY,
      scaleBarColor,
      scaleType,
      ticData,
      handleOpacityChange,
      handleOpticalOpacityChange,
      addRoiCoordinate,
      store,
      filterColocalized,
      metadata,
      additionalSettings,
      currentUser,
    }
  },
})
