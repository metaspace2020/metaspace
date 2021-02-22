<template>
  <content-page class="flex-grow">
    <h1 class="pb-6">
      Style Guide
    </h1>
    <!-- <h2>Contents</h2> -->
    <nav class="text-sm leading-5">
      <ul class="list-none">
        <li>
          <a href="#fonts">Fonts</a>
        </li>
        <li>
          <a href="#leading-tracking">Leading & tracking</a>
        </li>
        <li>
          <a href="#measure">Measure</a>
        </li>
        <li>
          <a href="#colours">Colours</a>
        </li>
        <li>
          <a href="#spacing">Spacing</a>
        </li>
        <li>
          <a href="#vertical-rhythm">Vertical Rhythm</a>
        </li>
        <li>
          <a href="#debugging">Debugging</a>
        </li>
      </ul>
    </nav>
    <h2 id="fonts">
      Fonts
    </h2>
    <table class="font-sans text-lg w-1/2">
      <tbody>
        <tr>
          <td>font-sans</td>
          <td class="text-right">
            Roboto&nbsp;400
          </td>
        </tr>
        <tr class="italic">
          <td>italic</td>
          <td class="text-right">
            Roboto&nbsp;400i
          </td>
        </tr>
        <tr class="font-medium">
          <td>font-medium</td>
          <td class="text-right">
            Roboto&nbsp;500
          </td>
        </tr>
        <tr class="font-bold">
          <td>font-bold</td>
          <td class="text-right">
            Roboto&nbsp;700
          </td>
        </tr>
      </tbody>
    </table>
    <table class="font-display font-medium text-lg w-1/2">
      <tbody>
        <tr>
          <td>font-display</td>
          <td class="text-right">
            Futura BT Medium
          </td>
        </tr>
      </tbody>
    </table>
    <h2 id="leading-tracking">
      Leading & tracking
    </h2>
    <p class="italic">
      Examples combinations for text styles. Line height scales with font size, but headings need to be tighter.
      Smaller text needs wide letter-spacing for legibility, larger text looks better with tight spacing.
    </p>
    <text-demo
      text-classes="text-xs leading-4"
      definition="12px / 16px"
    />
    <text-demo
      text-classes="text-sm leading-5"
      definition="14px / 20px"
    />
    <text-demo
      text-classes="text-base leading-6"
      definition="16px / 24px"
    />
    <text-demo
      text-classes="text-2xl leading-tight tracking-snug font-medium"
      definition="24px / 30px"
    />
    <text-demo
      text-classes="text-4xl leading-none tracking-tight font-medium"
      definition="36px / 36px"
    />
    <h2 id="measure">
      Measure
    </h2>
    <p class="italic">
      The &ldquo;measure&rdquo; of a paragraph is the number of characters on one line.
      These numbers are spaced evenly around 60 as a good default, but in general
      <a href="https://css-tricks.com/equilateral-triangle-perfect-paragraph/">
        the line length should scale with the font-size<!-- -->
      </a>.
    </p>
    <div class="v-rhythm-3">
      <measure-demo level="1" />
      <measure-demo level="2" />
      <measure-demo level="3" />
      <measure-demo level="4" />
      <measure-demo level="5" />
    </div>
    <h2 id="colours">
      Colours
    </h2>
    <p class="italic">
      Modifications and additions to <a href="https://v1.tailwindcss.com/docs/customizing-colors">the Tailwind 1.x palette</a>.
    </p>
    <div>
      <h3>Brand / states</h3>
      <div class="grid grid-cols-5 grid-rows-1 gap-3 text-sm leading-5">
        <colour-swatch
          colour-class="bg-primary"
          name="primary"
          :definition="colors.primary"
        />
        <colour-swatch
          colour-class="bg-success"
          name="success"
          :definition="colors.success"
        />
        <colour-swatch
          colour-class="bg-warning"
          name="warning"
          :definition="colors.warning"
        />
        <colour-swatch
          colour-class="bg-danger"
          name="danger"
          :definition="colors.danger"
        />
        <colour-swatch
          colour-class="bg-body"
          name="body"
          :definition="colors.body"
        />
      </div>
      <h3 class="mt-12">
        Gray
      </h3>
      <div class="grid grid-cols-5 grid-rows-2 gap-3 text-sm leading-5">
        <colour-swatch
          colour-class="bg-gray-100"
          name="100"
          :definition="colors.gray['100']"
        />
        <colour-swatch
          colour-class="bg-gray-200"
          name="200"
          :definition="colors.gray['200']"
        />
        <colour-swatch
          colour-class="bg-gray-300"
          name="300"
          :definition="colors.gray['300']"
        />
        <colour-swatch
          colour-class="bg-gray-400"
          name="400"
          :definition="colors.gray['400']"
        />
        <colour-swatch
          colour-class="bg-gray-500"
          name="500"
          :definition="colors.gray['500']"
        />
        <colour-swatch
          colour-class="bg-gray-600"
          name="600"
          :definition="colors.gray['600']"
        />
        <colour-swatch
          colour-class="bg-gray-700"
          name="700"
          :definition="colors.gray['700']"
        />
        <colour-swatch
          colour-class="bg-gray-800"
          name="800"
          :definition="colors.gray['800']"
        />
        <colour-swatch
          colour-class="bg-gray-900"
          name="900"
          :definition="colors.gray['900']"
        />
      </div>
      <h3 class="mt-12">
        Blue
      </h3>
      <div class="grid grid-cols-5 grid-rows-2 gap-3 text-sm leading-5">
        <colour-swatch
          colour-class="bg-blue-100"
          name="100"
          :definition="colors.blue['100']"
        />
        <colour-swatch
          colour-class="bg-blue-200"
          name="200"
          :definition="colors.blue['200']"
        />
        <colour-swatch
          colour-class="bg-blue-300"
          name="300"
          :definition="colors.blue['300']"
        />
        <colour-swatch
          colour-class="bg-blue-400"
          name="400"
          :definition="colors.blue['400']"
        />
        <colour-swatch
          colour-class="bg-blue-500"
          name="500"
          :definition="colors.blue['500']"
        />
        <colour-swatch
          colour-class="bg-blue-600"
          name="600"
          :definition="colors.blue['600']"
        />
        <colour-swatch
          colour-class="bg-blue-700"
          name="700"
          :definition="colors.blue['700']"
        />
        <colour-swatch
          colour-class="bg-blue-800"
          name="800"
          :definition="colors.blue['800']"
        />
        <colour-swatch
          colour-class="bg-blue-900"
          name="900"
          :definition="colors.blue['900']"
        />
        <colour-swatch
          colour-class="bg-blue-999"
          name="999"
          :definition="colors.blue['999']"
        />
      </div>
      <h3 class="mt-12">
        Alpha backgrounds
      </h3>
      <div class="grid grid-cols-5 grid-rows-2 gap-3 text-sm leading-5">
        <colour-swatch
          colour-class="bg-primary-alpha"
          name="primary-alpha"
          :definition="backgroundColor['primary-alpha']"
          has-opacity
        />
        <colour-swatch
          colour-class="bg-blue-100-alpha"
          name="blue-100-alpha"
          :definition="backgroundColor['blue-100-alpha']"
          has-opacity
        />
        <colour-swatch
          colour-class="bg-blue-200-alpha"
          name="blue-200-alpha"
          :definition="backgroundColor['blue-200-alpha']"
          has-opacity
        />
        <colour-swatch
          colour-class="bg-blue-700-alpha"
          name="blue-700-alpha"
          :definition="backgroundColor['blue-700-alpha']"
          has-opacity
        />
        <colour-swatch
          colour-class="bg-gray-100-alpha"
          name="gray-100-alpha"
          :definition="backgroundColor['gray-100-alpha']"
          has-opacity
        />
        <colour-swatch
          colour-class="bg-gray-200-alpha"
          name="gray-200-alpha"
          :definition="backgroundColor['gray-200-alpha']"
          has-opacity
        />
      </div>
      <h3 class="mt-12">
        Borders
      </h3>
      <div class="grid grid-cols-5 grid-rows-1 gap-3 text-sm leading-5">
        <colour-swatch
          colour-class="border border-solid border-danger"
          name="danger"
          :definition="borderColor.danger"
        />
        <colour-swatch
          colour-class="border border-solid border-gray-200-alpha"
          name="gray-200-alpha"
          :definition="borderColor['gray-200-alpha']"
        />
      </div>
      <h3 class="mt-12">
        Text
      </h3>
      <table class="text-lg font-medium w-1/2">
        <tbody>
          <tr class="text-primary">
            <td>
              text-primary
            </td>
            <td class="text-right text-sm">
              4.51 contrast ratio, {{ textColor.primary }}
            </td>
          </tr>
          <tr class="text-danger">
            <td>
              text-danger
            </td>
            <td class="text-right text-sm">
              {{ textColor.danger }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <h2 id="spacing">
      Spacing
    </h2>
    <p class="italic">
      Additions to <a href="https://v1.tailwindcss.com/docs/customizing-spacing#default-spacing-scale">the Tailwind 1.x scale</a> based on multiples of size <b class="not-italic">6</b> (1.5rem/24px),
      as this is the base line height.
    </p>
    <div class="w-3/4">
      <width-demo
        width-class="w-6"
        name="6"
        intermediate
      />
      <width-demo
        width-class="w-9"
        name="9"
        definition="1.5 * 1.5rem = 2.25rem"
      />
      <width-demo
        width-class="w-12"
        name="12"
        intermediate
      />
      <width-demo
        width-class="w-18"
        name="18"
        definition="3 * 1.5rem = 4.5rem"
      />
      <width-demo
        width-class="w-21"
        name="21"
        definition="3.5 * 1.5rem = 5.25rem"
      />
      <width-demo
        width-class="w-24"
        name="24"
        intermediate
      />
      <span class="mb-3 leading-3 text-gray-700 font-medium flex items-baseline text-4xl">
        &hellip;
      </span>
      <width-demo
        width-class="w-60"
        name="60"
        definition="10 * 1.5rem = 15rem"
      />
      <width-demo
        width-class="w-66"
        name="66"
        definition="11 * 1.5rem = 16.5rem"
      />
    </div>
    <h2 id="vertical-rhythm">
      Vertical Rhythm
    </h2>
    <p class="italic">
      Apply vertical margin between elements, based on <a href="https://alistapart.com/article/axiomatic-css-and-lobotomized-owls/">the owl selector</a>.
    </p>
    <div class="grid grid-cols-4 gap-6">
      <article>
        <div class="v-rhythm-3">
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
        </div>
        <code class="mt-3">v-rhythm-3</code>
      </article>
      <article>
        <div class="v-rhythm-4">
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
        </div>
        <code class="mt-3">v-rhythm-4</code>
      </article>
      <article>
        <div class="v-rhythm-5">
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
        </div>
        <code class="mt-3">v-rhythm-5</code>
      </article>
      <article>
        <div class="v-rhythm-6">
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
          <div class="bg-primary h-3 w-full rounded" />
        </div>
        <code class="mt-3">v-rhythm-6</code>
      </article>
    </div>
    <h2 id="debugging">
      Debugging
    </h2>
    <p class="italic">
      Baseline grids for sizing and positioning elements.
    </p>
    <div>
      <div class="baseline-grid-4 text-xs leading-4 flex justify-between items-start">
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>
        <el-button
          type="primary"
          size="small"
        >
          Button
        </el-button>
      </div>
      <code class="mt-3">baseline-grid-4</code>
    </div>
    <div>
      <div class="baseline-grid-5 text-sm leading-5 flex justify-between items-start">
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>
        <el-button type="primary">
          Button
        </el-button>
      </div>
      <code class="mt-3">baseline-grid-5</code>
    </div>
    <div>
      <div class="baseline-grid-6 -mx-6">
        <div class="box-border font-display py-12 mx-auto max-w-4xl flex items-center">
          <img
            src="../assets/METASPACE_logomark.png"
            class="hidden md:block w-66 h-66 p-3 box-border bg-blue-100-alpha"
          >
          <div class="text-white box-border ml-4 h-66">
            <h1 class="m-0 md:mt-24 flex flex-col items-start bg-gray-200-alpha">
              <metaspace class="w-auto md:h-18 box-border py-1" />
            </h1>
            <p class="text-2xl leading-7 m-0 pt-3 h-18 box-border bg-blue-200-alpha">
              The platform for metabolite annotation
              <br>
              of imaging mass spectrometry data
            </p>
          </div>
        </div>
      </div>
      <code class="mt-3">baseline-grid-6</code>
    </div>
  </content-page>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api'

import ContentPage from '../components/ContentPage.vue'
import ColourSwatch from './ColourSwatch.vue'
import WidthDemo from './WidthDemo.vue'
import MeasureDemo from './MeasureDemo.vue'
import TextDemo from './TextDemo.vue'

import Metaspace from '../assets/inline/METASPACE.svg'

import tailwindConfig from '../../tailwind.config'

export default defineComponent({
  components: {
    ContentPage,
    ColourSwatch,
    WidthDemo,
    MeasureDemo,
    TextDemo,
    Metaspace,
  },
  setup() {
    return {
      ...tailwindConfig.theme.extend,
    }
  },
})
</script>
<style scoped>
nav li {
  margin-top: 0;
}
code {
  @apply text-lg;
}
</style>
