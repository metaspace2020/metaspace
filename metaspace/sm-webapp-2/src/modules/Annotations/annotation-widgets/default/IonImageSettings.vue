<template>
  <span id="ion-image-settings">
    <el-form label-position="top">
      <el-form-item
        label="Intensity scaling"
        data-feature-anchor="ion-image-color-scale"
      >
        <el-select
          :model-value="scaleType"
          style="width: 300px;"
          :teleported="false"
          @change="onScaleTypeChange"
        >
          <el-option
            value="linear"
            label="Linear"
          />
          <el-option
            value="linear-full"
            label="Linear (without hot-spot removal)"
          />
          <el-option
            value="log"
            label="Logarithmic"
          />
          <el-option
            value="log-full"
            label="Logarithmic (without outlier clipping)"
          />
          <el-option
            value="hist"
            label="Equalized histogram"
          />
        </el-select>
      </el-form-item>
      <el-form-item
        v-if="showIntensityTemplate"
        data-feature-anchor="global-intensity-lock"
      >
        <template v-slot:label>
          <el-popover
            trigger="hover"
            placement="right"
          >
            <template v-slot:reference>
              <div >
            Intensity lock
            <new-feature-badge feature-key="template-intensity-lock">
              <i class="el-icon-question cursor-pointer ml-1" />
            </new-feature-badge>
          </div>
            </template>
          <div class="max-w-xs">
            Apply intensities range of one dataset to all other datasets.
          </div>
        </el-popover>
        </template>
        <el-select
          :model-value="selectedTemplate"
          style="width: 300px;"
          clearable
          placeholder="Choose the template dataset"
          :teleported="false"
          @change="onTemplateChange"
          @clear="onTemplateChange"
        >
          <el-option
            v-for="item in lockTemplateOptions"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          >
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item
        v-if="!hideNormalization"
        label=""
      >
        <el-checkbox
          :checked="normalization"
          @change="onNormalizationChange"
          :teleported="false"
        >
          <div class="font-thin flex flex-row items-center">
            TIC normalization
            <el-popover
              trigger="hover"
              placement="right"
            >
              <template v-slot:reference>
                <div>
                  <i class="el-icon-question cursor-pointer ml-1" />
                </div>
              </template>
              <div class="max-w-xs">
                This ion image was TIC-normalized.
                The intensities were divided by the TIC value and then scaled by multiplying by 1e+6.
              </div>
            </el-popover>
          </div>
        </el-checkbox>
      </el-form-item>
      <el-form-item label="Colormap">
        <el-select
          :model-value="colormap"
          style="width: 150px;"
          :teleported="false"
          @change="onColormapChange"
        >
          <el-option-group>
            <el-option
              v-for="scale in availableScales"
              :key="scale"
              class="flex items-center pr-5 py-2"
              :value="scale"
              :label="scale"
            >
              <color-bar
                class="h-full w-full"
                :map="scale"
                horizontal
              />
            </el-option>
          </el-option-group>
          <el-option-group label="Inverted">
            <el-option
              v-for="scale in availableScales"
              :key="'-' + scale"
              class="flex items-center pr-5 py-2"
              :value="'-' + scale"
              :label="scale"
            >
              <color-bar
                class="h-full w-full"
                :map="'-' + scale"
                horizontal
              />
            </el-option>
          </el-option-group>
        </el-select>
      </el-form-item>
      <el-form-item label="Scale bar color">
        <el-select
          :model-value="pickedColor"
          style="width: 150px;"
          :teleported="false"
          @change="onScaleBarColorChange"
        >
          <el-option
            v-for="color in paletteColors"
            :key="color.code"
            :value="color.code"
            :label="color.colorName"
          >
            <div :style="{position: 'relative', background: color.bgColor, height: '50px'}">
              <scale-bar
                :x-scale="8"
                :y-scale="8"
                :scale-bar-color="color.code"
              />
            </div>
          </el-option>
          <el-option
            value="hidden"
            label="Hidden"
          />
        </el-select>
      </el-form-item>
    </el-form>
  </span>
</template>

<script lang="ts">
import { defineComponent, computed, ref } from 'vue';
import { useStore } from 'vuex';
import ColorBar from './Colorbar.vue'
import ScaleBar from '../../../../components/ScaleBar.vue'
import NewFeatureBadge, { hideFeatureBadge } from '../../../../components/NewFeatureBadge'

interface colorObjType {
  code: string,
  bgColor: string,
  colorName: string
}

export default defineComponent({
  name: 'IonImageSettings',
  components: { ColorBar, ScaleBar, NewFeatureBadge },
  props: {
    defaultColormap: String,
    defaultScaleType: String,
    defaultScaleBarColor: String,
    defaultNormalization: Boolean,
    hideNormalization: Boolean,
    defaultLockTemplate: String,
    lockTemplateOptions: Array,
    showIntensityTemplate: Boolean
  },
  setup(props, { emit }) {
    const store = useStore();
    const availableScales = ref<string[]>(['Viridis', 'Cividis', 'Hot', 'YlGnBu', 'Portland', 'Greys', 'Inferno', 'Turbo'])
    const paletteColors = ref<colorObjType[]>([{
      code: '#000000',
      bgColor: 'transparent',
      colorName: 'Black',
    }, {
      code: '#999999',
      bgColor: 'transparent',
      colorName: 'Gray',
    }, {
      code: '#FFFFFF',
      bgColor: '#CCCCCC',
      colorName: 'White',
    }])
    const pickedColor = ref<string>(props.defaultScaleBarColor ?
      props.defaultScaleBarColor : paletteColors.value[0].code)

    const colormap = computed(() => props.defaultColormap || store.getters.settings.annotationView.colormap);
    const scaleType = computed(() => props.defaultScaleType || store.getters.settings.annotationView.scaleType);
    const normalization = computed(() => props.defaultNormalization || store.getters.settings.annotationView.normalization);
    const selectedTemplate = computed(() => props.defaultLockTemplate || store.getters.settings.annotationView.lockTemplate);

    const onColormapChange = (selection) => {
      store.commit('setColormap', selection);
      emit('colormapChange', selection);
    };

    const onScaleTypeChange = (scaleType) => {
      store.commit('setScaleType', scaleType);
      emit('scaleTypeChange', scaleType);
    };

    const onScaleBarColorChange = (color) => {
      pickedColor.value = color;
      emit('scaleBarColorChange', color === 'hidden' ? null : color);
    };

    const onNormalizationChange = (value) => {
      store.commit('setNormalization', value);
      emit('normalizationChange', value);
    };

    const onTemplateChange = (dsId) => {
      store.commit('setLockTemplate', dsId);
      emit('templateChange', dsId);
      hideFeatureBadge('template-intensity-lock');
    };

    return {
      colormap,
      scaleType,
      normalization,
      selectedTemplate,
      pickedColor,
      onColormapChange,
      onScaleTypeChange,
      onScaleBarColorChange,
      onNormalizationChange,
      onTemplateChange,
      availableScales,
      paletteColors
    };
  }
});
</script>

<style>
 #ion-image-settings {
   display: inline-flex;
   flex-direction: column;
   justify-content: center;
 }

 #ion-image-settings > .el-select {
   display: inline-flex;
 }

  #ion-image-settings > .el-form--label-top .el-form-item__label {
    padding: 0;
  }

 .el-badge__content.is-fixed{
   right: 0;
   top: 10px;
 }
</style>
