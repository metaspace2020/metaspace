<template>
  <div class="compound-list">
    <div
      v-for="(compound, idx) in compounds"
      :key="idx"
      class="compound"
    >
      <el-popover
        placement="left"
        trigger="click"
      >
        <img
          slot="reference"
          :src="failedImages.includes(compound.imageURL) ? noImageURL : compound.imageURL"
          class="compound-thumbnail"
          @error="onCompoundImageError(compound.imageURL)"
        >
        <div class="compound-popover">
          <figure>
            <figcaption>
              {{ compound.name }}
              <br>
              <a
                v-if="compound.information[0].url != null"
                :href="compound.information[0].url"
                target="_blank"
              >
                View on {{ compound.information[0].database }} website
              </a>
            </figcaption>
            <img
              :src="failedImages.includes(compound.imageURL) ? noImageURL : compound.imageURL"
              class="compound-image"
            >
          </figure>
        </div>
      </el-popover>
      <br>

      <span v-if="compound.name.length <= 35">
        <a
          :href="compound.information[0].url"
          target="_blank"
        >
          {{ compound.name }}
        </a>
      </span>

      <span v-else>
        <a
          :href="compound.information[0].url"
          target="_blank"
          :title="compound.name"
        >
          {{ compound.name.slice(0, 32) + '...' }}
        </a>
      </span>
    </div>
    <div
      v-if="compounds.length === 0"
      class="empty-message"
    >
      This database does not contain molecule information.
    </div>
  </div>
</template>
<script>
import noImageURL from '../../../assets/no-image.svg'

export default {
  props: {
    compounds: Array,
  },
  data() {
    return {
      failedImages: [],
      noImageURL,
    }
  },
  methods: {
    onCompoundImageError(url) {
      this.failedImages.push(url)
    },
  },
}
</script>
<style lang="scss" scoped>

  .compound-list {
    margin: 0 auto;
    text-align: left;
  }

  .compound {
    display: inline-block;
    vertical-align: top;
    min-width: 250px;
    font-size: 1rem;
    margin: 10px;
    text-align: center;
  }

  .compound-thumbnail {
    height: 200px;
    width: 200px;
    cursor: pointer;
  }

  .compound-image {
    height: 700px;
  }

  figcaption {
    font-size: 24px;
    text-align: center;
  }

  figcaption a {
    font-size: 20px;
    text-align: center;
  }

  .empty-message {
    @apply text-gray-600;
    text-align: center;
    padding: 100px 50px;
  }
</style>
