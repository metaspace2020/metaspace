<template>
  <div>
    <div
      v-if="tour"
      ref="container"
      class="tour-popover-wrapper el-popover el-popper el-popover--plain max-w-sm leading-5 p-5 text-left relative"
    >
      <div class="h-5 pr-8 flex items-center">
        <el-progress
          class="w-full"
          :percentage="progress"
          :stroke-width="10"
          :show-text="false"
        />
      </div>
      <h3 v-if="title !== ''" class="leading-10 m-0 mt-5">{{ title }}</h3>
      <component
        ref="mdRef"
        :is="step"
        v-if="step"
        class="ts-content"
      />
      <div class="h-10 mt-5 flex justify-end items-center">
        <el-button v-if="stepNum > 0" :key="title + '-back'" size="small" @click="prevStep">
          Back
        </el-button>
        <el-button :key="title + '-next'" size="small" type="primary" @click="nextStep">
          {{ stepNum == tour.steps.length - 1 ? 'Done' : 'Next' }}
        </el-button>
      </div>
      <button class="button-reset ts-close" title="Exit tour" @click="close">
        <CloseIcon class="fill-current h-6 w-6 leading-6 block" />
      </button>
      <div id="arrow" data-popper-arrow></div>
    </div>
  </div>
</template>

<script>
import {defineComponent, ref, watch, onMounted, nextTick, defineAsyncComponent, computed} from 'vue';
import { useRouter} from 'vue-router';
import {useStore} from 'vuex';
import {ElProgress, ElButton} from 'element-plus';
import {createPopper} from '@popperjs/core';
import Upload from '../../tours/intro/steps/00-upload.md';

const CloseIcon = defineAsyncComponent(() =>
  import('../../assets/inline/refactoring-ui/icon-close-circle.svg')
);

export default defineComponent({
  name: 'TourStep',
  components: {
    ElProgress,
    ElButton,
    CloseIcon,
    Upload,
  },
  props: ['tour'],
  setup(props) {
    const store = useStore();
    const router = useRouter()
    const mdRef = ref(null)

    const lastRoute = ref('help');
    const stepNum = ref(0);
    const container = ref(null);
    const routeTransition = ref(false);
    const popperInstance = ref(null);
    const step = computed(() => props.tour?.steps ? props.tour.steps[stepNum.value] : null);
    const progress = computed(() => 100 * (stepNum.value + 1) / props.tour.steps?.length);
    const tourAux = computed(() => props.tour);
    const title = computed(() => mdRef.value?.frontmatter?.title);


    watch(tourAux, async() => {
      renderPopper();
    })

    // watch(() => route.path, (to, from) => {
    //   if (!props.tour || to === from) return;
    //
    //   if (routeTransition.value) {
    //     routeTransition.value = false;
    //   } else {
    //     close();
    //   }
    // });

    const nextStep = () => {
      stepNum.value++;
      if (props.tour.steps?.length === stepNum.value) {
        close();
        return;
      }
      popperInstance.value?.destroy();
      renderPopper();
    };

    const prevStep = () => {
      if (stepNum.value === 0) return; // Shouldn't happen
      stepNum.value--;
      popperInstance.value?.destroy();
      renderPopper();
    };

    const close = () => {
      popperInstance.value?.destroy();
      stepNum.value = 0;
      lastRoute.value = 'help';
      routeTransition.value = false;
      store.commit('endTour');
    };

    const renderPopper = async() => {
      await nextTick();
      const meta = mdRef.value?.frontmatter;
      if(!meta) return
      if(meta.route && meta.route !== router.currentRoute?.value?.path){
        await router.push({
          path: meta.route,
          query: meta.query,
        })
      }

      await nextTick();
      await new Promise(resolve => setTimeout(resolve, 500));
      await nextTick();

      const targetElement = document.querySelector(meta.target);
      const arrow = document.querySelector('#arrow');

      console.log('targetElement', meta.target, targetElement)

      if (targetElement && container.value) {
        popperInstance.value = createPopper(targetElement, container.value, {
          placement: meta.placement,
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 8], // Adjusts the offset of the popover from the button
              },
            },
            {
              name: 'arrow', // Enables the arrow modifier
              options: {
                element: arrow, // Tells Popper.js which element is the arrow
              },
            },
          ],
        });
      }
    };

    onMounted(() => {
      if (props.tour) renderPopper();
    });

    return {mdRef, title, stepNum, step, close, nextStep, prevStep, progress, container};
  },
});
</script>

<style lang="scss" scoped>

.tour-popover-wrapper {
  z-index: 10100 !important;
}

#arrow {
  position: absolute;
  background-color: #fff;
  top: -8px
}

/* Positioning for the arrow */
[data-popper-arrow]::before {
  content: "";
  position: absolute;
  top: 3px;
  width: 10px;
  height: 10px;
  background-color: inherit;
  transform: rotate(45deg);
}

::v-deep(.ts-close) {
  @apply rounded-full text-gray-700;
  position: absolute;
  top: 18px;
  right: 14px;

  &:active,
  &:focus {
    outline: none;
  }

  svg .primary {
    fill: none;
  }

  &:hover,
  &:focus {
    @apply text-blue-700;
    svg .primary {
      @apply fill-current text-blue-100;
    }
  }
}

::v-deep(.ts-content) {
  > * {
    margin: 0;
  }

  > * + *,
  ul > li + li {
    @apply mt-5;
  }

  ul, ol {
    @apply pl-4;
  }

  sub {
    line-height: 1;
  }
}
</style>
