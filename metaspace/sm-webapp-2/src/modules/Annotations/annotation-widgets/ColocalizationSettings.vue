<template>
  <span id="colocalization-settings">
    <el-form label-position="top">
      <el-form-item>
        <template v-slot:label>
          <span>
          Colocalization algorithm
          <el-popover
            trigger="hover"
            placement="top"
          >
            <div style="max-width: 550px;">
              <p>
                The <b>median-thresholded cosine distance</b> algorithm is the best choice for
                exploring most datasets in METASPACE.
                It was found to highly reproduce expert rankings of mass spectrometry ion images
                and performed better than other traditional colocalization measures. <br />
                Its description and evaluation can be found in:
                <a
                  href="https://doi.org/10.1093/bioinformatics/btaa085"
                  target="blank"
                >Ovchinnikova et al. (2020) ColocML</a>.
              </p>
              <p>
                The <b>cosine distance</b> was previously used as the default colocalization measure.
                It is still available and can be selected from the list.
              </p>
            </div>
            <template #reference>
              <el-icon class="el-icon-question help-icon" ><QuestionFilled /></el-icon>
            </template>
          </el-popover>
        </span>
        </template>
        <el-select
          v-model="colocalizationAlgo"
          style="width: 300px;"
          title="Colocalization algorithm"
        >
          <el-option
            v-for="{id, name} in colocalizationAlgoOptions"
            :key="id"
            :value="id"
            :label="name"
          />
        </el-select>
      </el-form-item>
    </el-form>
  </span>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import { useStore } from 'vuex';
import { colocalizationAlgosQuery } from '../../../api/metadata';

interface ColocalizationAlgoOption {
  id: string;
  name: string;
}

export default defineComponent({
  setup() {
    const store = useStore();
    const { result: colocalizationAlgosResult } = useQuery<any>(colocalizationAlgosQuery);
    const colocalizationAlgos = computed(() => colocalizationAlgosResult.value?.colocalizationAlgos || []);

    const colocalizationAlgo = computed({
      get: () => store.getters.settings.annotationView.colocalizationAlgo
        || (colocalizationAlgoOptions.value.length > 0 ? colocalizationAlgoOptions.value[0].id : ''),
      set: (value: string | null) => {
        if (!value || (colocalizationAlgoOptions.value.length > 0 && colocalizationAlgoOptions.value[0].id === value)) {
          store.commit('setColocalizationAlgo', null);
        } else {
          store.commit('setColocalizationAlgo', value);
        }
      }
    });

    const colocalizationAlgoOptions = computed(() => colocalizationAlgos.value as ColocalizationAlgoOption[] || []);

    return {
      colocalizationAlgo,
      colocalizationAlgoOptions,
    };
  },
});
</script>

<style>
 #colocalization-settings {
   display: inline-flex;
   flex-direction: column;
   justify-content: center;
 }

 #colocalization-settings > .el-select {
   display: inline-flex;
 }
</style>
