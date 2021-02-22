<template>
  <content-page>
    <h1>Components</h1>
    <p>They're worth it, I promise.</p>
    <nav class="text-sm leading-5">
      <ul class="list-none">
        <li>
          <a href="#elapsed-time">
            Elapsed Time
          </a>
        </li>
        <li>
          <a href="#new-feature-badge">
            New Feature Badge
          </a>
        </li>
      </ul>
    </nav>
    <h2 id="elapsed-time">
      Elapsed Time
    </h2>
    <p>Formats dates in a friendly "don't make me think" format, relative to the current time.</p>
    <h3>Props</h3>
    <props-table>
      <tr>
        <td>
          date
        </td>
        <td>
          <code>string</code>
        </td>
        <td>
          Date to compare the current time to. String format used as a catch-all case, Date objects can be converted.
        </td>
      </tr>
    </props-table>
    <h3>Example</h3>
    <component-example>
      <p class="text-sm leading-5">
        <elapsed-time :date="new Date().toString()" />,
        <elapsed-time :date="new Date(dateDotNow - (1000 * 60)).toString()" />,
        <elapsed-time :date="new Date(dateDotNow - (1000 * 60 * 60)).toString()" />,
        <elapsed-time :date="new Date(dateDotNow - (1000 * 60 * 60 * 24)).toString()" />
      </p>
    </component-example>
    <h2 id="new-feature-badge">
      New Feature Badge
    </h2>
    <p>Attention-grabbing badge to indicate a new feature without a description.</p>
    <h3>Props</h3>
    <props-table>
      <tr>
        <td>
          feature-key
        </td>
        <td>
          <code>string</code>
        </td>
        <td>
          Unique key to reference badge in local storage.
        </td>
      </tr>
      <tr>
        <td>
          show-until
        </td>
        <td>
          <code>Date</code>
        </td>
        <td>
          Badge is not shown after this date.
        </td>
      </tr>
    </props-table>
    <h3>Example</h3>
    <component-example>
      <new-feature-badge :feature-key="`nfb-example-${dateDotNow}`">
        <el-button
          @click="hideFeatureBadge(`nfb-example-${dateDotNow}`)"
        >
          Click to acknowledge
        </el-button>
      </new-feature-badge>
    </component-example>
  </content-page>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import PropsTable from './PropsTable.vue'
import ComponentExample from './ComponentExample.vue'
import ContentPage from '../components/ContentPage.vue'
import ElapsedTime from '../components/ElapsedTime'
import NewFeatureBadge, { hideFeatureBadge } from '../components/NewFeatureBadge'

export default defineComponent({
  components: {
    PropsTable,
    ComponentExample,
    ContentPage,
    ElapsedTime,
    NewFeatureBadge,
  },
  setup() {
    return {
      hideFeatureBadge,
      dateDotNow: Date.now(),
    }
  },
})
</script>
<style scoped>
nav li {
  margin-top: 0;
}
dl {
  @apply grid grid-cols-2 grid-flow-row gap-6;
}
</style>
