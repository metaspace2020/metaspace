<template>
  <div class="main-content">
    <div class="user-edit-page">
      <el-dialog
        title="Delete account"
        :visible.sync="showDeleteAccountDialog"
        width="30%"
        :lock-scroll="false">
        <p>If you delete your account, you will lose access to any datasets, groups and
        projects that have been explicitly shared with you</p>
        <el-checkbox v-model="delDatasets" style="margin-left: 20px">
          Delete datasets the that I have submitted
        </el-checkbox>
        <el-row>
          <el-button title="Cancel" @click="cancelDeleteAccount">Cancel</el-button>
          <el-button
            type="danger"
            title="Delete account"
            @click="deleteAccount()"
            :loading="isUserDeletionLoading"
            style="margin: 20px 0">
            Delete account</el-button>
        </el-row>
        <p><b>Note:</b> if you choose not to delete the datasets now, you will still be able to have them
          deleted later by emailing the METASPACE administrators.</p>
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
          <el-form :disabled="isUserDetailsLoading">
            <div class="user-details">
              <el-col :span="12">
                <div class="fullname">
                  <el-form-item prop="name" label="Full name:">
                    <el-input v-model="name" />
                  </el-form-item>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="email">
                  <el-form-item prop="email" label="E-mail:">
                    <el-input v-model="email" />
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
            border
            style="width: 100%">
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
                  size="mini"
                  type="danger"
                  @click="leaveGroup(scope.$index, groupsData)">
                  Leave
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <p>Primary group:</p>
          <el-select v-model="value" placeholder="Select" class="primGroupOptions">
            <el-option
              v-for="item in groupsData"
              :key="item.id"
              :label="item.name"
              :value="item">
            </el-option>
          </el-select>
          <p><a href="mailto:contact@metaspace2020.eu">Contact us</a> to set up your organization or lab on METASPACE
          </p>
        </div>
        <!--The section below will be introduced in vFuture-->
        <!--<div class="notifications">-->
          <!--<h2>Notifications</h2>-->
          <!--<div class="notification-list">-->
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
          <p>If you choose to delete your METASPACE account, you will be given the choice of whether to delete the
            datasets you have uploaded and projects you have created or leave them for others to continue using.</p>
        </div>
        <el-row>
          <el-button
            type="danger"
            title="Delete account"
            @click="deleteAccountDialog()"
            style="float:right">
            Delete account
          </el-button>
        </el-row>
      </el-row>
    </div>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import VueApollo from 'vue-apollo'
  import { Component, Watch } from 'vue-property-decorator'
  import {updateUserMutation, leaveGroupMutation, deleteUserMutation, currentUserQuery} from '../api/profileData'
  import reportError from "../lib/reportError";
  import apolloClient from '../graphqlClient';

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
    apollo: {
      currentUser: {
        query: currentUserQuery,
        result(data) {
          this.name = data.data.currentUser.name;
          this.email = data.data.currentUser.email;
          this.primaryGroupName = data.data.currentUser.primaryGroup.group.name;
          this.primaryGroupID = data.data.currentUser.primaryGroup.group.id;
          this.initEmailVal = this.email;
        }
      }
    }
  })

  export default class UserEditPage extends Vue {
    showDeleteAccountDialog: boolean = false;
    isUserDetailsLoading: boolean = false;
    isUserDeletionLoading: boolean = false;
    $apollo: any;

    currentUser?: CurrentUserResult;
    name: string | null = null;
    email: string | null = null;
    primaryGroupName: string | null = null;
    primaryGroupID: string | null = null;

    delDatasets: boolean = false;
    initEmailVal: string | null = null;

    @Watch('currentUser', {deep: true})
    onCurrentUserChanged() {
      this.name = this.currentUser.name;
      this.email = this.currentUser.email;
    }

    deleteAccountDialog() {
      this.showDeleteAccountDialog = true;
    }

    cancelDeleteAccount() {
      this.showDeleteAccountDialog = false;
    }

    set value(newGroupName) {
      this.primaryGroupID = newGroupName.id;
      this.primaryGroupName = newGroupName.name;
    }

    get value(): string {
      return this.primaryGroupName;
    }

    get groupsData(): GroupsData[] {
      if (this.currentUser == null) {
        return [];
      }
      return this.currentUser.groups.map(it => {
        const {id, name} = it.group;
        const {role, numDatasets} = it;
        return {id, name, role, numDatasets}
      });
    }

    async updateUserDetails() {
      try {
        if (this.initEmailVal !== this.email) {
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
              name: this.name,
              role: this.currentUser.role,
              email: this.email,
              primaryGroupId: this.primaryGroupID
            }
          },
        });
        await this.$apollo.queries.currentUser.refetch();
        this.$message({
          type: "success",
          message: "New message to verify your account was sent to your account"
        });
      } catch(err) {
        reportError(err, 'There was a problem with updating email.');
      } finally {
        this.isUserDetailsLoading = false;
      }
    }

    async leaveGroup(ind: number, rows: GroupsData[]) {
      try {
        try {
          await this.$msgbox({
            message: 'Are you sure you want to leave this group?',
            showCancelButton: true,
            confirmButtonText: "Yes, leave the group",
            lockScroll: false,
            beforeClose: async (action, instance, done) => {
              if (action === 'confirm') {
                instance.confirmButtonLoading = true;
                instance.confirmButtonText = 'Leaving...';
                await this.$apollo.mutate({
                  mutation: leaveGroupMutation,
                  variables: {
                    groupId: rows[ind].id
                  }
                });
                rows.splice(ind, 1);
                instance.confirmButtonLoading = false;
                done();
              } else {
                done();
              }
            },
          });
          this.$message({
            type: "success",
            message: "You have successfully left the group!"
          })
        } catch {
          return
        }
      } catch (err) {
        reportError(err, 'Failed to leave the group. Please contact administrator.');
      }
    }

    async deleteAccount() {
      this.isUserDeletionLoading = true;
      try {
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
      } catch (err) {
        reportError(err, 'There was a problem with deleting the user account.');
      } finally {
        this.cancelDeleteAccount();
        this.isUserDeletionLoading = false;
      }
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