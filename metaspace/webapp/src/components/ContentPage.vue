<template>
  <div class="sm-content-page">
    <slot />
  </div>
</template>
<style>
.sm-content-page.sm-main-content {
  /* .sm-main-content is added to page routes */
  @apply p-18 max-w-4xl box-border mx-auto leading-6 text-base;
}

.sm-content-page > * {
  @apply my-0;
}

.sm-content-page > *:not(h1):not(h2) + *,
.sm-content-page > ul li + li {
  @apply mt-6;
}

.sm-content-page > h1 {
  @apply text-4xl leading-12 font-display;
}

.sm-content-page > h2 {
  @apply text-2xl leading-6 font-display pb-3 pt-9; /* top padding is for anchor links */
  scroll-margin-top: theme('spacing.12');
}

.sm-content-page h3 {
  @apply font-medium;
}

.sm-content-page ul {
  @apply p-0 my-0;
}

.sm-content-page ol.sm-ordered-list {
  list-style: none;
  counter-reset: primary-nums;
}

.sm-content-page ol.sm-ordered-list > li {
  @apply mt-6 relative;
}

.sm-content-page ol.sm-ordered-list > li::before {
  @apply absolute w-6 h-6 rounded-full bg-blue-100 text-blue-700
    font-bold text-sm flex items-baseline justify-center;

  counter-increment: primary-nums;
  content: counter(primary-nums);
  left: calc(-1 * theme('spacing.9'));
}

.sm-content-page p {
  @apply my-0 max-w-measure-4;
}

.sm-content-page b {
  @apply font-medium;
}

.sm-content-page table {
  @apply border-collapse;
}

.sm-content-page td {
  @apply p-0 align-top;
}

.sm-content-page code {
  @apply bg-gray-100 px-1 rounded-sm leading-normal;
  display: inline-block;
  font-family: monospace;
}
</style>
