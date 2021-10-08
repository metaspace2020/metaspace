<template>
  <router-link
    v-if="editable"
    :to="opticalImageAlignmentHref"
  >
    <div
      class="thumb thumb__editable"
      :class="showEmpty && 'thumb__empty'"
      :title="title"
    >
      <img
        v-if="hasOpticalImage"
        class="thumb--img"
        :style="imageStyle"
        :src="dataset.thumbnailOpticalImageUrl"
        alt="Edit optical image"
        @error="optLoadError = true"
      >
      <img
        v-if="showIonThumb"
        class="thumb--img thumb--img__ion"
        :style="imageStyle"
        :src="dataset.ionThumbnailUrl"
        alt="Add optical image"
        @error="ionLoadError = true"
      >
      <img
        v-if="showEmpty"
        class="thumb--img"
        src="../../../assets/no_opt_image.png"
        alt="Add optical image"
      >
      <div
        class="thumb--overlay el-icon-edit"
        :class="hasOpticalImage ? 'el-icon-edit' : 'el-icon-plus'"
      />
    </div>
  </router-link>
  <div
    v-else
    class="thumb"
    :class="showEmpty && 'thumb__empty'"
  >
    <img
      v-if="hasOpticalImage"
      class="thumb--img"
      :style="imageStyle"
      :src="dataset.thumbnailOpticalImageUrl"
      alt="Optical image"
      @error="optLoadError = true"
    >
    <img
      v-if="showIonThumb"
      class="thumb--img thumb--img__ion"
      :style="imageStyle"
      :src="dataset.ionThumbnailUrl"
      alt="Ion image thumbnail"
      @error="ionLoadError = true"
    >
    <img
      v-if="showEmpty"
      class="thumb--img"
      src="../../../assets/no_opt_image.png"
      alt="No optical image"
    >
  </div>
</template>

<script>
import config from '../../../lib/config'
export default {
  props: ['dataset', 'editable'],
  data() {
    return {
      ionLoadError: false,
      optLoadError: false,
    }
  },
  computed: {
    opticalImageAlignmentHref() {
      return {
        name: 'add-optical-image',
        params: { dataset_id: this.dataset.id },
      }
    },

    showIonThumb() {
      return !this.ionLoadError && config.features.ion_thumbs && this.dataset.ionThumbnailUrl != null
    },

    hasOpticalImage() {
      return !this.optLoadError && this.dataset.thumbnailOpticalImageUrl != null
    },

    showEmpty() {
      return !this.showIonThumb && !this.hasOpticalImage
    },

    title() {
      return this.hasOpticalImage ? 'Edit Optical Image' : 'Add Optical Image'
    },

    imageStyle() {
      let aspectRatio = 1
      if (!config.features.ignore_pixel_aspect_ratio) {
        try {
          const metadata = JSON.parse(this.dataset.metadataJson)
          const { Xaxis, Yaxis } = metadata.MS_Analysis.Pixel_Size
          aspectRatio = Xaxis && Yaxis && (Xaxis / Yaxis) || 1
        } catch {
          // If something is missing in the metadataJson, just fall back to fixed aspect ratio
        }
      }

      return {
        transform: `scaleY(${1 / aspectRatio}) translateY(${50 - 50 * aspectRatio}%)`,
        height: `${100 * aspectRatio}px`,
      }
    },
  },
}
</script>

<style lang="scss" scoped>

  .thumb {
    position: relative;
    display: block;
    width: 100px;
    height: 100px;
    z-index: 0;
    overflow: hidden;
  }

  .thumb__editable {
    cursor: pointer;
    &:hover .thumb--img {
      opacity: .2;
    }
    & .thumb--overlay {
      display: none;
    }
    &:hover .thumb--overlay {
      display: block;
      position: absolute;
      font-style: normal;
      font-size: 1.5em;
      color: #2c3e50;
      width: 30px;
      height: 30px;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }
  }

  .thumb--img {
    position: absolute;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
  }

  .thumb--img__ion {
    /* Default image-rendering uses bilinear filtering, which makes the stretched ion image blurry.
    Chrome only supports pixelated, Firefox only supports crisp-edges, IE11 supports nothing */
    image-rendering: crisp-edges;
    image-rendering: pixelated;
  }

  .thumb__empty {
    outline: 1px dotted rgba(0, 0, 0, 0.6);
  }

</style>
