<template>
  <div class="main-content">
    <div class="user-edit-page">
      <transfer-datasets-dialog
        v-if="showTransferDatasetsDialog"
        :currentUserId="currentUserId"
        :groupName="invitingGroup"
        :isInvited="true"
        @accept="handleAcceptTransferDatasets"
        @close="handleCloseTransferDatasetsDialog"
      />
      <el-dialog
        title="Delete account"
        :visible.sync="showDeleteAccountDialog"
        width="30%"
        :lock-scroll="false">
        <p>If you delete your account, you will lose access to all private datasets.
        </p>
        <p>Please select whether you would like to delete all your datasets or keep them within METASPACE accessible by the group members:
        </p>
        <!--Changed the Text below to the above version after discussion with Theo, plz consider if it fits-->
        <!--If you delete your account, you will lose access to any datasets, groups and-->
        <!--projects that have been explicitly shared with you-->
        <el-checkbox v-model="delDatasets" style="margin-left: 20px">
          Delete datasets that I have submitted
        </el-checkbox>
        <el-row>
          <el-button title="Cancel" @click="closeDeleteAccountDialog">Cancel</el-button>
          <el-button
            type="danger"
            title="Delete account"
            @click="deleteAccount()"
            :loading="isUserDeletionLoading"
            style="margin: 20px 0">
            Delete account</el-button>
        </el-row>
        <p><b>Note:</b> if you choose not to delete the datasets now, you will still be able to have them
          deleted later by emailing the METASPACE administrators</p>
      </el-dialog>
      <el-row id="edit-user-page">
        <el-row>
          <el-col :span="16">
            <h2>User details</h2>
          </el-col>
          <el-col :span="8">
            <el-button title="Save"
                       type="primary"
                       @click="updateUserDetails"
                       class="saveButton"
                       :loading="isUserDetailsLoading">
              Save
            </el-button>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-form :disabled="isUserDetailsLoading" :rules="rules" :model="model" ref="form">
            <div class="user-details" style="padding-left: 15px;">
              <el-col :span="12">
                <div class="fullname">
                  <el-form-item prop="name" label="Full name:">
                    <el-input v-model="model.name" />
                  </el-form-item>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="email">
                  <el-form-item prop="email" label="E-mail:">
                    <el-input v-model="model.email" />
                  </el-form-item>
                </div>
              </el-col>
            </div>
          </el-form>
        </el-row>

        <div class="groups">
          <h2>Groups</h2>
          <el-table
            :data="groupsData"
            style="width: 100%;padding-left: 15px;">
            <el-table-column
              prop="name"
              label="Group"
              width="180">
            </el-table-column>
            <el-table-column
              prop="role"
              label="Role"
              width="280">
            </el-table-column>
            <el-table-column
              prop="numDatasets"
              label="Dataset contributed">
            </el-table-column>
            <el-table-column>
              <template slot-scope="scope">
                <el-button
                  v-if="scope.row.role === 'MEMBER'"
                  size="mini"
                  icon="el-icon-arrow-right"
                  @click="leaveGroup('leave', scope.row)">
                  Leave
                </el-button><el-button
                  v-if="scope.row.role === 'PRINCIPAL INVESTIGATOR'"
                  size="mini"
                  icon="el-icon-arrow-right"
                  disabled>
                  Leave
                </el-button>
                <el-button
                  v-if="scope.row.role === 'INVITED'"
                  size="mini"
                  type="success"
                  @click="acceptInvitation(scope.row)"
                  icon="el-icon-check">
                  Accept
                </el-button>
                <el-button
                  v-if="scope.row.role === 'INVITED'"
                  size="mini"
                  icon="el-icon-close"
                  @click="leaveGroup('leaveGroup', scope.row)">
                  Decline
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <p>Primary group:</p>
          <el-select v-model="primaryGroupId" placeholder="Select" class="primGroupOptions"
                     style="padding-left: 15px;">
            <el-option
              v-for="item in groupsData"
              :key="item.id"
              :label="item.name"
              :value="item.id">
            </el-option>
          </el-select>
        </div>
        <!--The section below will be introduced in vFuture-->
        <!--<div class="notifications" style="margin-top: 30px">-->
          <!--<h2>Notifications</h2>-->
          <!--<div class="notification-list" style="padding-left: 10px">-->
            <!--<el-row :gutter="0">-->
              <!--<el-col :span="12"><p>Send an email when:</p>-->
                <!--<el-checkbox-group-->
                  <!--class="notifications">-->
                  <!--<div class="notifications_checkbox">-->
                    <!--<el-checkbox-->
                      <!--label="My dataset's processing has successfully finished"></el-checkbox>-->
                  <!--</div>-->
                  <!--<div class="notifications_checkbox">-->
                    <!--<el-checkbox class="notifications_checkbox"-->
                                 <!--label="My dataset's processing failed"></el-checkbox>-->
                  <!--</div>-->
                <!--</el-checkbox-group>-->
                <!--<p>Show a notification when:</p>-->
                <!--<el-checkbox-group :indeterminate="isIndeterminate" v-model="checkList"-->
                                   <!--class="notifications">-->
                  <!--<div class="notifications_checkbox">-->
                    <!--<el-checkbox class="notifications_checkbox"-->
                                 <!--label="My dataset's processing has successfully finished"></el-checkbox>-->
                  <!--</div>-->
                  <!--<div class="notifications_checkbox">-->
                    <!--<el-checkbox class="notifications_checkbox"-->
                                 <!--label="A dataset is added to a group or project that I belong to"></el-checkbox>-->
                  <!--</div>-->
                  <!--<div class="notifications_checkbox">-->
                    <!--<el-checkbox class="notifications_checkbox"-->
                                 <!--label="A public dataset has been added to the queue"></el-checkbox>-->
                  <!--</div>-->
                  <!--<div class="notifications_checkbox">-->
                    <!--<el-checkbox class="notifications_checkbox"-->
                                 <!--label="A public dataset has finished processing"></el-checkbox>-->
                  <!--</div>-->
                <!--</el-checkbox-group>-->
              <!--</el-col>-->
            <!--</el-row>-->
          <!--</div>-->
        <!--</div>-->
        <div class="delete-account" style="margin-top: 45px">
          <h2>Delete account</h2>
          <p style="width: 100%;padding-left: 15px;">
            If you delete your METASPACE account, you can either delete all your datasets or keep them within METASPACE.
            For the latter, the private data will still be accessible by the group members only.
          </p>
        </div>
        <el-row>
          <el-button
            type="danger"
            title="Delete account"
            @click="openDeleteAccountDialog()"
            style="float:right; margin-top:15px">
            Delete account
          </el-button>
        </el-row>
      </el-row>
    </div>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import { Component, Watch } from 'vue-property-decorator'
  import {updateUserMutation, leaveGroupMutation,
    deleteUserMutation, currentUserQuery, acceptGroupInvitationMutation} from '../api/profileData'
  import reportError from "../lib/reportError";
  import {refreshLoginStatus} from '../graphqlClient';
  import {ElForm} from "element-ui/types/form";
  import TransferDatasetsDialog from '../modules/GroupProfile/TransferDatasetsDialog.vue'

  interface Model {
    name: string;
    email: string | null;
  }

  interface GroupsData {
    id: string;
    name: string;
    role: string;
    numDatasets: number;
  }

  interface CurrentUserResult {
    id: string;
    name: string;
    role: string;
    email: string | null;
    groups: {
      role: string;
      numDatasets: number;
      group: {
        id: string,
        name: string
      };
    }[] | null;
    primaryGroup: {
      group: {
        id: string;
        name: string;
      }
    } | null;
  }

  @Component({
    components: {
      TransferDatasetsDialog
    },
    apollo: {
      currentUser: {
        query: currentUserQuery
      }
    }
  })

  export default class UserEditPage extends Vue {
    showDeleteAccountDialog: boolean = false;
    isUserDetailsLoading: boolean = false;
    isUserDeletionLoading: boolean = false;
    showTransferDatasetsDialog: boolean = false;

    currentUser: CurrentUserResult | null = null;
    currentUserId: string | null = null;
    model: Model = {
      name: '',
      email: ''
    };
    invitingGroup: string | null = null;
    invitingGroupId: string | null = null;

    primaryGroupId: string | null = null;

    delDatasets: boolean = false;
    rules: object = {
      name: [
        {required: true, min: 3, max: 50 , message: 'Please enter a correct fullname', trigger: "blur"}
      ],
      email: [
        {required: true, pattern:/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        message: 'Please enter a correct Email address', trigger: "blur"
      }]
    };

    @Watch('currentUser', {deep: true})
    onCurrentUserChanged(this: any) {
      this.currentUserId = this.currentUser.id;
      this.model.name = this.currentUser.name;
      this.model.email = this.currentUser.email;
      this.primaryGroupId = this.currentUser.primaryGroup ? this.currentUser.primaryGroup.group.id : null;
    }

    openDeleteAccountDialog() {
      this.showDeleteAccountDialog = true;
    }

    closeDeleteAccountDialog() {
      this.showDeleteAccountDialog = false;
    }

    get groupsData(): GroupsData[] {
      if (this.currentUser == null || this.currentUser.groups == null) {
        return [];
      }
      return this.currentUser.groups.map(it => {
        const {id, name} = it.group;
        const {numDatasets} = it;
        let {role} = it;
          if (role === 'PENDING') {
          role = 'REQUESTING ACCESS'
        }
        role = role.replace(/[_-]/, " ");
        return {id, name, role, numDatasets}
      });
    }

    async updateUserDetails(this: any) {
      try {
        await (this.$refs.form as ElForm).validate();
      } catch (err) {
        return;
      }
      try {
        if (this.currentUser.email !== this.model.email) {
          try {
            await this.$confirm(
              "Are you sure you want to change email address? A verification email will be sent to your new address to confirm the change.",
              "Confirm email address change", {
                confirmButtonText: "Yes, send verification email",
                lockScroll: false
              });
          } catch {
            return
          }
        }
        this.isUserDetailsLoading = true;
        await this.$apollo.mutate({
          mutation: updateUserMutation,
          variables: {
            update: {
              id: this.currentUser.id,
              name: this.model.name,
              email: this.model.email,
              primaryGroupId: this.primaryGroupId
            }
          },
        });
        await this.$apollo.queries.currentUser.refetch();
          this.$message({
            type: "success",
            message: "A verification link has been sent to your new email address. " +
            "Please click the link in this email to confirm the change."
          });
      } catch(err) {
        reportError(err);
      } finally {
        this.isUserDetailsLoading = false;
      }
    }

    async leaveGroup(action: string, groupRow: GroupsData) {
        try {
          await this.$msgbox({
            message: (action === 'leave') ? `Are you sure you want to leave ${groupRow.name}?` :
              `Are you sure you want to decline the invitation to ${groupRow.name}?`,
            showCancelButton: true,
            confirmButtonText: (action === 'leave') ? "Yes, leave the group" :
              "Yes, decline the invitation",
            lockScroll: false,
            beforeClose: async (action, instance, done) => {
              try {
                if (action === 'confirm') {
                  instance.confirmButtonLoading = true;
                  instance.confirmButtonText = 'Leaving...';
                  await this.$apollo.mutate({
                    mutation: leaveGroupMutation,
                    variables: {
                      groupId: groupRow.id
                    }
                  });
                  this.$message({
                    message: "You have declined the invitation"
                  });
                  await this.$apollo.queries.currentUser.refetch();
                  instance.confirmButtonLoading = false;
                  done();
                } else {
                  done();
                }
              } catch(err) {
                reportError(err);
              }
            }
          });
          if (action === 'leave') {
            this.$message({
              message: "You have successfully left the group"
            })
          }
        } catch {
          return
        }
    }

    async deleteAccount(this: any) {
      try {
        this.isUserDeletionLoading = true;
        await this.$apollo.mutate({
          mutation: deleteUserMutation,
          variables: {
            id: this.currentUser.id,
            deleteDatasets: this.delDatasets
          }
        });
        this.$message({
          type: "success",
          message: "You have successfully deleted your account!"
        })
      } catch(err) {
        reportError(err);
      } finally {
        refreshLoginStatus();
        this.closeDeleteAccountDialog();
        this.isUserDeletionLoading = false;
      }
    }

    async acceptInvitation(groupRow: GroupsData) {
      this.showTransferDatasetsDialog = true;
      this.invitingGroupId = groupRow.id;
      this.invitingGroup = groupRow.name;
    }

    async handleAcceptTransferDatasets(selectedDatasetIds: string[]) {
      try {
        await this.$apollo.mutate({
          mutation: acceptGroupInvitationMutation,
          variables: { groupId: this.invitingGroupId, bringDatasets: selectedDatasetIds },
        });
        await this.$apollo.queries.currentUser.refetch();
        this.$message({
          type: "success",
          message: "You have successfully joined the group!"
        });
        this.showTransferDatasetsDialog = false;
      } catch(err) {
        reportError(err);
      } finally {
        this.showTransferDatasetsDialog = false;
      }
    }

    handleCloseTransferDatasetsDialog() {
      this.showTransferDatasetsDialog = false;
    }
  }
</script>

<style>
  .main-content {
    padding: 100px 20px 20px 20px;
    display: flex;
    justify-content: center;
  }

  .user-edit-page {
    max-width: 950px;
  }

  .saveButton {
    width: 100px;
    padding: 8px;
    float: right;
    margin: 20px 0;
  }

  .user-details {
    display: inline-block;
    width: 600px;
  }

  .primGroupOptions {
    margin: 30px 0;
  }

  .primGroupOptions {
    margin: 0;
  }

  .el-dialog__body {
    padding: 0 20px 20px 20px;
  }

  /* Uncomment when the vFuture notifications will be introduced
  /*.notifications_checkbox {*/
    /*margin-left: 0;*/
    /*padding: 0;*/
  /*}*/
</style>
