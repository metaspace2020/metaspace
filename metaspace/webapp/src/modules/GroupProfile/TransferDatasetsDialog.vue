<template>
    <el-dialog class="dialog"
               visible
               :title="allDatasets.length > 0 ? 'Transfer datasets' : 'Join group'"
               @close="handleClose">
      <div v-loading="loading">
        <div v-if="allDatasets.length > 0">
          <p style="margin-top: 0">
            You have previously uploaded one or more datasets without a group. Do you want to transfer any of these datasets to {{groupName}}?
          </p>
          <div class="dataset-list">
            <div v-for="dataset in allDatasets">
              <el-checkbox v-model="selectedDatasets[dataset.id]">
                {{dataset.name}}
                <span class="reset-color">(Submitted {{ formatDate(dataset.uploadDT) }})</span>
              </el-checkbox>
            </div>
          </div>
          <div class="select-buttons">
            <a href="#" @click.prevent="handleSelectNone">Select none</a>
            <span> | </span>
            <a href="#" @click.prevent="handleSelectAll">Select all</a>
          </div>
          <p v-if="!isInvited">
            An email will be sent to the group's principal investigator to confirm your access.
          </p>
          <div class="button-bar">
            <el-button :disabled="isSubmitting" @click="handleClose">Cancel</el-button>
            <el-button type="primary" :loading="isSubmitting" @click="handleAccept">{{acceptText}}</el-button>
          </div>
        </div>
        <div v-else>
          <p v-if="!isInvited" style="margin-top: 0">
            An email will be sent to the group's principal investigator to confirm your access.
          </p>
          <p v-else style="margin-top: 0">
            Are you sure you want to join {{groupName}}?
          </p>
          <div class="button-bar">
            <el-button :disabled="isSubmitting" @click="handleClose">Cancel</el-button>
            <el-button type="primary" :loading="isSubmitting" @click="handleAccept">{{acceptText}}</el-button>
          </div>
        </div>
      </div>
    </el-dialog>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop, Watch } from 'vue-property-decorator';
  import { DatasetListItem, datasetListItemsQuery } from '../../api/dataset';
  import { fromPairs } from 'lodash-es';
  import format from 'date-fns/format';

  @Component({
    apollo: {
      allDatasets: {
        query: datasetListItemsQuery,
        loadingKey: 'loading',
        variables(this: TransferDatasetsDialog) {
          return {
            dFilter: {
              submitter: this.currentUserId,
              hasGroup: false,
            }
          };
        }
      }
    }
  })
  export default class TransferDatasetsDialog extends Vue {
    @Prop({ required: true })
    currentUserId!: string; //TODO: It's weird to have this as a prop. It would be better to grab it from Vuex.
    @Prop({ required: true })
    groupName!: string;
    @Prop({ required: true })
    isInvited!: boolean; // True to show "Accept/reject invitation", false to show "Request access/cancel"

    loading: number = 0;
    allDatasets: DatasetListItem[] = [];
    selectedDatasets: Record<string, boolean> = {};
    isSubmitting: Boolean = false;

    get numSelected() {
      return Object.values(this.selectedDatasets).filter(selected => selected).length;
    }

    get acceptText() {
      const action = this.isInvited ? 'Join group' : 'Request access';
      return this.numSelected === 0
        ? action
        : `${action} and transfer ${this.numSelected} ${this.numSelected === 1 ? 'dataset' : 'datasets'}`
    }

    formatDate(date: string) {
      return `${format(date, 'YYYY-MM-DD')} at ${format(date, 'HH:mm')}`;
    }

    @Watch('allDatasets')
    populateSelectedDatasets() {
      //Rebuild `selectedDatasets` so that the keys are in sync with the ids from `datasets`
      this.selectedDatasets = fromPairs(this.allDatasets.map(({id}) => {
        return [id, id in this.selectedDatasets ? this.selectedDatasets[id] : true];
      }));
    }

    handleClose() {
      if (!this.isSubmitting) {
        this.$emit('close');
      }
    }

    handleSelectNone() {
      Object.keys(this.selectedDatasets).forEach(key => this.selectedDatasets[key] = false);
    }

    handleSelectAll() {
      Object.keys(this.selectedDatasets).forEach(key => this.selectedDatasets[key] = true);
    }

    handleAccept() {
      const selectedDatasetIds = Object.keys(this.selectedDatasets).filter(key => this.selectedDatasets[key]);
      this.$emit('accept', selectedDatasetIds);
      this.isSubmitting = true;
    }
  }
</script>
<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";
  .dialog /deep/ .el-dialog {
    max-width: 600px;
  }
  .dataset-list {
    margin: 20px;
    max-height: 50vh;
    overflow: auto;
  }
  .select-buttons {
    text-align: right;
    margin: 20px;
  }
  .button-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-top: 20px;
  }
  .reset-color {
    color: $--color-text-regular;
  }

</style>
