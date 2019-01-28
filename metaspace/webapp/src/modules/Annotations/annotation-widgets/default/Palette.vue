<template>
  <span id="scale-bar-settings">
    <el-form>
      <el-form-item label="Scale bar color">
        <el-select :value="pickedColor"
                   style="width: 120px;"
                   title="Scale_bar_color"
                   @input="handlerClick">
          <el-option v-for="color in paletteColors"
                     :value="color.colorName" :label="color.colorName" :key="color.code">
          </el-option>
        </el-select>
        <el-form-item>
          <el-checkbox @click="$event.stopPropagation()" @input="setBarVisibility">Disable</el-checkbox>
        </el-form-item>
      </el-form-item>
    </el-form>
  </span>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Component } from 'vue-property-decorator';

  interface colorObjType {
    code: string,
    colorName: string
  }

  @Component({name: 'palette'})
  export default class Palette extends Vue {
    paletteColors: colorObjType[] = [{
        code: '#000000',
        colorName: "Black"
      }, {
        code: '#FFFFFF',
        colorName: 'White'
      }, {
        code: '#999999',
        colorName: "Gray"
      }];
    disableBar = false;
    pickedColor: string = this.paletteColors[0].colorName;

    setBarVisibility() {
      this.disableBar = !this.disableBar;
      this.$emit('toggleScaleBar')
    }

    handlerClick(c: string) {
      this.pickedColor = c;
      let colorObj: colorObjType | undefined = this.paletteColors.find(el => {
        return el.colorName === c;
      });
      if (colorObj !== undefined) {
        this.$emit('colorInput', colorObj)
      }
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