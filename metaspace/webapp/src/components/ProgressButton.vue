<template>
  <div class="el-button" :style="buttonStyle" @click="$emit('click')">
    <div :style="progressStyle"></div>
    <div :style="textStyle"><slot></slot></div>
  </div>
</template>

<script>
 export default {
   name: 'progress-button',
   props: ['width', 'height', 'percentage'],
   computed: {
     buttonStyle() {
       return {
         width: this.width + 'px',
         height: this.height + 'px',
         padding: 0,
       };
     },
     textStyle() {
       return Object.assign({
         'z-index': 2,
         'position': 'absolute',
         'display': 'flex',
         'flex-direction': 'column',
         'justify-content': 'center'
       }, this.buttonStyle);
     },
     progressStyle() {
       return {
         'background-color': 'rgb(152, 255, 152)',
         'width': ((this.width - 2) * this.percentage / 100.0) + 'px',
         height: (this.height - 2) + 'px',
         position: 'absolute',
         'z-index': 1
       };
     }
   }

 }
</script>
