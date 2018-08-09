<template>
  <div>
    <div v-loading="!loaded" class="page">
      <div v-if="group != null" class="page-content">
        <transfer-datasets-dialog
          v-if="showTransferDatasetsDialog"
          :currentUserId="currentUserId"
          :groupName="group.name"
          :isInvited="isInvited"
          @accept="handleAcceptTransferDatasets"
          @close="handleCloseTransferDatasetsDialog"
        />
        <div class="header-row">
          <div class="header-names">
            <h1>{{group.name}}</h1>
            <h2 class="short-name">({{group.shortName}})</h2>
          </div>

          <div class="header-buttons">
            <el-button v-if="roleInGroup == null"
                       type="primary"
                       @click="handleRequestAccess"
                       :disabled="!!submitAction"
                       :loading="submitAction === 'requestAccess'">
              Request access
            </el-button>
            <el-button v-if="roleInGroup === 'PENDING'"
                       disabled>
              Request sent
            </el-button>
            <el-button v-if="roleInGroup === 'PRINCIPAL_INVESTIGATOR'"
                       type="primary"
                       @click="handleManageGroup">
              Manage group
            </el-button>
          </div>
          <el-alert v-if="roleInGroup === 'INVITED'"
                    type="info"
                    show-icon
                    :closable="false"
                    title="">
            <div style="padding: 0 0 20px 20px;">
              <p>
                You have been invited to join {{group.name}}.
              </p>
              <div>
                <el-button type="danger" @click="handleRejectInvite" :disabled="!!submitAction" :loading="submitAction === 'rejectInvite'">
                  Decline invitation
                </el-button>
                <el-button type="primary" @click="handleAcceptInvite" :disabled="!!submitAction">
                  Join group
                </el-button>
              </div>
            </div>
          </el-alert>
        </div>
        <div v-if="groupDatasets.length > 0">
          <h1>Datasets</h1>

          <div class="dataset-list">
            <dataset-item v-for="(dataset, i) in groupDatasets.slice(0,8)"
                          :dataset="dataset" :key="dataset.id"
                          :class="[i%2 ? 'even': 'odd']" />
          </div>
          <div class="dataset-list-footer">
            <router-link v-if="countDatasets > maxVisibleDatasets" :to="datasetsListLink">See all datasets</router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component } from 'vue-property-decorator';
  import { DatasetDetailItem, datasetDetailItemFragment } from '../../api/dataset';
  import DatasetItem from '../../components/DatasetItem.vue';
  import { acceptGroupInvitationMutation, leaveGroupMutation, requestAccessToGroupMutation } from '../../api/group';
  import gql from 'graphql-tag';
  import reportError from '../../lib/reportError';
  import TransferDatasetsDialog from './TransferDatasetsDialog.vue';
  import { encodeParams } from '../../url';

  type UserGroupRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'PRINCIPAL_INVESTIGATOR';

  type SubmitActionType = null | 'requestAccess' | 'rejectInvite' | 'acceptInvite';

  interface GroupInfo {
    name: string;
    shortName: string;
  }

  interface ViewGroupProfileData {
    currentUser: { id: string; } | null;
    group: GroupInfo | null;
    currentUserRoleInGroup: UserGroupRole | null;
    allDatasets: DatasetDetailItem[];
    countDatasets: number;
  }

  @Component({
    components: {
      DatasetItem,
      TransferDatasetsDialog,
    },
    apollo: {
      data: {
        query: gql`query ViewGroupProfile($groupId: ID!, $maxVisibleDatasets: Int!, $inpFdrLvls: [Int!] = [10], $checkLvl: Int = 10) {
          currentUser {
            id
          }
          group(id: $groupId) {
            name
            shortName
          }
          currentUserRoleInGroup(groupId: $groupId)
          allDatasets(offset: 0, limit: $maxVisibleDatasets, filter: { group: $groupId }) {
            ...DatasetDetailItem
          }
          countDatasets(filter: { group: $groupId })
        }

        ${datasetDetailItemFragment}`,
        variables(this: ViewGroupProfile) {
          return {
            maxVisibleDatasets: this.maxVisibleDatasets,
            groupId: this.groupId
          }
        },
        watchLoading(this: ViewGroupProfile, isLoading: boolean) {
          // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
          // button that causes this query to refetch
          if (!isLoading) {
            this.loaded = true;
          }
        },
        update(data) {
          return data;
        }
      },
    }
  })
  export default class ViewGroupProfile extends Vue {
    loaded = false;
    showTransferDatasetsDialog: boolean = false;
    data: ViewGroupProfileData | null = null;

    get currentUserId(): string | null { return this.data && this.data.currentUser && this.data.currentUser.id }
    get group(): GroupInfo | null { return this.data && this.data.group; }
    get roleInGroup(): UserGroupRole | null { return this.data && this.data.currentUserRoleInGroup; }
    get groupDatasets(): DatasetDetailItem[] { return this.data && this.data.allDatasets || []; }
    get countDatasets(): number { return this.data && this.data.countDatasets || 0; }
    maxVisibleDatasets = 8;
    submitAction: SubmitActionType = null; // Used for indicating which button is loading


    get groupId(): string {
      return this.$route.params.groupId;
    }

    get isInvited(): boolean {
      return this.data != null && this.data.currentUserRoleInGroup === 'INVITED';
    }

    get datasetsListLink() {
      const filters = {
        group: this.group && {id: this.groupId, name: this.group.name},
      };
      const path = '/datasets';
      const query = encodeParams(filters, path, this.$store.state.filterLists);
      return { path, query }
    }

    async doSubmit(type: SubmitActionType, func: () => Promise<void>) {
      // Wrapper for functions that submit, so that loading indicators are consistent
      if (this.submitAction != null) {
        return;
      }
      this.submitAction = type;
      try {
        await func();
      } catch (err) {
        reportError(err);
      } finally {
        this.submitAction = null;
      }
    }

    async handleRequestAccess() {
      this.showTransferDatasetsDialog = true;
    }

    async handleAcceptInvite() {
      this.showTransferDatasetsDialog = true;
    }

    async handleRejectInvite() {
      try {
        await this.$confirm(
          "Are you sure?",
          "Decline invitation", {
            confirmButtonText: "Decline invitation"
          });
      } catch (err) {
        return; // User clicked Cancel
      }
      await this.doSubmit('rejectInvite', async () => {
        await this.$apollo.mutate({
          mutation: leaveGroupMutation,
          variables: { groupId: this.groupId },
        });
        await this.$apollo.queries.data.refetch();
      });
    }

    handleManageGroup() {
      this.$router.push(`/group/${this.groupId}/edit`);
    }

    async handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      if (this.isInvited) {
        await this.doSubmit('acceptInvite', async () => {
          await this.$apollo.mutate({
            mutation: acceptGroupInvitationMutation,
            variables: { groupId: this.groupId, bringDatasets: selectedDatasetIds },
          });
          await this.$apollo.queries.data.refetch();
        })
      } else {
        await this.doSubmit('requestAccess', async () => {
          await this.$apollo.mutate({
            mutation: requestAccessToGroupMutation,
            variables: { groupId: this.groupId, bringDatasets: selectedDatasetIds },
          });
          await this.$apollo.queries.data.refetch();
        })
      }
      this.showTransferDatasetsDialog = false;
    }

    handleCloseTransferDatasetsDialog() {
      this.showTransferDatasetsDialog = false;
    }
  }

</script>
<style scoped lang="scss">

  .page {
    display: flex;
    justify-content: center;
    min-height: 80vh; // Ensure there's space for the loading spinner before is visible
  }
  .page-content {
    width: 820px;

    @media (min-width: 1650px) {
      /* 2 datasets per row on wide screens */
      width: 1620px;
    }
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
  }
  .header-names {
    display: flex;
    align-items: baseline;
  }
  .short-name {
    margin-left: 16px;
    color: grey;
  }
  .header-buttons {
    display: flex;
    justify-content: flex-end;
    flex-grow: 1;
    align-self: center;
    margin-right: 3px;
  }

  .even {
    background-color: #e6f1ff;

    @media (min-width: 1650px) {
      background-color: white;
    }
  }

  .odd {
    background-color: white;
  }

  .dataset-list {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: stretch;
  }
</style>
