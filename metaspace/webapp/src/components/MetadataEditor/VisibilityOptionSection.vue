<template>
  <div class="metadata-section">
    <el-row>
      <el-col :span="6">
        <div class="section-description">Visibility
          <el-popover trigger="hover" placement="top" class="md-editor-public-help">
            <div>
              <p><b>Public:</b> Annotations will be available in the METASPACE public knowledge base, sharable and searchable by the community. The uploaded imzML files are not made public.</p>
              <p><b>Private:</b> Annotations will be visible to the submitter (and only the submitter) when the submitter is logged in. METASPACE admins can also view these annotations. The uploaded imzML files are also private.</p>
            </div>
            <i slot="reference" class="el-icon-question"></i>
          </el-popover>
        </div>
      </el-col>
      <el-col :span="18" style="margin-top: 20px">
        <el-switch
          v-model="isPublic"
          active-text="Public"
          inactive-text="Private"
        />
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { Prop, Component, Emit, Watch } from 'vue-property-decorator';
import { MetaspaceOptions } from './formStructure';

@Component
export default class VisibilityOptionSection extends Vue {
  isPublic: boolean = true;

  @Emit('visibStatus')
  visibStatus(val: boolean): void {
    return null
  }

  @Watch('isPublic')
  emitVisStatus(val) {
    this.visibStatus(val)
  }

  name: "visibility-option-section"
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