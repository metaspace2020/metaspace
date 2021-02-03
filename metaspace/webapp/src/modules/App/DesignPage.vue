<template>
  <div class="sm-content-page flex-grow">
    <h1>Design docs</h1>
    <h2>Contents</h2>
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
    <p>
      Could consider applying these as standard.
    </p>
    <table class="w-1/2">
      <tbody>
        <tr class="text-xs leading-4 tracking-wide">
          <td>text-xs leading-4 tracking-wide</td>
          <td class="text-right">
            12px / 16px
          </td>
        </tr>
      </tbody>
    </table>
    <p class="text-xs leading-4 tracking-wide max-w-measure-1">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
    </p>
    <table class="w-1/2">
      <tbody>
        <tr class="text-sm leading-5">
          <td>text-sm leading-5</td>
          <td class="text-right">
            14px / 20px
          </td>
        </tr>
      </tbody>
    </table>
    <p class="text-sm leading-5">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
    </p>
    <table class="w-1/2">
      <tbody>
        <tr class="text-base leading-6">
          <td>text-base leading-6</td>
          <td class="text-right">
            16px / 24px
          </td>
        </tr>
      </tbody>
    </table>
    <p class="text-base leading-6">
      Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
      Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
    </p>
    <h2 id="colours">
      Colours
    </h2>
  </div>
</template>
<script lang="ts">
import './content.css'
import { defineComponent } from '@vue/composition-api'

export default defineComponent({
  // setup() {
  // },
})
</script>
<style scoped>
.sm-contents-list li {
  margin-top: 0;
}
</style>
