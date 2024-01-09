<template>
  <div
    ref="container"
    v-resize="onResize"
  >
    <ion-image-viewer
      ref="imageLoader"
      :ion-image-layers="ionImageLayers"
      :is-loading="ionImageIsLoading"
      :width="imageFit.areaWidth"
      :height="imageFit.areaHeight"
      :pixel-aspect-ratio="pixelAspectRatio"
      :zoom="zoom"
      :x-offset="xOffset"
      :y-offset="yOffset"
      :style="imageStyle"
      v-bind="attrs"
      v-on="listeners"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch, computed, onMounted } from 'vue';
// @ts-ignore
import resize from 'vue3-resize-directive'
import config from '../lib/config';
import IonImageViewer from './IonImageViewer';
import { IonImage, loadPngFromUrl, processIonImage, IonImageLayer } from '../lib/ionImageRendering';
import fitImageToArea, { FitImageToAreaResult } from '../lib/fitImageToArea';
import reportError from '../lib/reportError';
import createColormap, { OpacityMode } from '../lib/createColormap';

export default defineComponent({
  directives: {
    resize,
  },
  components: {
    IonImageViewer,
  },
  props: {
    src: { type: String, default: null },
    imagePosition: Object,
    imageStyle: Object,
    minIntensity: Number,
    maxIntensity: Number,
    pixelAspectRatio: { type: Number},
    scaleType: Object,
    colormap: { type: String, default: 'Viridis' },
    opacityMode: String,
    annotImageOpacity: Number,
    normalizationData: Object,
  },
  setup(props, { emit, attrs  }) {
    const container = ref(null);
    const imageLoader = ref(null);
    const ionImage = ref<IonImage | null>(null);
    const ionImageIsLoading = ref(false);
    const containerWidth = ref(500);
    const containerHeight = ref(500);

    const listeners = computed(() => {
      return Object.fromEntries(
        Object.entries(attrs).filter(([, value]) => typeof value === 'function')
      );
    });

    const updateIonImage = async () => {
      // Keep track of which image is loading so that this can bail if src changes before the download finishes
      const newUrl = props.src

      if (newUrl != null) {
        ionImageIsLoading.value = true
        try {
          const png = await loadPngFromUrl((config.imageStorage || '') + newUrl)

          if (newUrl === props.src) {
            ionImage.value = processIonImage(png, props.minIntensity, props.maxIntensity, props.scaleType as any,
              undefined, undefined, props.normalizationData as any)
            ionImageIsLoading.value = false
          }
        } catch (err) {
          reportError(err, null)
          if (newUrl === props.src) {
            ionImage.value = null
            ionImageIsLoading.value = false
          }
        }
      }
    };

    watch(() => props.src, updateIonImage);
    watch(() => props.normalizationData, updateIonImage);

    const onResize = () => {
      if (container.value != null) {
        containerWidth.value = container.value.clientWidth
        containerHeight.value = container.value.clientHeight
      }
    };

    const imageFit = computed((): FitImageToAreaResult => {
      return fitImageToArea({
        imageWidth: ionImage.value ? ionImage.value.width : containerWidth.value,
        imageHeight: (ionImage.value ? ionImage.value.height : containerHeight.value) / props.pixelAspectRatio,
        areaWidth: containerWidth.value,
        areaHeight: containerHeight.value,
      })
    });

    const ionImageLayers = computed((): IonImageLayer[] => {
      if (ionImage.value) {
        return [{
          ionImage: ionImage.value,
          colorMap: createColormap(props.colormap, props.opacityMode as OpacityMode, props.annotImageOpacity),
        }]
      }
      return []
    });

    const zoom = computed(() => {
      return (props.imagePosition && props.imagePosition.zoom || 1) * imageFit.value.imageZoom
    });

    const xOffset = computed(() => {
      return props.imagePosition && props.imagePosition.xOffset || 0
    });

    const yOffset = computed(() => {
      return props.imagePosition && props.imagePosition.yOffset || 0
    });

    const emitRedrawEvent = () => {
      emit('redraw', {
        width: imageFit.value.areaWidth,
        height: imageFit.value.areaHeight,
        naturalWidth: ionImage.value ? ionImage.value.width : 0,
        naturalHeight: ionImage.value ? ionImage.value.height : 0,
      })
    }

    watch(imageFit, () => {
      emitRedrawEvent()
    });

    onMounted(() => {
      // ignored promise on start
      updateIonImage()
      onResize();
    });


    return {
      container,
      imageLoader,
      ionImage,
      ionImageIsLoading,
      containerWidth,
      containerHeight,
      onResize,
      imageFit,
      ionImageLayers,
      zoom,
      xOffset,
      yOffset,
      listeners,
      attrs
    };
  },
});
</script>
