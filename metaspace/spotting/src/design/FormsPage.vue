<template>
  <content-page>
    <h1>Forms</h1>
    <nav class="text-sm leading-5">
      <ul class="list-none">
        <li><a href="#general-form-fields">General Form Fields</a></li>
        <li><a href="#copy-to-clipboard">Copy to Clipboard</a></li>
        <li><a href="#radio-button">Radio Button</a></li>
      </ul>
    </nav>
    <h2 id="general-form-fields">
      General Form Fields
    </h2>
    <p>
      Based on the size 6/24px baseline. Optionally use <code>v-rhythm-6</code> to space fields out vertically.
    </p>
    <component-example>
      <sm-form :class="{ 'baseline-grid-6': formField.grid }">
        <div>
          <label for="label-example">
            <primary-label-text>
              Primary text: main description of the form field
            </primary-label-text>
            <secondary-label-text>
              Secondary text: guidance such as purpose or validation rules
            </secondary-label-text>
            <error-label-text v-if="formField.error">
              Error text: how to solve the issue
            </error-label-text>
          </label>
          <el-input
            id="label-example"
            class="w-1/2"
            :class="{ 'sm-form-error': formField.error }"
            placeholder="placeholder"
          />
        </div>
      </sm-form>
    </component-example>
    <div class="h-6">
      <el-checkbox v-model="formField.error">
        Show error style
      </el-checkbox>
      <el-checkbox v-model="formField.grid">
        Show baseline grid
      </el-checkbox>
    </div>
    <h2 id="copy-to-clipboard">
      Copy to Clipboard
    </h2>
    <p>Form field with a copy button. Supports clicking to reveal sensitive info.</p>
    <props-table>
      <tr>
        <td>value</td>
        <td><code>string</code></td>
        <td>Text to be copied</td>
      </tr>
      <tr>
        <td>type</td>
        <td><code>string</code></td>
        <td>Type of the input, e.g. text or password</td>
      </tr>
    </props-table>
    <component-example>
      <form class="flex item-center justify-between">
        <copy-to-clipboard
          class="w-1/3"
          value="password"
          type="password"
        />
        <input
          class="el-input__inner w-1/3"
          placeholder="Paste here"
        />
      </form>
    </component-example>
    <h2 id="radio-button">
      Radio Button
    </h2>
    <p>Fancier than Element UI and uses native elements. Check mark has a hanging indent.</p>
    <props-table>
      <tr>
        <td>id</td>
        <td><code>string</code></td>
        <td>unique identifier for option</td>
      </tr>
      <tr>
        <td>name</td>
        <td><code>string</code></td>
        <td>name for the group, should be the same for all options</td>
      </tr>
      <tr>
        <td>checked</td>
        <td><code>boolean</code></td>
        <td>should only be true for one option</td>
      </tr>
    </props-table>
    <component-example>
      <form class="pl-12">
        <p class="m-0 pb-3 font-medium">
          Choose one:
        </p>
        <radio-button
          id="radio-button-1"
          name="radio-button-example"
          :checked="radioButton === 1"
          @change="radioButton = 1"
        >
          <primary-label-text>Option 1</primary-label-text>
          <secondary-label-text>Explanatory text</secondary-label-text>
        </radio-button>
        <radio-button
          id="radio-button-2"
          name="radio-button-example"
          :checked="radioButton === 2"
          @change="radioButton = 2"
        >
          <primary-label-text>Option 2</primary-label-text>
          <secondary-label-text>Explanatory text</secondary-label-text>
        </radio-button>
        <radio-button
          id="radio-button-3"
          name="radio-button-example"
          :checked="radioButton === 3"
          @change="radioButton = 3"
        >
          <primary-label-text>Option 3</primary-label-text>
          <secondary-label-text>Explanatory text</secondary-label-text>
        </radio-button>
      </form>
    </component-example>
  </content-page>
</template>
<script lang="ts">
import { defineComponent, reactive, ref } from '@vue/composition-api'

import ContentPage from '../components/ContentPage.vue'
import ComponentExample from './ComponentExample.vue'
import PropsTable from './PropsTable.vue'

import * as FormComponents from '../components/Form'

export default defineComponent({
  components: {
    ContentPage,
    ComponentExample,
    PropsTable,
    ...FormComponents,
  },
  setup() {
    return {
      formField: reactive({
        error: false,
        grid: false,
      }),
      radioButton: ref(1),
    }
  },
})
</script>
