<template>
  <div>
    <div v-if="modes.saved || modes.preview" v-html="embedMarkdownAsHtml()"></div>
    <el-popover
        placement="top-end"
        v-if="modes.edit"
        trigger="manual"
        :value="showHint">
      <div>
        You can use markdown language to format your description.
        <br>
        <a style="margin-top: 5px" rel="nofollow noopener noreferrer" target="_blank"
           href="http://www.unexpected-vortices.com/sw/rippledoc/quick-markdown-example.html">
          Learn more about it</a>
        <br><el-button
          style="margin-top: 5px"
          type="primary"
          size="mini"
          @click="disableHint">It's clear</el-button>
      </div>
      <el-input
          slot="reference"
          type="textarea"
          :autosize="{ minRows: 10, maxRows: 50 }"
          v-model="projectDescriptionAsHtml">
      </el-input>
    </el-popover>
    <el-button-group class="btngroup" v-if="canEdit">
      <el-button
          @click="editTextDescr"
          class="btn"
          v-if="modes.saved || modes.preview"
          type="primary"
          size="medium"
          icon="el-icon-edit">
        Edit
      </el-button>
      <el-button
          @click="prevMarkdown"
          class="btn"
          v-if="modes.edit"
          type="primary"
          size="medium"
          icon="el-icon-view">
        Preview
      </el-button>
      <el-button
          @click="saveMarkdown"
          class="btn"
          v-if="modes.edit || modes.preview"
          type="success"
          size="medium"
          icon="el-icon-check">
        Save
      </el-button>
    </el-button-group>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue';
  import {Component, Prop} from 'vue-property-decorator';
  import marked from 'marked';
  import sanitizeIt from '../../lib/sanitizeIt';
  import {getLocalStorage, setLocalStorage} from '../../lib/localStorage';

  interface Modes {
    preview: boolean
    saved: boolean,
    edit: boolean
  }

  @Component<ProjectDescription>({
    name: 'project-description'
  })
  export default class ProjectDescription extends Vue {
    @Prop()
    project: any;
    @Prop({required: true, default: false})
    canEdit!: boolean;

    projectDescriptionAsHtml: string = this.project && this.project.projectDescriptionAsHtml || '';
    showHint: boolean = false;
    modes: Modes = {
      preview: false,
      saved: true,
      edit: false
    };

    editTextDescr() {
      this.modes = {
        preview: false,
        saved: false,
        edit: true
      };
      this.$nextTick(()=> {
        this.showHint = !getLocalStorage<boolean>('hideMarkdownHint');
      })
    }

    async saveMarkdown() {
      this.$emit('updateProjectDescription', this.projectDescriptionAsHtml);
      this.modes = {
        preview: false,
        saved: true,
        edit: false
      };
      this.$nextTick(()=> {
        if (this.showHint) {
          this.showHint = false
        }
      })
    }

    async prevMarkdown() {
      if (this.showHint) {
        this.showHint = false
      }
      this.modes = {
        preview: true,
        saved: false,
        edit: false
      };
    }

    disableHint() {
      this.showHint = false;
      setLocalStorage('hideMarkdownHint', true);
    }

    embedMarkdownAsHtml() {
      return sanitizeIt(marked(this.projectDescriptionAsHtml));
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
