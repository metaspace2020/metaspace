 import { renderMolFormula } from '../util';
 import DatasetInfo from './DatasetInfo.vue';
 import AdductsInfo from './AdductsInfo.vue';
 import ImageLoader from './ImageLoader.vue';
 import IonImageSettings from './IonImageSettings.vue';
 import IsotopePatternPlot from './IsotopePatternPlot.vue';
 import Colorbar from './Colorbar.vue';
 import {annotationQuery} from '../api/annotation';
 import {opticalImageQuery, msAcqGeometryQuery} from '../api/dataset';
 import { encodeParams } from '../url';

 import Vue, { ComponentOptions } from 'vue';
 import { Store } from 'vuex';
 import { Component, Prop } from 'vue-property-decorator';
 import { Location } from 'vue-router';
 import { saveAs } from 'file-saver';

 import * as domtoimage from 'dom-to-image';

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

 @Component({
   name: 'annotation-view',
   components: {
     DatasetInfo,
     AdductsInfo,
     ImageLoader,
     IonImageSettings,
     IsotopePatternPlot,
     Colorbar
   },
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
       update: (data: any) => JSON.parse(data.msAcqGeometry)
     }
   }
 })
 export default class AnnotationView extends Vue {
   $store: Store<any>
   $refs: any

   @Prop()
   annotation: any

   msAcqGeometry: any
   peakChartData: any
   opticalImageUrl: string
   showOpticalImage: boolean = true

   get activeSections(): string[] {
     return this.$store.getters.settings.annotationView.activeSections;
   }

   get colormap(): string {
     return this.$store.getters.settings.annotationView.colormap;
   }

   get colormapName(): string {
     return this.colormap.replace('-', '');
   }

   get colorbarDirection(): string {
     return this.colormap[0] == '-' ? 'bottom' : 'top';
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
     const q = encodeParams(filter, path)
     return {query: q, path};
   }

   get imageLoaderSettings(): ImageLoaderSettings {
     return Object.assign({}, this.imagePosition, {
       annotImageOpacity: (this.showOpticalImage && this.opticalImageUrl) ? this.opacity : 1.0,
       opticalSrc: this.showOpticalImage ? this.opticalImageUrl : '',
       opacityMode: this.imageOpacityMode
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

   saveImage(event: any): void {
     let node = this.$refs.imageLoader.getContainer();

     domtoimage
       .toBlob(node, {
         width: this.$refs.imageLoader.imageWidth,
         height: this.$refs.imageLoader.imageHeight
       })
       .then(blob => {
         saveAs(blob, `${this.annotation.id}.png`);
       })
   }

   get browserSupportsDomToImage(): boolean {
     return window.navigator.userAgent.includes('Chrome');
   }
 }
