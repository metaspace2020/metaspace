<template>
  <div>
    <div ref="container" class="nf-container" v-show="activeFeature != null">
      <div v-if="activeFeature != null">
        <div class="nf-container-corner-tag">NEW FEATURE!</div>
        <div class="bubble-container">
          <div class="bubble-content">
            <h3 v-if="activeFeature.title !== ''">
              {{ activeFeature.title }}
            </h3>
            <div v-html="activeFeature.contentHtml">
            </div>
          </div>

          <div class="nf-actions">
            <el-button size="small" @click="remindMeLater">
              Remind me later
            </el-button>

            <el-button size="small" type="primary" @click.native="dismissCurrentFeature">
              Got it!
            </el-button>
          </div>

        </div>

        <div class="popper__arrow" x-arrow=''> </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import Popper, {Placement} from 'popper.js';

  import config from '../../config';
  import Component from 'vue-class-component';
  import {debounce, isArray} from 'lodash-es';
  import {getLocalStorage, setLocalStorage} from '../../lib/localStorage';

  interface FeatureSpec {
    name: string;
    title: string;
    contentHtml: string;
    dontShowAfter: Date;
    placement: Placement;
    getAnchorIfActive: (vue: Vue) => HTMLElement | null;
  }

  const STORAGE_KEY = 'dismissedFeaturePopups';

  const NEW_FEATURES: FeatureSpec[] = [
    {
      name: 'offSample',
      title: 'Off-Sample Prediction',
      contentHtml: `
<p>We've trained a deep learning model to filter out annotations which represent molecules localized in the off-sample area,
such as those corresponding to the MALDI matrix. You can now hide these annotations from the results,
allowing you to find important molecules faster.</p>
<p>Add the <u style="white-space: nowrap;">Show/hide off-sample annotations</u> filter to try it out.</p>
<p>Please keep in mind that the accuracy of this model is greatly improved in datasets that include some off-sample area.
We recommend including off-sample area around your sample during data acquisition.</p>
      `,
      dontShowAfter: new Date('2019-07-22'),
      placement: 'bottom',
      getAnchorIfActive(vue: Vue) {
        if (config.features.off_sample && vue.$route.path === '/annotations') {
          return document.querySelector('.tf-outer[data-test-key=offSample]')
            || document.querySelector('.filter-select');
        }
        return null;
      },
    },
    {
      name: 'logScale',
      title: 'Log-scale colormaps',
      contentHtml: `
<p>Ion images can now be viewed with a logarithmic-scale colormap. The colormap can be configured in this menu.</p>
      `,
      dontShowAfter: new Date('2019-08-22'),
      placement: 'bottom',
      getAnchorIfActive(vue: Vue) {
        if (config.features.off_sample && vue.$route.path === '/annotations') {
          return document.querySelector('[data-feature-anchor="ion-image-settings"]');
        }
        return null;
      },
    },
  ];


  @Component({})
  export default class NewFeaturePopup extends Vue {
    activeFeature: FeatureSpec | null = null;
    lastPopperAnchor: HTMLElement | null = null;
    popper: Popper | null = null;
    mutationObserver!: MutationObserver;
    sessionDismissedFeatures: string[] = [];

    mounted() {
      this.checkForPopups = debounce(this.checkForPopups, 100);
      this.mutationObserver = new MutationObserver(() => { this.checkForPopups() });
      // Ignore DOM elements outside of #app - it's unlikely that features will care about e.g. elements inside dialogs or tooltips
      this.mutationObserver.observe(document.querySelector('#app')!, {
        childList: true,
        subtree: true,
      });
    }
    beforeDestroy() {
      this.mutationObserver.disconnect();
      this.close();
    }

    getStorageDismissedFeatures() {
      try {
        const list = getLocalStorage(STORAGE_KEY);
        if (isArray(list)) {
          // Filter out invalid/old entries
          return list.filter(item => NEW_FEATURES.some(f => f.name === item));
        } else {
          return []
        }
      } catch (ex) {
        return [];
      }

    }

    getDismissedFeatures() {
      return [...this.getStorageDismissedFeatures(), ...this.sessionDismissedFeatures];
    }

    close() {
      this.activeFeature = null;

      if (this.popper != null) {
        this.popper.destroy();
        this.popper = null;
      }
    }

    remindMeLater() {
      if (this.activeFeature != null) {
        this.sessionDismissedFeatures.push(this.activeFeature.name);
        this.close();
      }
    }

    dismissCurrentFeature() {
      const activeFeatureName = this.activeFeature && this.activeFeature.name;
      // Close before updating localStorage, in case of error updating localStorage.
      this.close();

      if (activeFeatureName != null) {
        const currentFeatureStatus = this.getStorageDismissedFeatures();
        setLocalStorage(STORAGE_KEY, [...currentFeatureStatus, activeFeatureName]);
      }
    }

    checkForPopups() {
      if (this.$refs.container != null) {
        const dismissedFeatures = this.getDismissedFeatures();
        const activatableFeatures = NEW_FEATURES
          .filter(feature => !dismissedFeatures.includes(feature.name))
          .map(feature => [feature, feature.getAnchorIfActive(this)] as [FeatureSpec, HTMLElement | null])
          .filter(([feature, anchor]) => anchor != null);

        if (activatableFeatures.length > 0) {
          const [feature, anchor] = activatableFeatures[0];
          this.activeFeature = feature;
          if (anchor != this.lastPopperAnchor && this.popper != null) {
            this.popper.destroy();
          }

          this.popper = new Popper(anchor!, this.$refs.container as Element, { placement: feature.placement });
          this.lastPopperAnchor = anchor;
        } else if (this.activeFeature != null) {
          this.close();
        }
      }
    }
  }
</script>

<style lang="scss">

  .nf-actions {
    display: flex;
    justify-content: flex-end;
  }

  $popper-background-color: rgba(250, 250, 250, 0.98);
  $popper-border-color: #ddddce;
  $popper-arrow-color: black;

  .nf-container {
    background: $popper-background-color;
    color: black;
    width: 400px;
    padding: 10px;
    border-radius: 3px;
    margin: 5px;
    z-index: 10100;
    box-shadow: 1px 1px 0px rgba(0, 0, 0, 0.1);
    border: 2px solid $popper-border-color;
    font-size: 14px;

    .popper__arrow {
      width: 0;
      height: 0;
      border-style: solid;
      position: absolute;
      margin: 5px;
    }

    &[x-placement^="top"] {
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

  .nf-container-corner-tag {
    position: absolute;
    top: 0;
    right: 0;
    padding: 5px;
    font-weight: bold;
    background-color: orangered;
    color: white;
  }
</style>
