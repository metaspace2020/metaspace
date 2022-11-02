<template>
  <div>
    <div
      v-if="modes.saved || modes.preview"
      v-html="embedMarkdownAsHtml()"
    />
    <el-popover
      v-if="modes.edit"
      placement="top-end"
      trigger="manual"
      :value="showHint"
    >
      <div>
        You can use markdown language to format your description.
        <br>
        <a
          style="margin-top: 5px"
          rel="nofollow noopener noreferrer"
          target="_blank"
          href="http://www.unexpected-vortices.com/sw/rippledoc/quick-markdown-example.html"
        >
          Learn more about it</a>
        <br><el-button
          style="margin-top: 5px"
          type="primary"
          size="mini"
          @click="disableHint"
        >
          It's clear
        </el-button>
      </div>
      <el-input
        slot="reference"
        v-model="groupDescriptionAsHtml"
        type="textarea"
        :autosize="{ minRows: 10, maxRows: 50 }"
      />
    </el-popover>
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
        v-if="modes.edit"
        class="btn"
        type="primary"
        size="medium"
        icon="el-icon-view"
        @click="prevMarkdown"
      >
        Preview
      </el-button>
      <el-button
        v-if="modes.edit || modes.preview"
        class="btn"
        type="success"
        size="medium"
        icon="el-icon-check"
        @click="saveMarkdown"
      >
        Save
      </el-button>
    </el-button-group>
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { parse } from 'marked'
import {
  ViewGroupResult,
} from '../../api/group'
import sanitizeIt from '../../lib/sanitizeIt'
import { getLocalStorage, setLocalStorage } from '../../lib/localStorage'

  interface Modes {
    preview: boolean
    saved: boolean,
    edit: boolean
  }

  @Component<GroupDescription>({
    name: 'group-description',
  })
export default class GroupDescription extends Vue {
    @Prop()
    group: ViewGroupResult | undefined ;

    @Prop({ required: true, default: false })
    canEdit!: boolean;

    groupDescriptionAsHtml: string = this.group && this.group.groupDescriptionAsHtml || '';
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

    async saveMarkdown() {
      this.$emit('updateGroupDescription', this.groupDescriptionAsHtml)
      this.modes = {
        preview: false,
        saved: true,
        edit: false,
      }
      this.$nextTick(() => {
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
        edit: false,
      }
    }

    disableHint() {
      this.showHint = false
      setLocalStorage('hideMarkdownHint', true)
    }

    embedMarkdownAsHtml() {
      return sanitizeIt(parse(this.groupDescriptionAsHtml))
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
