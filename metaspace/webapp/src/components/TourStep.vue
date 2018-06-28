<template>
  <div>
    <div ref="container" class="ts-container" v-if="tour">
      <div class="bubble-container">
        <el-progress :percentage="100 * (stepNum + 1) / tour.steps.length"
                     :stroke-width=10
                     :show-text=false
                     style="width: 350px;">
        </el-progress>

        <div class="bubble-content">
          <h3 class="ts-title" v-if="step.title !== ''">
            {{ step.title }}
          </h3>
          <div class="ts-content" v-if="step.content !== ''"
               v-html="step.content">
          </div>
        </div>

        <div class="ts-actions">
          <el-button v-if="this.stepNum > 0" size="small"
                     @click.native="prevStep">
            Back
          </el-button>

          <el-button size="small" type="primary" @click.native="nextStep">
            {{ this.stepNum == this.tour.steps.length - 1 ? 'Done' : 'Next' }}
          </el-button>
        </div>

        <i class="el-icon-circle-close ts-close" title="Close"
           @click="close"></i>
      </div>

      <div class="popper__arrow" x-arrow=''> </div>
    </div>
  </div>
</template>

<script>
 import Vue from 'vue';
 import Popper from 'popper.js';

 import router from '../router';

 const startingRoute = 'help';

 export default {
   name: 'tour-step',
   props: ['tour'],
   data() {
     return {
       lastRoute: startingRoute,
       stepNum: 0,
       popper: null,
       container: null,
       routeTransition: false
     };
   },
   computed: {
     step() {
       if (!this.tour)
         return null;
       return this.tour.steps[this.stepNum];
     }
   },
   created() {
     router.beforeEach((to, from, next) => {
       if (!this.tour || to.path == from.path) {
         next();
         return;
       }

       if (this.routeTransition) {
         this.routeTransition = false;
         next();
       } else {
         this.close();
         next();
       }
     });
   },
   mounted() {
     if (this.tour)
       this.render();
   },
   updated() {
     if (this.tour)
       this.render();
   },
   methods: {
     nextStep() {
       this.stepNum += 1;
       if (this.tour.steps.length == this.stepNum) {
         this.close();
         return;
       }

       this.popper.destroy();
       this.render();
     },

     prevStep() {
       if (this.stepNum == 0)
         return; // shouldn't happen
       this.stepNum -= 1;
       this.popper.destroy();
       this.render();
     },

     render() {
       // FIXME: simplify the logic here and make it more universal
       if (this.step.route && this.lastRoute != this.step.route) {
         this.lastRoute = this.step.route;
         this.routeTransition = true;
         if (this.step.query)
           router.push({path: this.lastRoute, query: this.step.query});
         else
           router.push({path: this.lastRoute});
       } else if (this.step.query) {
         router.replace({query: this.step.query});
       }

       const minTimeout = 20 /* ms */,
             maxTimeout = 2000,
             factor = 2;

       let self = this,
           timeout = minTimeout;

       function showStep() {
         let el = document.querySelector(self.step.target);
         if (!el) {
           timeout *= factor;
           if (timeout > maxTimeout)
             return;
           window.setTimeout(showStep, timeout);
           return;
         }

         self.popper = new Popper(el, self.$refs.container,
                                  {placement: self.step.placement});
       }

       Vue.nextTick(() => {
         window.setTimeout(showStep, timeout);
       });
     },

     close() {
       if (this.popper)
         this.popper.destroy();
       this.stepNum = 0;
       this.lastRoute = startingRoute;
       this.routeTransition = false;
       this.$store.commit('endTour');
     }
   }
 };
</script>

<style lang="scss">

 .ts-actions {
   display: flex;
   justify-content: flex-end;
 }

 $popper-background-color: rgba(250, 250, 250, 0.95);
 $popper-border-color: #ddddce;
 $popper-arrow-color: black;

 .ts-container {
   background: $popper-background-color;
   color: black;
   width: 400px;
   padding: 10px;
   border-radius: 3px;
   z-index: 10100;
   box-shadow: 1px 1px 0px rgba(0, 0, 0, 0.1);
   border: 2px solid $popper-border-color;
   font-size: 14px;

   .ts-close {
     position: absolute;
     top: 8px;
     right: 8px;
     color: black;
     background: transparent;
     border: none;

     &:active,
     &:focus {
       outline: none;
     }
   }

   .popper__arrow {
     width: 0;
     height: 0;
     border-style: solid;
     position: absolute;
     margin: 5px;
   }

   &[x-placement^="top"] {
     margin-bottom: 5px;

     .popper__arrow {
       border-width: 5px 5px 0 5px;
       border-color: $popper-arrow-color transparent transparent transparent;
       bottom: -5px;
       left: calc(50% - 5px);
       margin-top: 0;
       margin-bottom: 0;
     }
   }

   &[x-placement^="bottom"] {
     margin-top: 5px;

     .popper__arrow {
       border-width: 0 5px 5px 5px;
       border-color: transparent transparent $popper-arrow-color transparent;
       top: -5px;
       left: calc(50% - 5px);
       margin-top: 0;
       margin-bottom: 0;
     }
   }

   &[x-placement^="right"] {
     margin-left: 5px;

     .popper__arrow {
       border-width: 5px 5px 5px 0;
       border-color: transparent $popper-arrow-color transparent transparent;
       left: -5px;
       top: calc(50% - 5px);
       margin-left: 0;
       margin-right: 0;
     }
   }

   &[x-placement^="left"] {
     margin-right: 5px;

     .popper__arrow {
       border-width: 5px 0 5px 5px;
       border-color: transparent transparent transparent $popper-arrow-color;
       right: -5px;
       top: calc(50% - 5px);
       margin-left: 0;
       margin-right: 0;
     }
   }
 }
</style>
