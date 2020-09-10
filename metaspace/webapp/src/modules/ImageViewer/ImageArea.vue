<template>
  <div
    ref="container"
    v-loading="isLoading"
    class="relative overflow-hidden"
    :style="{ width: width + 'px', height: height + 'px' }"
    @wheel="onWheel"
    @mousedown="handlePanStart"
    @mousemove="movePixelIntensity"
    @mouseleave="resetPixelIntensity"
  >
    <div :style="viewBoxStyle">
      <ion-image-renderer />
      <optical-image-renderer />
    </div>
    <pixel-intensity-tooltip />
    <scale-bar />
    <scroll-blocker />
  </div>
</template>
<script lang="ts">

</script>
