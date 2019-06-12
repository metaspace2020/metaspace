<template>
  <router-link v-if="editable" :to="opticalImageAlignmentHref">
    <div v-if="mode === 'opt'" class="thumb thumb__opt thumb__editable" title="Edit Optical Image">
      <img class="thumb--img" :src="dataset.thumbnailOpticalImageUrl" alt="Edit optical image"/>
    </div>
    <div v-else-if="mode === 'ion'" class="thumb thumb__ion thumb__editable" title="Add Optical Image">
      <img class="thumb--img" :src="dataset.ionThumbnailUrl" alt="Add optical image"/>
    </div>
    <div v-else class="thumb thumb__empty thumb__editable" title="Add Optical Image">
      <img class="thumb--img" src="../../../assets/no_opt_image.png" alt="Add optical image"/>
    </div>
  </router-link>
  <div v-else-if="mode === 'opt'" class="thumb thumb__opt">
    <img class="thumb--img" :src="dataset.thumbnailOpticalImageUrl" alt="Optical image"/>
  </div>
  <div v-else-if="mode === 'ion'" class="thumb thumb__ion">
    <img class="thumb--img" :src="dataset.ionThumbnailUrl" alt="Optical image"/>
  </div>
  <div v-else class="thumb thumb__empty">
    <img class="thumb--img" src="../../../assets/no_opt_image.png" alt="Optical image"/>
  </div>
</template>

<script>
  import config from '../../../clientConfig.json';
  export default {
    props: ['dataset', 'editable'],
    computed: {
      opticalImageAlignmentHref() {
        return {
          name: 'add-optical-image',
          params: {dataset_id: this.dataset.id}
        };
      },

      mode() {
        if (config.features.ion_thumbs && this.dataset.ionThumbnailUrl) {
          return 'ion';
        } else if (this.dataset.thumbnailOpticalImageUrl) {
          return 'opt';
        } else {
          return 'empty';
        }
      },

      imageUrl() {
        return {
          opt: this.dataset.thumbnailOpticalImageUrl,
          ion: this.dataset.ionThumbnailUrl,
          empty: null, // URL must be in the vue template for webpack to resolve it correctly
        }[this.mode];
      },

      imageClass() {
        return this.dataset.thumbnailOpticalImageUrl != null ? 'thumb-thumbnail' : 'ion-image-thumbnail';
      }
    }
  }
</script>

<style lang="scss" scoped>
  
  .thumb {
    position: relative;
    display: block;
    width: 100px;
    height: 100px;
    z-index: 0;
  }

  .thumb__editable {
    cursor: pointer;
    &:hover .thumb--img {
      opacity: .2;
    }
    &:hover::before {
      font-family: 'element-icons' !important;
      font-style: normal;
      font-size: 1.5em;
      color: #2c3e50;
      position: absolute;
      display: block;
      width: 30px;
      height: 30px;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }

    &.thumb__ion:hover::before, &.thumb__empty:hover::before {
      font-weight: bold;
      content: '\E62B';
    }

    &.thumb__opt:hover::before {
      content: '\E61C';
    }
  }

  .thumb--img {
    width: 100px;
    height: 100px;
    object-fit: cover;
    object-position: 0 0;
  }

  .thumb__ion .thumb--img {
    object-fit: contain;
    object-position: center;
    /* Default image-rendering uses bilinear filtering, which makes the stretched ion image blurry.
    Chrome only supports pixelated, Firefox only supports crisp-edges, IE11 supports nothing */
    image-rendering: crisp-edges;
    image-rendering: pixelated;
  }

  .thumb__empty {
    outline: 1px dotted rgba(0, 0, 0, 0.6);
  }

</style>
