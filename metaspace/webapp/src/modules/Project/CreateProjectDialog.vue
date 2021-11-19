<template>
  <el-dialog
    class="dialog"
    :visible="visible"
    append-to-body
    title="Create project"
    :lock-scroll="false"
    @close="handleClose"
  >
    <div v-loading="loading">
      <edit-project-form
        ref="form"
        v-model="project"
        size="mini"
        class="v-rhythm-3"
      />
      <div
        v-if="allDatasets.length > 0"
        class="mt-6"
      >
        <h4 class="m-0">
          Would you like to include previously submitted datasets?
        </h4>
        <dataset-checkbox-list
          v-model="selectedDatasets"
          :datasets="allDatasets"
        />
      </div>
      <div class="button-bar">
        <el-button
          :disabled="isSubmitting"
          @click="handleClose"
        >
          Cancel
        </el-button>
        <el-button
          type="primary"
          autofocus
          :loading="isSubmitting"
          @click="handleCreate"
        >
          {{ acceptText }}
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { DatasetListItem, datasetListItemsQuery } from '../../api/dataset'
import EditProjectForm from './EditProjectForm.vue'
import DatasetCheckboxList from '../../components/DatasetCheckboxList.vue'
import { createProjectMutation, importDatasetsIntoProjectMutation } from '../../api/project'
import reportError from '../../lib/reportError'

  @Component<CreateProjectDialog>({
    components: {
      EditProjectForm,
      DatasetCheckboxList,
    },
    apollo: {
      allDatasets: {
        query: datasetListItemsQuery,
        loadingKey: 'loading',
        variables() {
          return {
            dFilter: {
              submitter: this.currentUserId,
            },
          }
        },
      },
    },
  })
export default class CreateProjectDialog extends Vue {
    @Prop({ required: true })
    currentUserId!: string;

    @Prop({ default: false })
    visible!: boolean;

    $apollo: any; // Type fixes in PR: https://github.com/Akryum/vue-apollo/pull/367

    loading: number = 0;
    allDatasets: DatasetListItem[] = [];
    selectedDatasets: Record<string, boolean> = {};
    isSubmitting: Boolean = false;
    project = {
      name: '',
      isPublic: false,
      urlSlug: '',
    };

    get numSelected() {
      return Object.values(this.selectedDatasets).filter(selected => selected).length
    }

    get acceptText() {
      const action = 'Create project'
      return this.numSelected === 0
        ? action
        : `${action} and include ${this.numSelected} ${this.numSelected === 1 ? 'dataset' : 'datasets'}`
    }

    handleClose() {
      if (!this.isSubmitting) {
        this.$emit('close')
      }
    }

    async handleCreate() {
      try {
        await (this.$refs.form as any).validate()
      } catch (err) {
        return
      }
      this.isSubmitting = true
      try {
        const selectedDatasetIds = Object.keys(this.selectedDatasets).filter(key => this.selectedDatasets[key])
        const { name, isPublic, urlSlug } = this.project

        const { data } = await this.$apollo.mutate({
          mutation: createProjectMutation,
          variables: {
            projectDetails: {
              name,
              isPublic,
              urlSlug: urlSlug != null && urlSlug !== '' ? urlSlug : null,
            },
          },
        })
        const projectId = data!.createProject.id
        if (selectedDatasetIds.length > 0) {
          await this.$apollo.mutate({
            mutation: importDatasetsIntoProjectMutation,
            variables: { projectId, datasetIds: selectedDatasetIds },
          })
        }

        this.$emit('create', { id: projectId, name })
      } catch (err) {
        reportError(err)
      } finally {
        this.isSubmitting = false
      }
    }
}
</script>
<style scoped lang="scss">
  .dialog /deep/ .el-dialog {
    @apply max-w-lg;

    .el-form-item {
      margin-bottom: 10px;
    }
    .el-form-item__label {
      line-height: 1.2em;
    }
  }
  .dialog /deep/ .el-dialog__header {
    padding-bottom: 0;
  }

  .dialog /deep/ .el-dialog__body {
    padding: 20px;
  }
  .button-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-top: 20px;
  }
</style>
