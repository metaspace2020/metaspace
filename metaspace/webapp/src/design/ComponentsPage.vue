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
        <li>
          <a href="#slider">
            Slider
          </a>
        </li>
        <li>
          <a href="#range-slider">
            Range Slider
          </a>
        </li>
        <li>
          <a href="#uppy-uploader">
            Uppy Uploader
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
    <h2 id="slider">
      Slider
    </h2>
    <p>Customizable single-value slider with track-clicking. Supports <code>v-model</code>.</p>
    <props-table>
      <tr>
        <td>disabled</td>
        <td><code>boolean</code></td>
        <td>Lock position of thumb.</td>
      </tr>
      <tr>
        <td>max</td>
        <td><code>number</code></td>
        <td>Value at right edge (default: 100).</td>
      </tr>
      <tr>
        <td>min</td>
        <td><code>number</code></td>
        <td>Value at left edge (default: 0).</td>
      </tr>
      <tr>
        <td>step</td>
        <td><code>number</code></td>
        <td>Amount to increment by (default: 1).</td>
      </tr>
      <tr>
        <td>value</td>
        <td><code>number</code></td>
        <td>Current value.</td>
      </tr>
    </props-table>
    <component-example>
      <form class="flex items-center">
        <slider
          v-model="sliderValue"
          class="w-1/3"
        />
        <p class="text-sm ml-3">
          value: {{ sliderValue }}
        </p>
      </form>
    </component-example>
    <h2 id="range-slider">
      Range Slider
    </h2>
    <p>Double-value slider with track-clicking and overlap prevention. Supports <code>v-model</code>.</p>
    <props-table>
      <tr>
        <td>disabled</td>
        <td><code>boolean</code></td>
        <td>Lock position of thumbs.</td>
      </tr>
      <tr>
        <td>max</td>
        <td><code>number</code></td>
        <td>Value at right edge (default: 100).</td>
      </tr>
      <tr>
        <td>min</td>
        <td><code>number</code></td>
        <td>Value at left edge (default: 0).</td>
      </tr>
      <tr>
        <td>step</td>
        <td><code>number</code></td>
        <td>Amount to increment by (default: 1).</td>
      </tr>
      <tr>
        <td>value</td>
        <td><code>[number,number]</code></td>
        <td>Current values.</td>
      </tr>
    </props-table>
    <component-example>
      <form class="w-1/3">
        <range-slider v-model="rangeSliderValue" />
        <p class="text-sm flex items-start justify-between">
          <span>{{ rangeSliderValue[0] }}</span>
          <span>{{ rangeSliderValue[1] }}</span>
        </p>
      </form>
    </component-example>
    <h2 id="uppy-uploader">
      Uppy Uploader
    </h2>
    <p>Uploads files using the <a href="https://uppy.io">Uppy framework</a>. Currently supports S3 Multipart only.</p>
    <props-table>
      <tr>
        <td>disabled</td>
        <td><code>boolean</code></td>
        <td>Should be used to prevent interaction, e.g. when saving the URLs of the uploaded files.</td>
      </tr>
      <tr>
        <td>options</td>
        <td><code>object</code></td>
        <td><a href="https://uppy.io/docs/uppy/#Options">Options for the Uppy instance</a>.</td>
      </tr>
      <tr>
        <td>required-file-types</td>
        <td><code>string[]</code></td>
        <td>Use when files with a specific extensions are expected and each are required.</td>
      </tr>
      <tr>
        <td>s3Options</td>
        <td><code>object</code></td>
        <td><a href="https://uppy.io/docs/aws-s3-multipart/#Options">Options for the S3 Multipart plugin</a>.</td>
      </tr>
    </props-table>
    <component-example>
      <uppy-uploader class="mb-3" />
      <p class="italic text-sm">
        N.B. this demo does not upload any files.
      </p>
    </component-example>
  </content-page>
</template>
<script lang="ts">
import { defineComponent, ref } from '@vue/composition-api'

import PropsTable from './PropsTable.vue'
import ComponentExample from './ComponentExample.vue'
import ContentPage from '../components/ContentPage.vue'

import ElapsedTime from '../components/ElapsedTime'
import NewFeatureBadge, { hideFeatureBadge } from '../components/NewFeatureBadge'
import RichText, { RichTextArea } from '../components/RichText'
import { Slider, RangeSlider } from '../components/Slider'
import UppyUploader from '../components/UppyUploader/UppyUploader.vue'

export default defineComponent({
  components: {
    PropsTable,
    ComponentExample,
    ContentPage,
    ElapsedTime,
    NewFeatureBadge,
    RichText,
    RichTextArea,
    Slider,
    RangeSlider,
    UppyUploader,
  },
  setup() {
    return {
      hideFeatureBadge,
      dateDotNow: Date.now(),
      richTextUpdate: () => Promise.resolve(),
      sliderValue: ref(0),
      rangeSliderValue: ref([0, 100]),
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
