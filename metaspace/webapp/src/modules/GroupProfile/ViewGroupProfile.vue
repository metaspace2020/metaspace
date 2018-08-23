<template>
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
                     @click="handleRequestAccess">
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
              <el-button type="danger" @click="handleRejectInvite">
                Decline invitation
              </el-button>
              <el-button type="primary" @click="handleAcceptInvite">
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
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component } from 'vue-property-decorator';
  import { DatasetDetailItem, datasetDetailItemFragment } from '../../api/dataset';
  import DatasetItem from '../../components/DatasetItem.vue';
  import { acceptGroupInvitationMutation, leaveGroupMutation, requestAccessToGroupMutation } from '../../api/group';
  import gql from 'graphql-tag';
  import TransferDatasetsDialog from './TransferDatasetsDialog.vue';
  import { encodeParams } from '../../url';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import { importDatasetsIntoGroupMutation } from '../../api/group';

  type UserGroupRole = 'INVITED' | 'PENDING' | 'MEMBER' | 'PRINCIPAL_INVESTIGATOR';

  interface GroupInfo {
    id: string;
    name: string;
    shortName: string;
    currentUserRole: UserGroupRole | null;
  }

  interface ViewGroupProfileData {
    currentUser: { id: string; } | null;
    group: GroupInfo | null;
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
          group(groupId: $groupId) {
            id
            name
            shortName
            currentUserRole
          }
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
        update(data) {
          // Not using 'loadingKey' pattern here to avoid getting a full-page loading spinner when the user clicks a
          // button that causes this query to refetch
          this.loaded = true;
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
    get roleInGroup(): UserGroupRole | null { return this.data && this.data.group && this.data.group.currentUserRole; }
    get groupDatasets(): DatasetDetailItem[] { return this.data && this.data.allDatasets || []; }
    get countDatasets(): number { return this.data && this.data.countDatasets || 0; }
    maxVisibleDatasets = 8;


    get groupId(): string {
      return this.$route.params.groupId;
    }

    get isInvited(): boolean {
      return this.roleInGroup === 'INVITED';
    }

    get datasetsListLink() {
      const filters = {
        group: this.group && {id: this.groupId, name: this.group.name},
      };
      const path = '/datasets';
      const query = encodeParams(filters, path, this.$store.state.filterLists);
      return { path, query }
    }

    async handleRequestAccess() {
      this.showTransferDatasetsDialog = true;
    }

    async handleAcceptInvite() {
      this.showTransferDatasetsDialog = true;
    }

    @ConfirmAsync({
      title: 'Decline invitation',
      message: 'Are you sure?',
      confirmButtonText: "Decline invitation"
    })
    async handleRejectInvite() {
      await this.$apollo.mutate({
        mutation: leaveGroupMutation,
        variables: { groupId: this.groupId },
      });
      await this.$apollo.queries.data.refetch();
    }

    handleManageGroup() {
      this.$router.push(`/group/${this.groupId}/edit`);
    }

    async handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      if (this.isInvited) {
        await this.$apollo.mutate({
          mutation: acceptGroupInvitationMutation,
          variables: { groupId: this.groupId },
        });
      } else {
        await this.$apollo.mutate({
          mutation: requestAccessToGroupMutation,
          variables: { groupId: this.groupId },
        });
      }
      if (selectedDatasetIds.length > 0) {
        await this.$apollo.mutate({
          mutation: importDatasetsIntoGroupMutation,
          variables: { groupId: this.groupId, datasetIds: selectedDatasetIds },
        });
      }
      await this.$apollo.queries.data.refetch();
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
