<template>
  <el-dialog
    :visible="visible"
    custom-class="find-group-dialog"
    :lock-scroll="false"
    @close="handleClose"
  >
    <h2>Find a group</h2>
    <p>
      If you are not member of a group, you can request access here and your dataset will be
      automatically added to the group once your access has been approved.
    </p>
    <el-form>
      <el-form-item
        :error="groupIdError"
        label="Your group:"
      >
        <el-row>
          <el-select
            v-model="groupId"
            filterable
            remote
            :remote-method="handleGroupSearch"
            placeholder="Enter group name"
            :loading="searchLoading !== 0"
          >
            <el-option
              v-for="group in searchResults"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-row>
      </el-form-item>
    </el-form>

    <el-row style="margin: 15px 0">
      <el-button @click="handleClose">
        Cancel
      </el-button>
      <el-button
        type="primary"
        :disabled="groupId == null || groupIdError != null"
        :loading="isGroupAccessLoading"
        @click="handleRequestGroupAccess"
      >
        Request access
      </el-button>
    </el-row>
    <el-row>
      <p>
        <b>Can't find your group?</b> <a href="mailto:contact@metaspace2020.eu">Contact us</a> to get your team started,
        or <a
          href="#"
          style="cursor: pointer"
          @click.prevent="handleSelectNoGroup"
        >fill in your Principal Investigator</a> instead.
      </p>
    </el-row>
  </el-dialog>
</template>

<script lang="ts">
import Vue from 'vue'
import { Component, Prop, Watch } from 'vue-property-decorator'
import {
  allGroupsQuery,
  requestAccessToGroupMutation,
  GroupListItem,
} from '../../../api/dataManagement'
import { UserGroupRoleOptions as UGRO } from '../../../api/group'
import { userProfileQuery, UserProfileQuery } from '../../../api/user'
import reportError from '../../../lib/reportError'
import './FormSection.scss'

  @Component<FindGroupDialog>({
    apollo: {
      currentUser: {
        query: userProfileQuery,
        fetchPolicy: 'cache-first',
      },
      searchResults: {
        query: allGroupsQuery,
        loadingKey: 'searchLoading',
        variables() {
          return {
            query: this.query,
          }
        },
        skip() {
          return this.query === ''
        },
        update: data => data.allGroups,
      },
    },
  })

export default class FindGroupDialog extends Vue {
    @Prop({ default: false })
    visible!: boolean;

    query: string = '';
    searchResults: GroupListItem[] | null = null;
    currentUser!: UserProfileQuery;
    searchLoading = 0;
    isGroupAccessLoading: boolean = false;
    groupId: string | null = null;

    get groupIdError(): string | null {
      if (this.currentUser != null && this.currentUser.groups != null) {
        const existingUserGroup = this.currentUser.groups.find(g => g.group.id === this.groupId)
        if (existingUserGroup != null) {
          if (existingUserGroup.role === UGRO.PENDING) {
            return 'You have already requested access to this group.'
          } else if (existingUserGroup.role === UGRO.INVITED) {
            return 'You have already been invited this group. Please accept the invitation through your account page.'
          } else {
            return 'You are already a member of this group.'
          }
        }
      }
      return null
    }

    handleSelectNoGroup() {
      this.$emit('selectGroup', null)
    }

    handleGroupSearch(query: string) {
      this.query = query
    }

    handleClose() {
      this.$emit('close')
    }

    async handleRequestGroupAccess() {
      try {
        const group = this.searchResults!.find(g => g.id === this.groupId)
        this.isGroupAccessLoading = true
        await this.$apollo.mutate({
          mutation: requestAccessToGroupMutation,
          variables: { groupId: this.groupId },
        })
        await this.$apollo.queries.currentUser.refetch()

        this.$message({
          message: 'Your request was successfully sent!',
          type: 'success',
        })
        this.$emit('selectGroup', group)
      } catch (err) {
        reportError(err)
      } finally {
        this.isGroupAccessLoading = false
        this.groupId = null
      }
    }
}
</script>

<style lang="scss">
  .find-group-dialog {
    .el-dialog__body {
      padding: 10px 25px;
    }
    .el-select .el-input__inner {
      cursor: text;
    }
    .el-select .el-input__suffix {
      display: none;
    }
  }
</style>
