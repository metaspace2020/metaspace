<template>
  <div class="main-content">
    <div class="user-edit-page">
      <el-dialog
        title="Leave the group"
        :visible.sync="showLeaveGroupDialog"
        width="30%"
        :lock-scroll="false">
        <span style="line-height: 30px">
          <p>Are you sure you want to leave this group?</p>
        </span>
        <el-button title="Cancel" @click="cancelLeaveGroup">Cancel</el-button>
        <el-button title="Send verification email" @click="leaveGroup" type="primary">Yes, leave the group</el-button>
      </el-dialog>
      <el-dialog
        title="Delete account"
        :visible.sync="showDeleteAccountDialog"
        width="30%"
        :lock-scroll="false">
        <span style="line-height: 30px">
          <p>If you delete your account, you will lose access to any datasets, groups and
          projects that have been explicitly shared with you</p>
          <el-checkbox-group>
            <el-checkbox style="margin-left: 20px">Delete the that I have submitted</el-checkbox>
          </el-checkbox-group>
          <el-button title="Cancel" @click="cancelDeleteAccount">Cancel</el-button>
          <el-button type="danger" title="Delete account" @click="deleteAccount()"
                     style="margin: 20px 0">Delete account</el-button>
        </span>
        <p><b>Note:</b> if you choose not to delete the datasets now, you will still be able to have them
          deleted later by emailing the METASPACE administrators.</p>
      </el-dialog>
      <el-row id="edit-user-page">
        <el-row>
          <el-col :span="16">
            <h2>User details</h2>
          </el-col>
          <el-col :span="8">
            <el-button title="Save" type="primary" @click="updateUserDetails" class="saveButton" :loading="isUserDetailsLoading">Save</el-button>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-form :disabled="isUserDetailsLoading">
            <div class="user-details">
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
            border
            style="width: 100%">
            <el-table-column
              prop="group"
              label="Group"
              width="180">
              <template slot-scope="scope">{{scope.row.group}}</template>
            </el-table-column>
            <el-table-column
              prop="role"
              label="Role"
              width="280">
              <template slot-scope="scope">{{scope.row.role}}</template>
            </el-table-column>
            <el-table-column
              prop="datasetContributed"
              label="Dataset contributed">
              <template slot-scope="scope">{{scope.row.datasetContributed}}</template>
            </el-table-column>
            <el-table-column>
              <template slot-scope="scope">
                <el-button
                  size="mini"
                  type="danger"
                  @click="leaveGroupDialog()">
                  Leave
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <p>Primary group:</p>
          <el-select v-model="primaryGroup" class="primGroupOptions">
            <el-option
              v-for="item in primGroupOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
              class="primGroupOptions">
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
        <div class="delete-account">
          <h2>Delete account</h2>
          <p>If you choose to delete your METASPACE account, you will be given the choice of whether to delete the
            datasets you have uploaded and projects you have created or leave them for others to continue using.</p>
        </div>
        <el-row>
          <el-button type="danger" title="Delete account" @click="deleteAccountDialog()" style="float:right">Delete
            account
          </el-button>
        </el-row>
      </el-row>
    </div>
  </div>
</template>

<script lang="ts">
  import Vue from 'vue'
  import Component from 'vue-class-component'
  import {updateUser, leaveGroup, deleteUser, currentUserQuery} from '../api/profileData'
  import reportError from "../lib/reportError";
  import apolloClient from '../graphqlClient';

  interface GroupsData {
    group: string;
    role: string;
    datasetContributed: number;
  }

  interface primGroupOptions {
    value: string
    label: string
  }

  interface Model {
    id: number
    name: string
    role: string
    email: string
    primaryGroupId: number
  }

  interface CurrentUserResult {
    id: string;
    name: string;
    email: string | null;
    groups: {
      role: string;
      numDatasets: number;
      group: { id:string, name: string };
    }[] | null;
    primaryGroup: {
      group: { id: string }
    } | null;
  }

  @Component({
    name: 'user-edit-page'
  })

  export default class UserEditPage extends Vue {
    showDeleteAccountDialog: boolean = false;
    showLeaveGroupDialog: boolean = false;
    deleteDatasets: boolean = false;
    isUserDetailsLoading: boolean = false;

    currentUser?: CurrentUserResult;

    groupsData: GroupsData[] = [{
      group: "EMBL",
      role: "Administrator",
      datasetContributed: 2,
    }];

    primGroupOptions: primGroupOptions[] = [{
      value: 'EMBL',
      label: 'EMBL'
    }];

    deleteAccountDialog() {
      this.showDeleteAccountDialog = true;
    }

    leaveGroupDialog() {
      this.showLeaveGroupDialog = true;
    }

    cancelDeleteAccount() {
      this.showDeleteAccountDialog = false;
    }

    cancelLeaveGroup() {
      this.showLeaveGroupDialog = false;
    }

    async currentUserInfo() {
      this.currentUser = await apolloClient.query<CurrentUserResult>({
        query: currentUserQuery
      })
    }

    async updateUserDetails() {
      const updateUserInput = this.model;
      try {
        if (true /* check if email has changed */) {
          try {
            await this.$confirm(
              "Are you sure you want to change email address? A verification email will be sent to your new address to confirm the change",
              "Confirm email address change", {
                confirmButtonText: "Yes, send verification email"
              });
          } catch(err) {
            return; // The user clicked cancel
          }
        }
        this.isUserDetailsLoading = true;
        await updateUser(updateUserInput);
        this.$message({
          type: "success",
          message: "New message to verify your account was sent to your account"
        })
      } catch (err) {
        reportError(err);
      } finally {
        this.isUserDetailsLoading = false;
      }
    }

    async leaveGroup() {
      const groupId = this.groupId;
      try {
        await leaveGroup(groupId);
        this.$message({
          type: "success",
          message: "Group was successfully left!"
        })
      } catch (err) {
        this.$message({
          type: "error",
          message: "Failed to leave the group. Please contact administrator."
        });
      } finally {
        this.cancelLeaveGroup()
      }
    }

    async deleteAccount() {
      const id = this.model.id;
      this.deleteDatasets = true;

      try {
        await deleteUser(id, this.deleteDatasets);
        this.$message({
          type: "success",
          message: "Group was successfully left!"
        })
      } catch (err) {
        this.$message({
          type: "error",
          message: "Failed to leave the group. Please contact administrator."
        });
      } finally {
        this.cancelDeleteAccount()
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

  /* Uncomment when the vFuture notifications will be introduced
  /*.notifications_checkbox {*/
    /*margin-left: 0;*/
    /*padding: 0;*/
  /*}*/

</style>