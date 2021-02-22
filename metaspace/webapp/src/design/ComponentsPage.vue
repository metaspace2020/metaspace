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
        <li>
          <a href="#rich-text-editor">
            Rich Text Editor
          </a>
        </li>
        <li>
          <a href="#rich-text-area">
            Rich Text Area
          </a>
        </li>
      </ul>
    </nav>
    <h2 id="elapsed-time">
      Elapsed Time
    </h2>
    <p>Display dates in a friendly "don't make me think" format, relative to the current time. Hover to see the precise time.</p>
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
    <component-example>
      <new-feature-badge :feature-key="`nfb-example-${dateDotNow}`">
        <el-button
          @click="hideFeatureBadge(`nfb-example-${dateDotNow}`)"
        >
          Click to acknowledge
        </el-button>
      </new-feature-badge>
    </component-example>
    <h2 id="rich-text-editor">
      Rich Text Editor
    </h2>
    <p>A miniature word processor for long-form text, with keyboard shortcuts. Includes sub and superscripts for formulae.</p>
    <props-table>
      <tr>
        <td>content</td>
        <td><code>string</code></td>
        <td>Initial content in <a href="https://tiptap.dev/">Tiptap</a> JSON format.</td>
      </tr>
      <tr>
        <td>placeholder</td>
        <td><code>string</code></td>
        <td>Descriptive text when empty.</td>
      </tr>
      <tr>
        <td>readonly</td>
        <td><code>boolean</code></td>
        <td>To restrict editing access.</td>
      </tr>
      <tr>
        <td>update</td>
        <td><code>function</code><span title="Required">*</span></td>
        <td>Function called when data needs to be saved, should return a promise.</td>
      </tr>
    </props-table>
    <component-example>
      <rich-text
        placeholder="Tell me a story"
        :update="richTextUpdate"
      />
    </component-example>
    <h2 id="rich-text-area">
      Rich Text Area
    </h2>
    <p>Form field version of editor. Select text to reveal controls.</p>
    <props-table>
      <tr>
        <td>content</td>
        <td><code>string</code></td>
        <td>Initial content in <a href="https://tiptap.dev/">Tiptap</a> JSON format.</td>
      </tr>
      <tr>
        <td>update</td>
        <td><code>function</code><span title="Required">*</span></td>
        <td>Function called when data needs to be saved, should return a promise.</td>
      </tr>
    </props-table>
    <component-example>
      <rich-text-area :update="richTextUpdate" />
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
import RichText, { RichTextArea } from '../components/RichText'

export default defineComponent({
  components: {
    PropsTable,
    ComponentExample,
    ContentPage,
    ElapsedTime,
    NewFeatureBadge,
    RichText,
    RichTextArea,
  },
  setup() {
    return {
      hideFeatureBadge,
      dateDotNow: Date.now(),
      richTextUpdate: () => Promise.resolve(),
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
