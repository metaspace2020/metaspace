<template>
  <div class="sm-content-page flex-grow">
    <h1 class="pb-6">
      Design docs
    </h1>
    <!-- <h2>Contents</h2> -->
    <ul class="list-none text-sm leading-5 sm-contents-list">
      <li>
        <a href="#fonts">Fonts</a>
      </li>
      <li>
        <a href="#leading-tracking">Leading & tracking</a>
      </li>
      <li>
        <a href="#colours">Colours</a>
      </li>
      <li>
        <a href="#spacing">Spacing</a>
      </li>
      <li>
        <a href="#measure">Measure</a>
      </li>
    </ul>
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
    <div class="text-xs leading-4 tracking-wide">
      <table class="w-full max-w-measure-4 mb-2">
        <tbody>
          <tr>
            <td>text-xs leading-4 tracking-wide</td>
            <td class="text-right">
              12px / 16px
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      </p>
    </div>
    <div class="text-sm leading-5">
      <table class="w-full max-w-measure-4 mb-4">
        <tbody>
          <tr>
            <td>text-sm leading-5</td>
            <td class="text-right">
              14px / 20px
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      </p>
    </div>
    <div class="text-base leading-6">
      <table class="w-full max-w-measure-4 mb-4">
        <tbody>
          <tr>
            <td>text-base leading-6</td>
            <td class="text-right">
              16px / 24px
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
      </p>
    </div>
    <table class="w-full text-2xl font-medium leading-tight tracking-snug">
      <tbody>
        <tr>
          <td>text-2xl font-medium leading-tight tracking-snug</td>
          <td class="text-right">
            24px / 30px
          </td>
        </tr>
      </tbody>
    </table>
    <p class="text-2xl font-medium leading-tight tracking-snug">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
    </p>
    <table class="w-full text-4xl font-medium leading-none tracking-tight">
      <tbody>
        <tr>
          <td>text-4xl font-medium leading-none tracking-tight</td>
          <td class="text-right">
            36px / 36px
          </td>
        </tr>
      </tbody>
    </table>
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
      Additions to the Tailwind scale based on multiples of size 6/1.5rem/24px, as this is the base line height.
    </p>
    <div class="w-3/4">
      <width-demo
        width-class="w-9"
        name="9"
        definition="1.5 * 1.5rem = 2.25rem"
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
    <div>
      <width-demo
        width-class="w-full text-xs max-w-measure-1"
        name="max-w-measure-1"
        :definition="maxWidth['measure-1']"
      />
      <width-demo
        width-class="w-full text-xs max-w-measure-2"
        name="max-w-measure-2"
        :definition="maxWidth['measure-2']"
      />
      <width-demo
        width-class="w-full text-xs max-w-measure-3"
        name="max-w-measure-3"
        :definition="maxWidth['measure-3']"
      />
      <width-demo
        width-class="w-full text-xs max-w-measure-4"
        name="max-w-measure-4"
        :definition="maxWidth['measure-4']"
      />
      <width-demo
        width-class="w-full text-xs max-w-measure-5"
        name="max-w-measure-5"
        :definition="maxWidth['measure-5']"
      />
    </div>
  </div>
</template>
<script lang="ts">
import '../modules/App/content.css'
import { defineComponent } from '@vue/composition-api'

import ColourSwatch from './ColourSwatch.vue'
import WidthDemo from './WidthDemo.vue'

import tailwindConfig from '../../tailwind.config'

export default defineComponent({
  components: {
    ColourSwatch,
    WidthDemo,
  },
  setup() {
    return {
      ...tailwindConfig.theme.extend,
    }
  },
})
</script>
<style scoped>
.sm-contents-list li {
  margin-top: 0;
}
</style>
