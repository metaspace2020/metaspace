<template>
  <div class="metadata-section">
    <el-switch
      v-model="metaspaceOptions.isPublic"
      active-text="Public"
      inactive-text="Private" />
    <el-popover trigger="hover" placement="top" class="md-editor-public-help">
      <div>
        <p><b>Public:</b> Annotations will be available in the METASPACE public knowledge base, sharable and searchable by the community. The uploaded imzML files are not made public.</p>
        <p><b>Private:</b> Annotations will be visible to the submitter (and only the submitter) when the submitter is logged in. METASPACE admins can also view these annotations. The uploaded imzML files are also private.</p>
      </div>
      <i slot="reference" class="el-icon-question"></i>
    </el-popover>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Prop } from 'vue-property-decorator';
  import FormField from './FormField.vue'

  @Component({
    components: {
      FormField
    }
  })

  export default class SampleInformationSection extends Vue {
    @Prop({type: Object, required: true})
    value!: SampleInformation;

    name: "visibility-section"

    onInput<TKey extends keyof SampleInformationSection>(field: TKey, val: SampleInformationSection[TKey]) {
      this.$emit('input', {...this.value, [field]: val})
    }
  }
</script>

<style scoped>

</style>