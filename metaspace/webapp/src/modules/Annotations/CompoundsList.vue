<template>
  <div id="compound-list">
    <div class="compound" v-for="(compound, idx) in annotation.possibleCompounds" :key="idx">
      <el-popover placement="left" trigger="click">
        <img :src="failedImages.includes(compound.imageURL) ? noImageURL : compound.imageURL"
             @error="onCompoundImageError(compound.imageURL)"
             class="compound-thumbnail"
             slot="reference"
        />
        <div class="compound-popover">
          <figure>
            <figcaption>
              {{ compound.name }}
              <br/>
              <a v-if="compound.information[0].url != null" :href="compound.information[0].url" target="_blank">
                View on {{ compound.information[0].database }} website
              </a>
            </figcaption>
            <img :src="failedImages.includes(compound.imageURL) ? noImageURL : compound.imageURL"
                 class="compound-image"/>
          </figure>
        </div>
      </el-popover>
      <br/>

      <span v-if="compound.name.length <= 35">
                <a :href="compound.information[0].url" target="_blank">
                  {{ compound.name }}
                </a>
              </span>

      <span v-else>
                <a :href="compound.information[0].url" target="_blank"
                   :title="compound.name">
                  {{ compound.name.slice(0, 32) + '...' }}
                </a>
              </span>
    </div>
  </div>
</template>
<script>
  export default {
    props: {
      annotation: Object,

    }
  }
</script>
