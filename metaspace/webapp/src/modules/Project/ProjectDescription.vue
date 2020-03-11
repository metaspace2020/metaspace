<template>
  <rich-text
    class="sm-project-description mx-auto mb-6"
    :content="projectDescription"
    :on-update="save"
    :readonly="!canEdit"
  />
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

    async save(newDescription: string) {
      this.$emit('updateProjectDescription', newDescription)
    }
}
</script>

<style scoped>
  .sm-project-description {
    max-width: 75ch;
  }
</style>
