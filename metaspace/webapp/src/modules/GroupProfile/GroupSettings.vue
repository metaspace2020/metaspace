<template>
  <div class="group-settings">
    <div class="header-row">
      <h2>Group Details</h2>
      <div class="flex-spacer" />

      <div class="header-row-buttons">
        <el-button
          v-if="canEdit && group"
          type="primary"
          :loading="isSaving"
          @click="handleSave"
        >
          Save
        </el-button>
      </div>
    </div>
    <edit-group-form
      :model="model"
      :disabled="isSaving || !canEdit"
    />
    <div
      v-if="group != null"
      style="margin-bottom: 2em"
    >
      <h2>Custom URL</h2>
      <div v-if="canEditUrlSlug">
        <router-link :to="groupUrlRoute">
          {{ groupUrlPrefix }}
        </router-link>
        <input v-model="model.urlSlug">
      </div>
      <div v-if="!canEditUrlSlug && group && group.urlSlug">
        <router-link :to="groupUrlRoute">
          {{ groupUrlPrefix }}<span class="urlSlug">{{ group.urlSlug }}</span>
        </router-link>
      </div>
      <div v-if="!canEditUrlSlug && group && !group.urlSlug">
        <p>
          <router-link :to="groupUrlRoute">
            {{ groupUrlPrefix }}<span class="urlSlug">{{ group.id }}</span>
          </router-link>
        </p>
        <p><a href="mailto:contact@metaspace2020.eu">Contact us</a> to set up a custom URL to showcase your group.</p>
      </div>
    </div>
    <div v-if="canDelete && group">
      <h2>Delete group</h2>
      <p>
        Please ensure all datasets have been removed before deleting a group.
      </p>
      <div style="text-align: right; margin: 1em 0;">
        <el-button
          type="danger"
          :loading="isDeletingGroup"
          @click="handleDeleteGroup"
        >
          Delete group
        </el-button>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Prop, Watch } from 'vue-property-decorator'
import {
  deleteGroupMutation,
  editGroupQuery,
  EditGroupQuery,
  UpdateGroupMutation,
  updateGroupMutation,
} from '../../api/group'
import EditGroupForm from './EditGroupForm.vue'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import ConfirmAsync from '../../components/ConfirmAsync'
import reportError from '../../lib/reportError'

  @Component<GroupSettings>({
    components: {
      EditGroupForm,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
      },
      group: {
        query: editGroupQuery,
        loadingKey: 'membersLoading',
        variables() { return { groupId: this.groupId } },
      },
    },
  })
export default class GroupSettings extends Vue {
    groupLoading = 0;
    isDeletingGroup = false;
    isSaving = false;
    model = {
      name: '',
      shortName: '',
      urlSlug: '',
    };

    currentUser: CurrentUserRoleResult | null = null;
    group: EditGroupQuery | null = null;

    @Prop()
    groupId!: string;

    get canDelete(): boolean {
      return this.currentUser && this.currentUser.role === 'admin' || false
    }

    get canEdit(): boolean {
      return (this.currentUser && this.currentUser.role === 'admin')
        || (this.group && this.group.currentUserRole === 'GROUP_ADMIN')
        || false
    }

    get canEditUrlSlug(): boolean {
      return this.currentUser && this.currentUser.role === 'admin' || false
    }

    get groupName() {
      return this.group ? this.group.name : ''
    }

    get groupUrlRoute() {
      const groupIdOrSlug = this.group ? this.group.urlSlug || this.group.id : ''
      return { name: 'group', params: { groupIdOrSlug } }
    }

    get groupUrlPrefix() {
      const { href } = this.$router.resolve({ name: 'group', params: { groupIdOrSlug: 'REMOVE' } }, undefined, true)
      return location.origin + href.replace('REMOVE', '')
    }

    @Watch('group')
    setModel() {
      this.model.name = this.group && this.group.name || ''
      this.model.shortName = this.group && this.group.shortName || ''
      this.model.urlSlug = this.group && this.group.urlSlug || ''
    }

    @ConfirmAsync(function(this: GroupSettings) {
      return {
        message: `Are you sure you want to delete ${this.groupName}?`,
        confirmButtonText: 'Delete group',
        confirmButtonLoadingText: 'Deleting...',
      }
    })
    async handleDeleteGroup() {
      this.isDeletingGroup = true
      try {
        const groupName = this.groupName
        await this.$apollo.mutate({
          mutation: deleteGroupMutation,
          variables: { groupId: this.groupId },
        })
        this.$message({ message: `${groupName} has been deleted`, type: 'success' })
        this.$router.push('/')
      } catch (err) {
        reportError(err)
      } finally {
        this.isDeletingGroup = false
      }
    }

    async handleSave() {
      this.isSaving = true
      try {
        const { name, shortName, urlSlug } = this.model
        await this.$apollo.mutate<UpdateGroupMutation>({
          mutation: updateGroupMutation,
          variables: {
            groupId: this.groupId,
            groupDetails: {
              name,
              shortName,
              // Avoid sending a null urlSlug unless it's being intentionally unset
              ...(this.canEditUrlSlug ? { urlSlug: urlSlug || null } : {}),
            },
          },
        })
        this.$message({ message: `${name} has been saved`, type: 'success' })
        if (this.canEditUrlSlug) {
          this.$router.replace({
            params: { groupIdOrSlug: urlSlug || this.groupId },
            query: this.$route.query,
          })
        }
      } catch (err) {
        reportError(err)
      } finally {
        this.isSaving = false
      }
    }

    async refreshData() {
      await this.$apollo.queries.group.refetch()
    }
}

</script>
<style scoped lang="scss">
  .group-settings {
    width: 950px;
    min-height: 80vh; // Ensure there's space for the loading spinner before is visible
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  .header-row-buttons {
    display: flex;
    margin-right: 3px;
  }

  .flex-spacer {
    flex-grow: 1;
  }

  .urlSlug {
    padding: 4px 0;
    background-color: #EEEEEE;
  }

</style>
