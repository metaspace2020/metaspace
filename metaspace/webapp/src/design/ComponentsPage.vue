<template>
  <content-page>
    <h1>Components</h1>
    <p>Reusable bits and bobs</p>
    <nav class="text-sm leading-5">
      <ul class="list-none">
        <li>
          <a href="#confirm-prompt">
            Confirm Prompt
          </a>
        </li>
        <li>
          <a href="#copy-button">
            Copy Button
          </a>
        </li>
        <li>
          <a href="#elapsed-time">
            Elapsed Time
          </a>
        </li>
        <li>
          <a href="#fade-transition">
            Fade Transition
          </a>
        </li>
        <li>
          <a href="#mini-switch">
            Mini-switch
          </a>
        </li>
        <li>
          <a href="#molecular-formula">
            Molecular Formula
          </a>
        </li>
        <li>
          <a href="#new-feature-badge">
            New Feature Badge
          </a>
        </li>
        <li>
          <a href="#progress-ring">
            Progress Ring
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
        <li>
          <a href="#workflow">
            Workflow
          </a>
        </li>
      </ul>
    </nav>
    <h2 id="confirm-prompt">
      Confirm Prompt
    </h2>
    <p>Function version of <code>ConfirmAsync</code>, for when directives cannot be used.</p>
    <component-example>
      <el-button @click="showPrompt">
        Confirm
      </el-button>
    </component-example>
    <h2 id="copy-button">
      Copy Button
    </h2>
    <p>Copy pieces of text in one click, useful for formatted text like formulae.</p>
    <props-table>
      <tr>
        <td>
          text
        </td>
        <td>
          <code>string</code>
        </td>
        <td>
          The text to be copied.
        </td>
      </tr>
    </props-table>
    <component-example>
      <div class="flex items-center justify-between">
        <span class="inline-flex">
          Lorem Ipsum
          <copy-button
            class="-mt-1 ml-1"
            text="Lorem Ipsum"
          >
            Copy to clipboard
          </copy-button>
        </span>
        <input
          placeholder="paste it here"
          class="w-1/3 text-sm el-input__inner"
        />
      </div>
    </component-example>
    <h2 id="fade-transition">
      Fade Transition
    </h2>
    <p>Consistent fading in and out. Conditionally show 0 or 1 children inside.</p>
    <component-example>
      <el-checkbox v-model="fadeIn">
        visible
      </el-checkbox>
      <fade-transition class="ml-6">
        <span v-if="fadeIn">
          I am visible
        </span>
      </fade-transition>
    </component-example>
    <h2 id="elapsed-time">
      Elapsed Time
    </h2>
    <p>Display durations in a friendly format. Hover to see the precise time.</p>
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
    <h2 id="mini-switch">
      Mini-switch
    </h2>
    <p>For tight spaces, setting the thumb to size 3/12px. Same props as <code>el-switch</code>.</p>
    <component-example>
      <el-switch
        :value="miniSwitch.original"
        inactive-text="original size"
        @change="miniSwitch.original = !miniSwitch.original"
      />
      <span class="text-lg mx-3">--></span>
      <mini-switch
        :value="miniSwitch.mini"
        active-text="mini size"
        @change="miniSwitch.mini = !miniSwitch.mini"
      />
    </component-example>
    <h2 id="molecular-formula">
      Molecular Formula
    </h2>
    <p>Proper formatting for formulae, probably the most relevant thing here!</p>
    <props-table>
      <tr>
        <td>ion</td>
        <td><code>string</code></td>
        <td>text version to be formatted, e.g. C44H86NO8P+H+</td>
      </tr>
    </props-table>
    <component-example>
      <molecular-formula ion="C44H86NO8P+H+" />
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
    <h2 id="progress-ring">
      Progress Ring
    </h2>
    <p>Circular SVG progress bar.</p>
    <props-table>
      <tr>
        <td>progress</td>
        <td><code>number</code></td>
        <td>Percentage of the bar to fill</td>
      </tr>
      <tr>
        <td>radius</td>
        <td><code>number</code></td>
        <td>Size of ring</td>
      </tr>
      <tr>
        <td>stroke</td>
        <td><code>number</code></td>
        <td>Width of the line</td>
      </tr>
    </props-table>
    <component-example>
      <div class="flex items-center justify-between">
        <progress-ring
          class="text-primary bg-gray-100 rounded-full"
          :radius="20"
          :stroke="4"
          :progress="progress"
        />
        <el-input
          v-model="progress"
          class="w-1/3 inline-block"
          type="number"
          :min="0"
          :max="100"
        />
      </div>
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
    <h2 id="workflow">
      Workflow
    </h2>
    <p>Break a task into a series of steps. Props below are for the <code>WorkflowStep</code> component.</p>
    <props-table>
      <tr>
        <td>active</td>
        <td><code>boolean</code></td>
        <td>Highlights the step as active.</td>
      </tr>
      <tr>
        <td>done</td>
        <td><code>boolean</code></td>
        <td>Shows a checkmark instead of the step number.</td>
      </tr>
    </props-table>
    <component-example>
      <workflow>
        <workflow-step
          :active="workflowStep === 1"
          :done="workflowStep > 1"
        >
          <p class="sm-workflow-header">
            This is the first step
          </p>
          <form v-if="workflowStep === 1">
            <el-button @click="workflowStep = 2">
              Next
            </el-button>
          </form>
        </workflow-step>
        <workflow-step
          :active="workflowStep === 2"
          :done="workflowStep > 2"
        >
          <p class="sm-workflow-header">
            This is the second step
          </p>
          <form v-if="workflowStep === 2">
            <el-button @click="workflowStep = 3">
              Next
            </el-button>
          </form>
        </workflow-step>
        <workflow-step
          :active="workflowStep === 3"
        >
          <p class="sm-workflow-header">
            This is the final step
          </p>
        </workflow-step>
      </workflow>
    </component-example>
  </content-page>
</template>
<script lang="ts">
import { defineComponent, ref, reactive } from '@vue/composition-api'

import PropsTable from './PropsTable.vue'
import ComponentExample from './ComponentExample.vue'
import ContentPage from '../components/ContentPage.vue'

import ElapsedTime from '../components/ElapsedTime'
import NewFeatureBadge, { hideFeatureBadge } from '../components/NewFeatureBadge'
import RichText, { RichTextArea } from '../components/RichText'
import { Slider, RangeSlider } from '../components/Slider'
import UppyUploader from '../components/UppyUploader/UppyUploader.vue'
import { Workflow, WorkflowStep } from '../components/Workflow'
import confirmPrompt from '../components/confirmPrompt'
import CopyButton from '../components/CopyButton.vue'
import FadeTransition from '../components/FadeTransition'
import MolecularFormula from '../components/MolecularFormula'
import ProgressRing from '../components/ProgressRing'
import MiniSwitch from '../components/MiniSwitch.vue'

export default defineComponent({
  components: {
    ComponentExample,
    ContentPage,
    CopyButton,
    ElapsedTime,
    FadeTransition,
    MiniSwitch,
    MolecularFormula,
    NewFeatureBadge,
    ProgressRing,
    PropsTable,
    RangeSlider,
    RichText,
    RichTextArea,
    Slider,
    UppyUploader,
    Workflow,
    WorkflowStep,
  },
  setup() {
    return {
      dateDotNow: Date.now(),
      fadeIn: ref(false),
      hideFeatureBadge,
      rangeSliderValue: ref([0, 100]),
      richTextUpdate: () => Promise.resolve(),
      showPrompt: () => confirmPrompt({
        title: '',
        message: 'Are you sure?',
        confirmButtonText: 'Yes',
        confirmButtonLoadingText: 'Confirming...',
      }, async() => new Promise(resolve => {
        setTimeout(resolve, 1000)
      })),
      sliderValue: ref(0),
      workflowStep: ref(1),
      progress: ref(0),
      miniSwitch: reactive({
        original: false,
        mini: false,
      }),
    }
  },
})
</script>
<style scoped>
nav li {
  margin-top: 0;
}
</style>
