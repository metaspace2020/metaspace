<template>
  <div class="metadata-section">
    <el-row>
      <el-col :span="6">
        <div class="section-description">Visibility</div>
      </el-col>
      <el-col :span="18" style="margin-top: 20px">
        <el-switch
          v-model="isPublic"
          active-text="Public"
          inactive-text="Private" />
        <el-popover trigger="hover" placement="top" class="md-editor-public-help">
          <div>
            <p><b>Public:</b> Annotations will be available in the METASPACE public knowledge base, sharable and searchable by the community. The uploaded imzML files are not made public.</p>
            <p><b>Private:</b> Annotations will be visible to the submitter (and only the submitter) when the submitter is logged in. METASPACE admins can also view these annotations. The uploaded imzML files are also private.</p>
          </div>
          <i slot="reference" class="el-icon-question"></i>
        </el-popover>
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import { Prop } from 'vue-property-decorator';
  import { MetaspaceOptions } from './formStructure';

  export default class VisibilityOptionSection extends Vue {
    @Prop({type: Object, required: true })
    value!: MetaspaceOptions;

    @Prop({type: Boolean, required: true})
    isPublic!: boolean;

    name: "visibility-option-section"

    onInput<TKey extends keyof MetaspaceOptions>(field: TKey, val: MetaspaceOptions[TKey]) {
      this.$emit('input', {...this.value, [field]: val});
    }
  }
</script>

<style scoped>
  .section-description {
    font-family: Helvetica, sans-serif;
    font-weight: bold;
    margin: 30px 0 0 10px;
    display: block;
    position: relative;
    top: 50%;
    transform: translateY(-50%);
  }
</style>