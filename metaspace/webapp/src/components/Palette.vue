<template>
  <div class="colors-wrapper">
    <ul class="colors-list">
      <li
        class="color-item"
        v-for="c in paletteColors"
        :key="c"
        :aria-label="'Color:' + c"
        :class="{'color-item-white': c === '#FFFFFF', 'color-item-transparent': c === 'transparent'}"
        :style="{background: c}"
        title="Click to change the color"
        @click="handlerClick(c)">
        <div class="chosen-color-dot" v-show="c === pick"></div>
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component } from 'vue-property-decorator';

  @Component({name: 'palette'})
  export default class Palette extends Vue {
    pick: string = '#000000';

    paletteColors: string[] = ['transparent', '#FFFFFF', '#999999', '#000000'];

    handlerClick(c: string) {
      this.pick = c;
      this.$emit('colorInput', c)
    }
  }
</script>

<style scoped>
  .colors-wrapper {
    position: absolute;
    margin-top: 10px;
    padding-top: 5px;
    padding-left: 5px;
    border-radius: 2px;
    box-shadow: 0 2px 10px rgba(0,0,0,.12), 0 2px 5px rgba(0,0,0,.16);
    background-color: #fff;
  }

  .colors-list {
    overflow: hidden;
    padding: 0;
    margin: 0;
  }

  .color-item {
    list-style: none;
    width: 15px;
    height: 15px;
    float: left;
    margin-right: 5px;
    margin-bottom: 5px;
    position: relative;
    cursor: pointer;
    overflow: hidden;
  }

  .color-item-white, .color-item-transparent {
    border: 1px solid #ddd;
  }

  .color-item-transparent::after {
    position: absolute;
    content: "";
    right: 0; left: -40%;
    border-top: 1px solid red;
    transform: rotate(-45deg);
    transform-origin: 100% 0;
  }

  .color-item-white .chosen-color-dot {
    background: #000;
  }

  .color-item-transparent .chosen-color-dot {
    background: #000;
  }

  .chosen-color-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    bottom: 5px;
    left: 5px;
    border-radius: 50%;
    opacity: 1;
    background: #fff;
    z-index: 3;
  }
</style>