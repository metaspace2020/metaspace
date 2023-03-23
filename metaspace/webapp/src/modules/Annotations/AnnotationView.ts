import DatasetInfo from '../../components/DatasetInfo.vue'
import ColocalizationSettings from './annotation-widgets/ColocalizationSettings.vue'
import {
  datasetVisibilityQuery,
  DatasetVisibilityResult,
  msAcqGeometryQuery,
  OpticalImage,
  opticalImagesQuery,
} from '../../api/dataset'
import annotationWidgets from './annotation-widgets/index'

import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { Location } from 'vue-router'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import safeJsonParse from '../../lib/safeJsonParse'
import { cloneDeep, omit, pick, sortBy, throttle } from 'lodash-es'
import { ANNOTATION_SPECIFIC_FILTERS } from '../Filters/filterSpecs'
import { encodeParams } from '../Filters'
import config from '../../lib/config'
import { OpacityMode } from '../../lib/createColormap'
import CandidateMoleculesPopover from './annotation-widgets/CandidateMoleculesPopover.vue'
import RelatedMolecules from './annotation-widgets/RelatedMolecules.vue'
import CompoundsList from './annotation-widgets/CompoundsList.vue'
import AmbiguityAlert from './annotation-widgets/AmbiguityAlert.vue'
import ModeButton from '../ImageViewer/ModeButton.vue'
import ShareLink from '../ImageViewer/ShareLink.vue'
import CopyButton from '../../components/CopyButton.vue'
import MolecularFormula from '../../components/MolecularFormula'

import StatefulIcon from '../../components/StatefulIcon.vue'
import LockSvg from '../../assets/inline/refactoring-ui/icon-lock.svg'
import LocationPinSvg from '../../assets/inline/refactoring-ui/icon-location-pin.svg'
import FilterIcon from '../../assets/inline/filter.svg'

import { ImageSettings, useIonImageSettings } from '../ImageViewer/ionImageState'
import viewerState from '../ImageViewer/state'
import { parseFormulaAndCharge } from '../../lib/formulaParser'

const { settings: ionImageSettings } = useIonImageSettings()

const metadataDependentComponents: any = {}
const componentsToRegister: any = {
  DatasetInfo,
  ColocalizationSettings,
  CandidateMoleculesPopover,
  RelatedMolecules,
  CompoundsList,
  AmbiguityAlert,
  ModeButton,
  ShareLink,
  StatefulIcon,
  LockSvg,
  LocationPinSvg,
  FilterIcon,
  CopyButton,
  MolecularFormula,
}
for (const category of Object.keys(annotationWidgets)) {
  metadataDependentComponents[category] = {}
  for (const mdType of Object.keys(annotationWidgets[category])) {
    const component = annotationWidgets[category][mdType]
    metadataDependentComponents[category][mdType] = component
    componentsToRegister[`${category}-${mdType}`] = component
  }
}

 @Component<AnnotationView>({
   name: 'annotation-view',
   components: componentsToRegister,
   apollo: {
     opticalImages: {
       query: opticalImagesQuery,
       variables() {
         return {
           datasetId: this.annotation.dataset.id,
           type: config.features.optical_transform ? 'SCALED' : 'CLIPPED_TO_ION_IMAGE',
         }
       },
       update(data: any) {
         return data.dataset && data.dataset.opticalImages || []
       },
     },

     msAcqGeometry: {
       query: msAcqGeometryQuery,
       variables(): any {
         return {
           datasetId: this.annotation.dataset.id,
         }
       },
       update: (data: any) => data.dataset && safeJsonParse(data.dataset.acquisitionGeometry),
     },

     datasetVisibility: {
       query: datasetVisibilityQuery,
       skip: true,
       variables() {
         return { id: this.annotation.dataset.id }
       },
     },

     currentUser: {
       query: currentUserRoleQuery,
       fetchPolicy: 'cache-first',
     },
   },
 })
export default class AnnotationView extends Vue {
   @Prop()
   annotation: any

   @Prop()
   normalization: any

   msAcqGeometry: any
   opticalImages!: OpticalImage[] | null
   datasetVisibility: DatasetVisibilityResult | null = null
   currentUser: CurrentUserRoleResult | null = null
   scaleBarColor: string | null = '#000000'

   created() {
     this.onImageMove = throttle(this.onImageMove)
   }

   metadataDependentComponent(category: string): any {
     const currentMdType: string = this.$store.getters.filter.metadataType
     const componentKey: string = currentMdType in metadataDependentComponents[category] ? currentMdType : 'default'
     return metadataDependentComponents[category][componentKey]
   }

   getParsedFormula(ion: string) : string {
     return parseFormulaAndCharge(ion)
   }

   get showOpticalImage(): boolean {
     return !this.$route.query.hideopt
   }

   get activeSections(): string[] {
     return this.$store.getters.settings.annotationView.activeSections
   }

   get colormap(): string {
     return this.$store.getters.settings.annotationView.colormap
   }

   get scaleType(): string {
     return this.$store.getters.settings.annotationView.scaleType
   }

   get ticData(): string {
     return this.$store.getters.settings.annotationView.normalization
   }

   get roiInfo(): any {
     if (
       this.annotation && this.annotation.dataset?.id && this.$store.state.roiInfo
       && Object.keys(this.$store.state.roiInfo).includes(this.annotation.dataset.id)) {
       return this.$store.state.roiInfo[this.annotation.dataset.id] || []
     }
     return []
   }

   get imageOpacityMode(): OpacityMode {
     return (this.showOpticalImage && this.bestOpticalImage != null) ? 'linear' : 'constant'
   }

   get permalinkHref(): Location {
     const path = '/annotations'
     const filter: any = {
       datasetIds: [this.annotation.dataset.id],
       compoundName: this.annotation.sumFormula,
       adduct: this.annotation.adduct,
       fdrLevel: this.annotation.fdrLevel,
       database: this.$store.getters.filter.database,
       simpleQuery: '',
     }
     return {
       path,
       query: {
         ...encodeParams(filter, path, this.$store.state.filterLists),
         ...pick(this.$route.query, 'sections', 'sort', 'hideopt', 'cmap', 'scale', 'norm', 'feat'),
         cols: this.$route.query.cols,
       },
     }
   }

   get bestOpticalImage(): OpticalImage | null {
     if (this.opticalImages != null && this.opticalImages.length > 0) {
       // Try to guess a zoom level that is likely to be close to 1 image pixel per display pixel
       // MainImage is ~2/3rds of the window width. Optical images are 1000 px wide * zoom level
       const targetZoom = this.imagePosition.zoom
         * Math.max(1, window.innerWidth * window.devicePixelRatio * 2 / 3 / 1000)

       // Find the best optical image, preferring images with a higher zoom level than the current zoom
       const sortedOpticalImages = sortBy(this.opticalImages, optImg =>
         optImg.zoom >= targetZoom
           ? optImg.zoom - targetZoom
           : 100 + (targetZoom - optImg.zoom))

       return sortedOpticalImages[0]
     }
     return null
   }

   get imageLoaderSettings(): ImageSettings {
     const optImg = this.bestOpticalImage
     const hasOpticalImages = this.showOpticalImage && optImg != null

     return {
       annotImageOpacity: (this.showOpticalImage && hasOpticalImages) ? this.opacity : 1.0,
       opticalOpacity: this.showOpticalImage ? this.opticalOpacity : 1.0,
       opacityMode: this.imageOpacityMode,
       imagePosition: this.imagePosition,
       opticalSrc: this.showOpticalImage && optImg && optImg.url || null,
       opticalTransform: optImg && optImg.transform,
       pixelAspectRatio: config.features.ignore_pixel_aspect_ratio ? 1
         : this.pixelSizeX && this.pixelSizeY && this.pixelSizeX / this.pixelSizeY || 1,
     }
   }

   get visibilityText() {
     if (this.datasetVisibility != null && this.datasetVisibility.id === this.annotation.dataset.id) {
       const { submitter, group, projects } = this.datasetVisibility
       const submitterName = this.currentUser && submitter.id === this.currentUser.id ? 'you' : submitter.name
       const all = [
         submitterName,
         ...(group ? [group.name] : []),
         ...(projects || []).map(p => p.name),
       ]
       return ('These annotation results are not publicly visible. '
         + `They are visible to ${all.join(', ')} and METASPACE Administrators.`)
     }
   }

   get metadata() {
     const datasetMetadataExternals = {
       Submitter: this.annotation.dataset.submitter,
       PI: this.annotation.dataset.principalInvestigator,
       Group: this.annotation.dataset.group,
       Projects: this.annotation.dataset.projects,
     }
     return Object.assign(safeJsonParse(this.annotation.dataset.metadataJson), datasetMetadataExternals)
   }

   get additionalSettings() {
     try {
       const configJson = JSON.parse(this.annotation.dataset.configJson)
       return configJson
     } catch (e) {
       return {}
     }
   }

   get pixelSizeX() {
     if (this.metadata.MS_Analysis != null
       && this.metadata.MS_Analysis.Pixel_Size != null) {
       return this.metadata.MS_Analysis.Pixel_Size.Xaxis
     }
     return 0
   }

   get pixelSizeY() {
     if (this.metadata.MS_Analysis != null
       && this.metadata.MS_Analysis.Pixel_Size != null) {
       return this.metadata.MS_Analysis.Pixel_Size.Yaxis
     }
     return 0
   }

   get showColoc() {
     return config.features.coloc
   }

   get multiImagesEnabled() {
     return config.features.multiple_ion_images
   }

   get opacity() {
     return ionImageSettings.opacity
   }

   set opacity(value: number) {
     ionImageSettings.opacity = value
   }

   get opticalOpacity() {
     return ionImageSettings.opticalOpacity
   }

   set opticalOpacity(value: number) {
     ionImageSettings.opticalOpacity = value
   }

   get imagePosition() {
     return viewerState.imagePosition.value
   }

   onSectionsChange(activeSections: string[]): void {
     // FIXME: this is a hack to make isotope images redraw
     // so that they pick up the changes in parent div widths
     this.$nextTick(() => {
       window.dispatchEvent(new Event('resize'))
     })

     this.$store.commit('updateAnnotationViewSections', activeSections)
   }

   onImageMove(event: any): void {
     this.imagePosition.zoom = event.zoom
     this.imagePosition.xOffset = event.xOffset
     this.imagePosition.yOffset = event.yOffset
   }

   resetViewport(event: any): void {
     event.stopPropagation()
     this.imagePosition.xOffset = 0
     this.imagePosition.yOffset = 0
     this.imagePosition.zoom = 1
   }

   toggleOpticalImage(event: any): void {
     event.stopPropagation()
     if (this.showOpticalImage) {
       this.$router.replace({
         query: {
           ...this.$route.query,
           hideopt: '1',
         },
       })
     } else {
       this.$router.replace({
         query: omit(this.$route.query, 'hideopt'),
       })
     }
   }

   loadVisibility() {
     this.$apollo.queries.datasetVisibility.start()
   }

   setScaleBarColor(color: string | null) {
     this.scaleBarColor = color
   }

   addRoiCoordinate(roiPoint: any) {
     const RADIUS = 2
     const isInsideCircle = (x: number, y: number, centerX: number, centerY: number, radius: number) => {
       return (x - centerX) ** 2 + (y - centerY) ** 2 < radius ** 2
     }

     const roi = this.roiInfo || []
     const roiIndex = roi.length - 1
     const coordinates : any[] = roi[roiIndex].coordinates
     let isRepeatedPoint : boolean = false

     if (roiPoint.isFixed) { // fixed draw point
       if (coordinates.length === 0) {
         coordinates.push(roiPoint)
       } else {
         if (roiPoint.x === coordinates[coordinates.length - 1].x
         && roiPoint.y === coordinates[coordinates.length - 1].y && coordinates[coordinates.length - 1].isFixed) {
           isRepeatedPoint = true
         }
         coordinates[coordinates.length - 1] = roiPoint
       }
       Vue.set(roi, roiIndex, { ...roi[roiIndex], coordinates })

       coordinates.forEach((coordinate: any, index: number) => {
         // stop ROI creation if line reach polygon draw point
         if (
           (index !== coordinates.length - 1 || isRepeatedPoint)
           && isInsideCircle(roiPoint.x, roiPoint.y, coordinate.x, coordinate.y, RADIUS)) {
           coordinates[coordinates.length - 1].isEndPoint = true
           Vue.set(roi, roiIndex, { ...roi[roiIndex], isDrawing: false })
         }
       })
     } else if (coordinates.length > 0) { // coordinates do adjust polygon line
       if (coordinates[coordinates.length - 1].isFixed) {
         coordinates.push(roiPoint)
       } else {
         coordinates[coordinates.length - 1] = roiPoint
       }
       Vue.set(roi, roiIndex, { ...roi[roiIndex], coordinates })
     }

     this.$store.commit('setRoiInfo', { key: this.annotation.dataset.id, roi })
   }

   filterColocSamples() {
     this.$store.commit('updateFilter', {
       ...omit(this.$store.getters.filter, ANNOTATION_SPECIFIC_FILTERS),
       datasetIds: [this.annotation.dataset.id],
       colocalizationSamples: true,
     })
   }

   filterColocalized() {
     this.$store.commit('updateFilter', {
       ...omit(this.$store.getters.filter, ANNOTATION_SPECIFIC_FILTERS),
       datasetIds: [this.annotation.dataset.id],
       colocalizedWith: this.annotation.ion,
     })
     this.$store.commit('setSortOrder', {
       by: 'colocalization',
       dir: 'descending',
     })
   }

   filterByDataset() {
     const { datasetIds } = this.$store.getters.filter
     if (datasetIds && datasetIds.length === 1) {
       return
     }
     this.$store.commit('updateFilter', {
       ...omit(this.$store.getters.filter, ANNOTATION_SPECIFIC_FILTERS),
       datasetIds: [this.annotation.dataset.id],
     })
   }
}
