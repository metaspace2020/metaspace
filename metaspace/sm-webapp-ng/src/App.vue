<template>
  <div
    id="app"
    class="min-h-full m-0 relative"
    :class="{ 'flex flex-col': $route.meta.flex }"
  >
    <router-view
      :key="$route.path"
      class="sm-main-content"
      :class="{ 'flex-grow w-full': $route.meta.flex }"
    />
  </div>
</template>
