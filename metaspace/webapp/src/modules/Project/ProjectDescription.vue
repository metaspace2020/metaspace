<template>
  <div>
    <rich-text
      :content="projectDescription"
      :editable="modes.edit"
      :with-menu-bar="canEdit"
      :get-content="save"
    />
    <el-button-group
      v-if="canEdit"
      class="btngroup"
    >
      <el-button
        v-if="modes.saved || modes.preview"
        class="btn"
        type="primary"
        size="medium"
        icon="el-icon-edit"
        @click="editTextDescr"
      >
        Edit
      </el-button>
      <el-button
        v-if="modes.edit || modes.preview"
        class="btn"
        type="success"
        size="medium"
        icon="el-icon-check"
        @click="finishEditing"
      >
        Save
      </el-button>
    </el-button-group>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import marked from 'marked'
import sanitizeIt from '../../lib/sanitizeIt'
import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'
import RichText from '../../components/RichText'

interface Modes {
  preview: boolean
  saved: boolean,
  edit: boolean
}

@Component<ProjectDescription>({
  name: 'project-description',
  components: {
    RichText,
  },
})
export default class ProjectDescription extends Vue {
    @Prop()
    project: any;

    @Prop({ required: true, default: false })
    canEdit!: boolean;

    projectDescription: string | null = this.project && this.project.projectDescription

    showHint: boolean = false;
    modes: Modes = {
      preview: false,
      saved: true,
      edit: false,
    };

    editTextDescr() {
      this.modes = {
        preview: false,
        saved: false,
        edit: true,
      }
      this.$nextTick(() => {
        this.showHint = !getLocalStorage<boolean>('hideMarkdownHint')
      })
    }

    finishEditing() {
      this.modes = {
        preview: false,
        saved: true,
        edit: false,
      }
    }

    async save(newDescription: string) {
      this.$emit('updateProjectDescription', newDescription)
    }
}
</script>

<style scoped>
  .btngroup{
    margin: 20px 0;
  }

  .btn {
    padding: 8px 20px;
  }
</style>
