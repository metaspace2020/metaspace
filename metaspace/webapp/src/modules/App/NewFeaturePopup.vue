<template>
  <div>
    <div
      v-show="activeFeature != null"
      ref="container"
      class="el-popover el-popper el-popover--plain max-w-sm leading-5 p-5 text-left"
    >
      <div v-if="activeFeature != null">
        <h3 class="leading-10 m-0 mt-2">
          <el-badge
            value="New"
            class="test"
          >
            {{ activeFeature.title }}
          </el-badge>
        </h3>
        <div
          class="content"
          v-html="activeFeature.contentHtml"
        />
        <div class="flex justify-end items-center h-10 mt-5">
          <el-button
            size="small"
            @click="remindMeLater"
          >
            Remind me later
          </el-button>

          <el-button
            size="small"
            type="primary"
            @click.native="dismissCurrentFeature"
          >
            Got it!
          </el-button>
        </div>
        <div
          class="popper__arrow"
          x-arrow=""
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import Popper, { Placement } from 'popper.js'

import Component from 'vue-class-component'
import { debounce, isArray } from 'lodash-es'
import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'

  interface FeatureSpec {
    name: string;
    title: string;
    contentHtml: string;
    dontShowAfter: Date;
    placement: Placement;
    getAnchorIfActive: (vue: Vue) => HTMLElement | null;
  }

const STORAGE_KEY = 'dismissedFeaturePopups'

const NEW_FEATURES: FeatureSpec[] = [
  {
    name: 'isomersIsobars',
    title: 'Isomers and isobars',
    contentHtml: `
<p>METASPACE now warns about isomeric and isobaric ambiguity.</p>
<p>This icon <span class='danger-icon'></span> indicates that for this annotation,
there are other isomers and/or isobars annotated. These are listed in the <b>Molecules</b> section.</p>
<p>In case of isobaric annotations, the <b>Diagnostics</b> section allows for comparisons
between overlapping annotations to help determine which annotation is more likely
based on their isotopic patterns and images.
The ion formulas of isomers and isobars are also available in the regular CSV export.</p>
      `,
    dontShowAfter: new Date('2020-05-30'),
    placement: 'top',
    getAnchorIfActive(vue: Vue) {
      if (vue.$route.path === '/annotations') {
        return document.querySelector('.ambiguity-alert-icon')
      }
      return null
    },
  },
  {
    name: 'medianCosineColoc',
    title: 'Improved Colocalization Algorithm',
    contentHtml: `
<p>The <b>median-thresholded cosine distance</b> gives better results than the plain cosine distance when compared to
expert judgements.
See <a href="https://doi.org/10.1093/bioinformatics/btaa085" target="blank">Ovchinnikova et al. (2020) ColocML</a>
for more information.</p>
<p>This new algorithm is now used by default for ranking colocalized annotations.
If you wish to go back to the old behavior, <b>cosine distance</b> can be selected in this menu.</p>
      `,
    dontShowAfter: new Date('2020-05-30'),
    placement: 'bottom',
    getAnchorIfActive(vue: Vue) {
      if (vue.$route.path === '/annotations' && document.querySelector('#new-feature-popup-coloc') != null) {
        return document.querySelector('#colocalization-settings-icon')
      }
      return null
    },
  },
]

@Component({})
export default class NewFeaturePopup extends Vue {
    activeFeature: FeatureSpec | null = null;
    lastPopperAnchor: HTMLElement | null = null;
    popper: Popper | null = null;
    mutationObserver!: MutationObserver;
    sessionDismissedFeatures: string[] = [];

    mounted() {
      this.checkForPopups = debounce(this.checkForPopups, 100)
      this.mutationObserver = new MutationObserver(() => { this.checkForPopups() })
      // Ignore DOM elements outside of #app - it's unlikely that features will care about e.g. elements inside dialogs or tooltips
      this.mutationObserver.observe(document.querySelector('#app')!, {
        childList: true,
        subtree: true,
      })
    }

    beforeDestroy() {
      this.mutationObserver.disconnect()
      this.close()
    }

    getStorageDismissedFeatures() {
      try {
        const list = getLocalStorage(STORAGE_KEY)
        if (isArray(list)) {
          // Filter out invalid/old entries
          return list.filter(item => NEW_FEATURES.some(f => f.name === item))
        } else {
          return []
        }
      } catch (ex) {
        return []
      }
    }

    getDismissedFeatures() {
      return [...this.getStorageDismissedFeatures(), ...this.sessionDismissedFeatures]
    }

    close() {
      this.activeFeature = null

      if (this.popper != null) {
        this.popper.destroy()
        this.popper = null
      }
    }

    remindMeLater() {
      if (this.activeFeature != null) {
        this.sessionDismissedFeatures.push(this.activeFeature.name)
        this.close()
      }
    }

    dismissCurrentFeature() {
      const activeFeatureName = this.activeFeature && this.activeFeature.name
      // Close before updating localStorage, in case of error updating localStorage.
      this.close()

      if (activeFeatureName != null) {
        const currentFeatureStatus = this.getStorageDismissedFeatures()
        setLocalStorage(STORAGE_KEY, [...currentFeatureStatus, activeFeatureName])
      }
    }

    checkForPopups() {
      if (this.$refs.container != null) {
        const dismissedFeatures = this.getDismissedFeatures()
        const activatableFeatures = NEW_FEATURES
          .filter(feature => !dismissedFeatures.includes(feature.name))
          .filter(feature => feature.dontShowAfter > new Date())
          .map(feature => [feature, feature.getAnchorIfActive(this)] as [FeatureSpec, HTMLElement | null])
          .filter(([feature, anchor]) => anchor != null)

        if (activatableFeatures.length > 0) {
          const [feature, anchor] = activatableFeatures[0]
          this.activeFeature = feature
          if (anchor !== this.lastPopperAnchor && this.popper != null) {
            this.popper.destroy()
          }

          this.popper = new Popper(anchor!, this.$refs.container as Element, { placement: feature.placement })
          this.lastPopperAnchor = anchor
        } else if (this.activeFeature != null) {
          this.close()
        }
      }
    }
}
</script>

<style scoped>
  /deep/ .content > * {
    margin: 0;
  }
  /deep/ .content > * + * {
    @apply mt-5;
  }
</style>
