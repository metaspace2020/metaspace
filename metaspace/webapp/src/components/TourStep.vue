<template>
  <div ref="hscontainer">
    <div class="hopscotch-bubble-container" :style="bubbleStyle">
      <span class="hopscotch-bubble-number" v-if="tour.isTour">
        {{ i18n.stepNum }}
      </span>

      <div class="hopscotch-bubble-content">
        <h3 class="hopscotch-title" v-if="step.title !== ''">
          {{ step.title }}
        </h3>
        <div class="hopscotch-content" v-if="step.content !== ''"
             v-html="step.content">
        </div>
      </div>

      <div class="hopscotch-actions">
        <button class="hopscotch-nav-button prev hopscotch-prev" v-if="buttons.showPrev">
          {{ i18n.prevBtn }}
        </button>
        <button class="hopscotch-nav-button next hopscotch-cta" v-if="buttons.showCTA">
          {{ buttons.ctaLabel }}
        </button>
        <el-button class="hopscotch-next" v-if="buttons.showNext"
                   size="small" type="primary">
          {{ i18n.nextBtn }}
        </el-button>
      </div>

      <i class="el-icon-circle-close hopscotch-close" v-if="buttons.showClose"
         :title="i18n.closeTooltip">
      </i>
    </div>

    <div class="hopscotch-bubble-arrow-container hopscotch-arrow">
      <div class="hopscotch-bubble-arrow-border"></div>
      <div class="hopscotch-bubble-arrow"></div>
    </div>
  </div>
</template>

<script>
 export default {
   name: 'tour-step',
   props: ['i18n', 'step', 'tour', 'buttons'],
   computed: {
     bubbleStyle() {
       return {
         width: this.step.width + 'px',
         padding: this.step.padding + 'px'
       }
     }
   }
 };
</script>

<style lang="less">
 @import "~hopscotch/src/less/util.less";
 @import "~hopscotch/src/less/vars.less";

 @borderColor: lightblue;
 @bubbleBorderWidth: 3px;
 @bubbleColor: #eff;
 @bubbleFontFamily: Roboto, Helvetica, Arial;

 @import "~hopscotch/src/less/fade.less";
 @import "~hopscotch/src/less/buttons.less";
 @import "~hopscotch/src/less/core.less";

 i.hopscotch-close {
   position: absolute;
   padding: 10px 10px 0 0;
   top: 0;
   right: 0;
 }

</style>
