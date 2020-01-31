<template>
  <div class="metadata-section">
    <el-row>
      <el-col :span="6">
        <div class="metadata-section__title">
          Visibility
          <el-popover
            trigger="hover"
            placement="top"
          >
            <div>
              <p>
                <b>Public:</b> Annotations will be available in the METASPACE public knowledge base,
                sharable and searchable by the community. The uploaded imzML files are not made public.
              </p>
              <p>
                <b>Private:</b> Annotations will be visible to the submitter and logged-in members
                of the selected group and projects. METASPACE admins can also view these annotations.
                The uploaded imzML files are also private.
              </p>
            </div>
            <i
              slot="reference"
              class="el-icon-question metadata-help-icon"
            />
          </el-popover>
        </div>
      </el-col>
      <el-col
        :span="18"
        style="padding: 12px 6px 0;"
      >
        <el-switch
          :value="isPublic"
          active-text="Public"
          inactive-text="Private"
          @input="handleChangeIsPublic"
        />
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Prop, Component, Emit, Watch } from 'vue-property-decorator'
import './FormSection.scss'

  @Component
export default class VisibilityOptionSection extends Vue {
    @Prop({ type: Boolean, required: true })
    isPublic!: boolean;

    @Emit('update:isPublic')
    handleChangeIsPublic(val: boolean): void {
    }
}
</script>

<style lang="scss">
  //@import './FormSection.scss';
</style>
