 import { renderMolFormula } from '../../util';
 import DatasetInfo from '../../components/DatasetInfo.vue';
 import { annotationQuery } from '../../api/annotation';
 import {
  datasetVisibilityQuery,
   DatasetVisibilityResult,
  msAcqGeometryQuery,
  opticalImageQuery,
} from '../../api/dataset';
 import { encodeParams } from '../Filters/index';
 import annotationWidgets from './annotation-widgets/index'

 import Vue from 'vue';
 import { Component, Prop } from 'vue-property-decorator';
 import { Location } from 'vue-router';
 import { currentUserRoleQuery, CurrentUserRoleResult} from '../../api/user';
 import { safeJsonParse } from '../../util';
 import {omit, pick} from 'lodash-es';

 type ImagePosition = {
   zoom: number
   xOffset: number
   yOffset: number
 }

 type ImageSettings = {
   annotImageOpacity: number
   opticalSrc: string
   opacityMode: 'linear' | 'constant'
 }

 type ImageLoaderSettings = ImagePosition & ImageSettings;

 const metadataDependentComponents: any = {};
 const componentsToRegister: any = { DatasetInfo };
 for (let category of Object.keys(annotationWidgets)) {
   metadataDependentComponents[category] = {};
   for (let mdType of Object.keys(annotationWidgets[category])) {
     const component = annotationWidgets[category][mdType];
     metadataDependentComponents[category][mdType] = component;
     componentsToRegister[`${category}-${mdType}`] = component;
   }
 }

 @Component({
   name: 'annotation-view',
   components: componentsToRegister,
   apollo: {
     peakChartData: {
       query: annotationQuery,
       update: (data: any) => {
         const {annotation} = data;
         let chart = safeJsonParse(annotation.peakChartData);
         chart.sampleData = {
           mzs: annotation.isotopeImages.map((im: any) => im.mz),
           ints: annotation.isotopeImages.map((im: any) => im.totalIntensity),
         };
         return chart;
       },
       variables(this: any): any {
         return {
           id: this.annotation.id
         };
       }
     },

     opticalImageUrl: {
       query: opticalImageQuery,
       variables(this: any): any {
         return {
           datasetId: this.annotation.dataset.id,
           zoom: this.imageLoaderSettings.zoom
         }
       },
       // assumes both image server and webapp are routed via nginx
       update: (data: any) => data.opticalImageUrl
     },

     msAcqGeometry: {
       query: msAcqGeometryQuery,
       variables(this: any): any {
         return {
          datasetId: this.annotation.dataset.id
         }
       },
       update: (data: any) => safeJsonParse(data['dataset']['acquisitionGeometry'])
     },

     datasetVisibility: {
       query: datasetVisibilityQuery,
       skip: true,
       variables() {
         return {id: this.annotation.dataset.id}
       }
     },

     currentUser: {
       query: currentUserRoleQuery,
       fetchPolicy: 'cache-first',
     }
   }
 })
 export default class AnnotationView extends Vue {
   @Prop()
   annotation: any

   msAcqGeometry: any
   peakChartData: any
   opticalImageUrl?: string
   showScaleBar: boolean = true
   datasetVisibility: DatasetVisibilityResult | null = null
   currentUser: CurrentUserRoleResult | null = null

   metadataDependentComponent(category: string): any {
     const currentMdType: string = this.$store.getters.filter.metadataType;
     const componentKey: string = currentMdType in metadataDependentComponents[category] ? currentMdType : 'default';
     return metadataDependentComponents[category][componentKey];
   }

   get showOpticalImage(): boolean {
     return !this.$route.query.hideopt;
   }

   get activeSections(): string[] {
     return this.$store.getters.settings.annotationView.activeSections;
   }

   get colormap(): string {
     return this.$store.getters.settings.annotationView.colormap;
   }

   get colormapName(): string {
     return this.colormap.replace('-', '');
   }

   get formattedMolFormula(): string {
     if (!this.annotation) return '';
     const { sumFormula, adduct, dataset } = this.annotation;
     return renderMolFormula(sumFormula, adduct, dataset.polarity);
   }

   get compoundsTabLabel(): string {
     if (!this.annotation) return '';
     return "Molecules (" + this.annotation.possibleCompounds.length + ")";
   }

   get imageOpacityMode(): 'linear' | 'constant' {
     return (this.showOpticalImage && this.opticalImageUrl) ? 'linear' : 'constant';
   }

   get permalinkHref(): Location {
     const filter: any = {
       datasetIds: [this.annotation.dataset.id],
       compoundName: this.annotation.sumFormula,
       adduct: this.annotation.adduct,
       fdrLevel: this.annotation.fdrLevel,
       database: this.$store.getters.filter.database,
       simpleQuery: '',
     };
     const path = '/annotations';
     return {
       path,
       query: {
         ...encodeParams(filter, path, this.$store.state.filterLists),
         ...pick(this.$route.query, 'sections', 'sort', 'hideopt', 'cmap'),
       },
     };
   }

   get imageLoaderSettings(): ImageLoaderSettings {
     return Object.assign({}, this.imagePosition, {
       annotImageOpacity: (this.showOpticalImage && this.opticalImageUrl) ? this.opacity : 1.0,
       opticalSrc: this.showOpticalImage && this.opticalImageUrl != null ? this.opticalImageUrl : '',
       opticalImageUrl: this.opticalImageUrl,
       opacityMode: this.imageOpacityMode,
       showOpticalImage: this.showOpticalImage,
       showScaleBar: this.showScaleBar
     });
   }

   get visibilityText() {
     if (this.datasetVisibility != null && this.datasetVisibility.id === this.annotation.dataset.id) {
       const {submitter, group, projects} = this.datasetVisibility;
       const submitterName = this.currentUser && submitter.id === this.currentUser.id ? 'you' : submitter.name;
       const all = [
         submitterName,
         ...(group ? [group.name] : []),
         ...(projects || []).map(p => p.name),
       ];
       return `These annotation results are not publicly visible. They are visible to ${all.join(', ')} and METASPACE Administrators.`
     }
   }

   get metadata() {
     const datasetMetadataExternals = {
       "Submitter": this.annotation.dataset.submitter,
       "PI": this.annotation.dataset.principalInvestigator,
       "Group": this.annotation.dataset.group,
       "Projects": this.annotation.dataset.projects
     };
     return Object.assign(safeJsonParse(this.annotation.dataset.metadataJson), datasetMetadataExternals);
   }

   get pixelSizeX() {
     if (this.metadata.MS_Analysis != null &&
       this.metadata.MS_Analysis.Pixel_Size != null) {
       return this.metadata.MS_Analysis.Pixel_Size.Xaxis
     }
     return 0
   }

   get pixelSizeY() {
     if (this.metadata.MS_Analysis != null &&
       this.metadata.MS_Analysis.Pixel_Size != null) {
       return this.metadata.MS_Analysis.Pixel_Size.Yaxis
     }
     return 0
   }

   opacity: number = 1.0;

   imagePosition: ImagePosition = {
     zoom: 1,
     xOffset: 0,
     yOffset: 0
   };

   onSectionsChange(activeSections: string[]): void {
     // FIXME: this is a hack to make isotope images redraw
     // so that they pick up the changes in parent div widths
     this.$nextTick(() => {
       window.dispatchEvent(new Event('resize'));
     });

     this.$store.commit('updateAnnotationViewSections', activeSections)
   }

   onImageZoom(event: any): void {
     this.imagePosition.zoom = event.zoom;
   }

   onImageMove(event: any): void {
     this.imagePosition.xOffset = event.xOffset;
     this.imagePosition.yOffset = event.yOffset;
   }

   resetViewport(event: any): void {
     event.stopPropagation();
     this.imagePosition.xOffset = 0;
     this.imagePosition.yOffset = 0;
     this.imagePosition.zoom = 1;
   }

   toggleOpticalImage(event: any): void {
     event.stopPropagation();
     if(this.showOpticalImage) {
       this.$router.replace({
         query: {
           ...this.$route.query,
           hideopt: '1',
         }
       });
     } else {
       this.$router.replace({
         query: omit(this.$route.query, 'hideopt'),
       });
     }
   }

   toggleScaleBar(event: any): void {
     event.stopPropagation();
     this.showScaleBar = !this.showScaleBar
   }

   loadVisibility() {
     this.$apollo.queries.datasetVisibility.start();
   }
 }
