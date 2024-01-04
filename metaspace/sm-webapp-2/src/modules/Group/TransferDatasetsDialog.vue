<template>
  <el-dialog
    class="dialog"
    :model-value="true"
    append-to-body
    :title="allDatasets.length > 0 ? 'Transfer datasets' : 'Join group'"
    @close="handleClose"
  >
    <div v-loading="loading">
      <div v-if="allDatasets.length > 0">
        <p style="margin-top: 0">
          You have previously uploaded one or more datasets without a group. Do you want to transfer any of these datasets to {{ groupName }}?
        </p>
        <dataset-checkbox-list
          v-model="selectedDatasets"
          :datasets="allDatasets"
          :init-select-all="true"
        />
        <p v-if="!isInvited">
          An email will be sent to the group's principal investigator to confirm your access.
        </p>
        <div class="button-bar">
          <el-button
            :disabled="isSubmitting"
            @click="handleClose"
          >
            Cancel
          </el-button>
          <el-button
            type="primary"
            :loading="isSubmitting"
            @click="handleAccept"
          >
            {{ acceptText }}
          </el-button>
        </div>
      </div>
      <div v-else>
        <p
          v-if="!isInvited"
          style="margin-top: 0"
        >
          An email will be sent to the group's principal investigator to confirm your access.
        </p>
        <p
          v-else
          style="margin-top: 0"
        >
          Are you sure you want to join {{ groupName }}?
        </p>
        <div class="button-bar">
          <el-button
            :disabled="isSubmitting"
            size="small"
            @click="handleClose"
          >
            Cancel
          </el-button>
          <el-button
            type="primary"
            :loading="isSubmitting"
            size="small"
            @click="handleAccept"
          >
            {{ acceptText }}
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from 'vue';
import { useQuery } from '@vue/apollo-composable';
import { DatasetListItem, datasetListItemsQuery } from '../../api/dataset';
import DatasetCheckboxList from '../../components/DatasetCheckboxList.vue';
import { currentUserIdQuery } from '../../api/user';
import { ElDialog, ElButton, ElLoading } from 'element-plus';

export default defineComponent({
  components: {
    DatasetCheckboxList,
    ElDialog,
    ElButton,
  },
  directives: {
    'loading': ElLoading.directive,
  },
  props: {
    groupName: {
      type: String,
      required: true
    },
    isInvited: {
      type: Boolean,
      required: true
    }
  },
  setup(props, { emit }) {
    const isSubmitting = ref(false);
    const selectedDatasets = ref({});

    const { result: currentUserResult, loading: currenUserLoading } = useQuery(currentUserIdQuery,
      null, {
        fetchPolicy: 'cache-first',
      });
    const currentUser = computed(() => currentUserResult.value?.currentUser)
    const { result: allDatasetsResult, loading: datasetsLoading } = useQuery(datasetListItemsQuery, () => ({
      dFilter: {
        submitter: currentUser.value ? currentUser.value.id : null,
        hasGroup: false
      }
    }), {
      enabled: computed(() => !!currentUser.value && !!currentUser.value.id)
    });
    const allDatasets = computed(() => allDatasetsResult.value?.allDatasets as DatasetListItem[] || []);
    const loading = computed(() => currenUserLoading.value || datasetsLoading.value);

    const dialogTitle = computed(() => allDatasets.value.length > 0 ? 'Transfer datasets' : 'Join group');
    const acceptText = computed(() => {
      const action = props.isInvited ? 'Join group' : 'Request access';
      const numSelected = Object.values(selectedDatasets.value).filter(selected => selected).length;
      return numSelected === 0 ? action : `${action} and transfer ${numSelected} ${numSelected === 1 ? 'dataset' : 'datasets'}`;
    });

    const handleAccept = () => {
      const selectedDatasetIds = Object.keys(selectedDatasets.value).filter(key => selectedDatasets.value[key]);
      emit('accept', selectedDatasetIds);
      isSubmitting.value = true;
    };

    const handleClose = () => {
      if (!isSubmitting.value) {
        emit('close');
      }
    };

    return {
      loading,
      isSubmitting,
      selectedDatasets,
      currentUser,
      allDatasets,
      dialogTitle,
      acceptText,
      handleAccept,
      handleClose
    };
  }
});
</script>
<style scoped lang="scss">
  .dialog ::v-deep(.el-dialog) {
    @apply max-w-lg;
  }
  .button-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-top: 20px;
  }
</style>
