<template>
  <el-dialog
    class="dialog"
    :model-value="visible"
    append-to-body
    title="Create project"
    :lock-scroll="false"
    @close="handleClose"
  >
    <div v-loading="loading">
      <edit-project-form
        ref="form"
        :value="project"
        size="small"
        class="v-rhythm-3"
      />
      <div v-if="allDatasets.length > 0" class="mt-6">
        <h4 class="m-0">
          Would you like to include previously submitted datasets?
        </h4>
        <dataset-checkbox-list
          v-model="selectedDatasets"
          :datasets="allDatasets"
        />
      </div>
      <div class="button-bar">
        <el-button :disabled="isSubmitting" @click="handleClose">
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
import { defineComponent, ref, computed, watch } from 'vue';
import { useQuery, useMutation } from '@vue/apollo-composable';
import { DatasetListItem, datasetListItemsQuery } from '../../api/dataset'
import { createProjectMutation, importDatasetsIntoProjectMutation } from '../../api/project'
import EditProjectForm from './EditProjectForm.vue';
import DatasetCheckboxList from '../../components/DatasetCheckboxList.vue';
import reportError from '../../lib/reportError';
import {ElDialog, ElButton} from "element-plus";

export default defineComponent({
  components: {
    EditProjectForm,
    DatasetCheckboxList,
    ElDialog, ElButton,
  },
  props: {
    currentUserId: {
      type: String,
      required: true,
    },
    visible: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { emit }) {
    const form = ref(null);
    const project = ref({
      name: '',
      isPublic: false,
      urlSlug: '',
    });
    const selectedDatasets = ref({});
    const isSubmitting = ref(false);

    const { result, loading } = useQuery(datasetListItemsQuery, () => ({ dFilter: { submitter: props.currentUserId } }));
    const allDatasets = computed(() => result.value?.allDatasets || []);

    const numSelected = computed(() => Object.values(selectedDatasets.value).filter(selected => selected).length);
    const acceptText = computed(() => {
      const action = 'Create project';
      return numSelected.value === 0
        ? action
        : `${action} and include ${numSelected.value} ${numSelected.value === 1 ? 'dataset' : 'datasets'}`;
    });

    const createProject = useMutation(createProjectMutation);
    const importDatasets = useMutation(importDatasetsIntoProjectMutation);

    const handleClose = () => {
      if (!isSubmitting.value) {
        emit('close');
      }
    };

    const handleCreate = async () => {
      try {
        await form.value.validate();
      } catch (err) {
        return;
      }

      isSubmitting.value = true;

      try {
        const selectedDatasetIds = Object.keys(selectedDatasets.value).filter(key => selectedDatasets.value[key]);
        const { name, isPublic, urlSlug } = project.value;

        const { data } = await createProject.mutate({
          projectDetails: {
            name,
            isPublic,
            urlSlug: urlSlug != null && urlSlug !== '' ? urlSlug : null,
          },
        });

        const projectId = data.createProject.id;
        if (selectedDatasetIds.length > 0) {
          await importDatasets.mutate({
            projectId,
            datasetIds: selectedDatasetIds,
          });
        }

        emit('create', { id: projectId, name });
      } catch (err) {
        reportError(err);
      } finally {
        isSubmitting.value = false;
      }
    };

    return {
      form,
      project,
      selectedDatasets,
      isSubmitting,
      allDatasets,
      loading,
      numSelected,
      acceptText,
      handleClose,
      handleCreate,
    };
  },
});
</script>

<style scoped lang="scss">
  .dialog ::v-deep(.el-dialog) {
    @apply max-w-lg;

    .el-form-item {
      margin-bottom: 10px;
    }
    .el-form-item__label {
      line-height: 1.2em;
    }
  }
  .dialog ::v-deep(.el-dialog__header) {
    padding-bottom: 0;
  }

  .dialog ::v-deep(.el-dialog__body) {
    padding: 20px;
  }
  .button-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-top: 20px;
  }
</style>
