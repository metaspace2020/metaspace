 import { renderMolFormula } from '../util';
 import DatasetInfo from './DatasetInfo.vue';
 import { annotationQuery } from '../api/annotation';
 import { msAcqGeometryQuery, opticalImageQuery } from '../api/dataset';
 import { encodeParams } from '../url';
 import annotationWidgets from './annotation-widgets/index'

 import Vue from 'vue';
 import { Store } from 'vuex';
 import { Component, Prop } from 'vue-property-decorator';
 import { Location } from 'vue-router';

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
         let chart = JSON.parse(annotation.peakChartData);
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
       update: (data: any) => JSON.parse(data['dataset']['acquisitionGeometry'])
     }
   }
 })
 export default class AnnotationView extends Vue {
   @Prop()
   annotation: any

   msAcqGeometry: any
   peakChartData: any
   opticalImageUrl?: string
   showOpticalImage: boolean = true

   metadataDependentComponent(category: string): any {
     const currentMdType: string = this.$store.getters.filter.metadataType;
     const componentKey: string = currentMdType in metadataDependentComponents[category] ? currentMdType : 'default';
     return metadataDependentComponents[category][componentKey];
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
       simpleQuery: ''
     };
     const path = '/annotations';
     const q = encodeParams(filter, path, this.$store.state.filterLists);
     return {query: q, path};
   }

   get imageLoaderSettings(): ImageLoaderSettings {
     return Object.assign({}, this.imagePosition, {
       annotImageOpacity: (this.showOpticalImage && this.opticalImageUrl) ? this.opacity : 1.0,
       opticalSrc: this.showOpticalImage && this.opticalImageUrl != null ? this.opticalImageUrl : '',
       opticalImageUrl: this.opticalImageUrl,
       opacityMode: this.imageOpacityMode,
       showOpticalImage: this.showOpticalImage
     });
   }

   opacity: number = 1.0

   imagePosition: ImagePosition = {
     zoom: 1,
     xOffset: 0,
     yOffset: 0
   }

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
     this.showOpticalImage = !this.showOpticalImage
   }
 }
