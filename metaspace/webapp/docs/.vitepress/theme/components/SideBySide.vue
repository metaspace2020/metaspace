<template>
  <figure class="side-by-side">
    <div class="side-by-side__grid">
      <div class="side-by-side__item">
        <img :src="withBase(left)" :alt="leftCaption || 'Left image'" />
        <figcaption v-if="leftCaption">{{ leftCaption }}</figcaption>
      </div>
      <div class="side-by-side__item">
        <img :src="withBase(right)" :alt="rightCaption || 'Right image'" />
        <figcaption v-if="rightCaption">{{ rightCaption }}</figcaption>
      </div>
    </div>
    <figcaption v-if="source" class="side-by-side__source">
      Source: <a :href="source" target="_blank" rel="noopener">dataset</a>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { withBase } from 'vitepress'

defineProps<{
  left: string
  right: string
  leftCaption?: string
  rightCaption?: string
  source?: string
}>()
</script>

<style scoped>
.side-by-side {
  margin: 1.5rem 0;
}

.side-by-side__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.side-by-side__item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.side-by-side__item img {
  width: 100%;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
}

.side-by-side__item figcaption {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  text-align: center;
}

.side-by-side__source {
  font-size: 0.8rem;
  color: var(--vp-c-text-3);
  text-align: right;
  margin-top: 0.25rem;
}

@media (max-width: 640px) {
  .side-by-side__grid {
    grid-template-columns: 1fr;
  }
}
</style>
