<template>
  <el-dialog
    class="dialog"
    visible
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
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { DatasetListItem, datasetListItemsQuery } from '../../api/dataset'
import DatasetCheckboxList from '../../components/DatasetCheckboxList.vue'
import { currentUserIdQuery, CurrentUserIdResult } from '../../api/user'

  @Component<TransferDatasetsDialog>({
    components: {
      DatasetCheckboxList,
    },
    apollo: {
      currentUser: {
        query: currentUserIdQuery,
        loadingKey: 'loading',
        fetchPolicy: 'cache-first',
      },
      allDatasets: {
        query: datasetListItemsQuery,
        loadingKey: 'loading',
        variables() {
          return {
            dFilter: {
              submitter: this.currentUser!.id,
              hasGroup: false,
            },
          }
        },
        skip() {
          return !this.currentUser || !this.currentUser.id
        },
      },
    },
  })
export default class TransferDatasetsDialog extends Vue {
    @Prop({ required: true })
    groupName!: string;

    @Prop({ required: true })
    isInvited!: boolean; // True to show "Accept/reject invitation", false to show "Request access/cancel"

    loading: number = 0;
    currentUser: CurrentUserIdResult | null = null;
    allDatasets: DatasetListItem[] = [];
    selectedDatasets: Record<string, boolean> = {};
    isSubmitting: Boolean = false;

    get numSelected() {
      return Object.values(this.selectedDatasets).filter(selected => selected).length
    }

    get acceptText() {
      const action = this.isInvited ? 'Join group' : 'Request access'
      return this.numSelected === 0
        ? action
        : `${action} and transfer ${this.numSelected} ${this.numSelected === 1 ? 'dataset' : 'datasets'}`
    }

    handleClose() {
      if (!this.isSubmitting) {
        this.$emit('close')
      }
    }

    handleAccept() {
      const selectedDatasetIds = Object.keys(this.selectedDatasets).filter(key => this.selectedDatasets[key])
      this.$emit('accept', selectedDatasetIds)
      this.isSubmitting = true
    }
}
</script>
<style scoped lang="scss">
  .dialog /deep/ .el-dialog {
    @apply max-w-lg;
  }
  .button-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-top: 20px;
  }
</style>
