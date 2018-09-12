<template>
  <div>
    <div class="page">
      <div class="page-content">
        <div class="header-row">
          <h1>Project Details</h1>
          <div class="flex-spacer" />

          <div class="header-row-buttons">
            <el-button v-if="canEdit && project"
                       type="primary"
                       @click="handleSave"
                       :loading="isSaving">
              Save
            </el-button>
          </div>
        </div>
        <edit-project-form v-model="model" :disabled="isSaving || !canEdit" />
        <members-list
          :loading="projectLoading !== 0"
          :members="project && project.members || []"
          type="project"
          :filter="datasetsListFilter"
          :canEdit="canEdit"
          @removeUser="handleRemoveUser"
          @cancelInvite="handleRemoveUser"
          @acceptUser="handleAcceptUser"
          @rejectUser="handleRejectUser"
          @addMember="handleAddMember"
        />
        <div v-if="project && project.isPublic" style="margin-bottom: 2em">
          <h2>Custom URL</h2>
          <div v-if="canEditUrlSlug">
            <a :href="projectUrlHref">{{projectUrlPrefix}}</a>
            <input v-model="model.urlSlug" />
          </div>
          <div v-if="!canEditUrlSlug && project && project.urlSlug">
            <a :href="projectUrlHref">
              {{projectUrlPrefix}}<span class="urlSlug">{{project.urlSlug}}</span>
            </a>
          </div>
          <div v-if="!canEditUrlSlug && project && !project.urlSlug">
            <p><a :href="projectUrlHref">{{projectUrlPrefix}}<span class="urlSlug">{{project.id}}</span></a></p>
            <p><a href="mailto:contact@metaspace2020.eu">Contact us</a> to set up a custom URL for your project.</p>
          </div>
        </div>
        <div style="margin-bottom: 2em">
          <h2>Datasets</h2>
          <p>
            <router-link :to="datasetsListLink">See all datasets</router-link>
          </p>
        </div>
        <div v-if="canEdit && project">
          <h2>Delete project</h2>
          <p>
            Datasets will not be deleted, but they will no longer be able to be shared with other users through this project.
          </p>
          <div style="text-align: right; margin: 1em 0;">
            <el-button
              type="danger"
              @click="handleDeleteProject"
              :loading="isDeletingProject">
              Delete project
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Watch } from 'vue-property-decorator';
  import {
    acceptRequestToJoinProjectMutation,
    deleteProjectMutation,
    editProjectQuery,
    EditProjectQuery,
    EditProjectQueryMember,
    inviteUserToProjectMutation,
    removeUserFromProjectMutation,
    UpdateProjectMutation,
    updateProjectMutation,
  } from '../../api/project';
  import gql from 'graphql-tag';
  import EditProjectForm from './EditProjectForm.vue';
  import MembersList from '../../components/MembersList.vue';
  import { UserRole } from '../../api/user';
  import { encodeParams } from '../Filters';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import reportError from '../../lib/reportError';
  import emailRegex from '../../lib/emailRegex';

  interface CurrentUserQuery {
    id: string;
    role: UserRole;
  }

  @Component({
    components: {
      EditProjectForm,
      MembersList,
    },
    apollo: {
      currentUser: gql`query {
        currentUser {
          id
          role
        }
      }`,
      project: {
        query: editProjectQuery,
        loadingKey: 'membersLoading',
        variables(this: EditProjectProfile) { return { projectId: this.projectId } },
      },
    }
  })
  export default class EditProjectProfile extends Vue {
    projectLoading = 0;
    isDeletingProject = false;
    isSaving = false;
    model = {
      name: '',
      isPublic: true,
      urlSlug: '',
    };

    currentUser: CurrentUserQuery | null = null;
    project: EditProjectQuery | null = null;

    get canEdit(): boolean {
      return (this.currentUser && this.currentUser.role === 'admin')
        || (this.project && this.project.currentUserRole === 'MANAGER')
        || false;
    }
    get canEditUrlSlug(): boolean {
      return this.currentUser && this.currentUser.role === 'admin' || false;
    }
    get projectId(): string {
      return this.$route.params.projectId;
    }
    get projectName() {
      return this.project ? this.project.name : '';
    }
    get datasetsListFilter() {
      return {
        project: this.projectId,
      };
    }
    get projectUrlHref() {
      const projectIdOrSlug = this.project ? this.project.urlSlug || this.project.id : '';
      const {href} = this.$router.resolve({ name: 'project', params: { projectIdOrSlug } }, undefined, true);
      return `${location.origin}/${href}`;
    }
    get projectUrlPrefix() {
      const {href} = this.$router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true);
      return `${location.origin}/${href.replace('REMOVE', '')}`;
    }

    @Watch('project')
    setModel() {
      this.model.name = this.project && this.project.name || '';
      this.model.isPublic = this.project && this.project.isPublic || true;
      this.model.urlSlug = this.project && this.project.urlSlug || '';
    }

    get datasetsListLink() {
      return { path: '/datasets', query: encodeParams(this.datasetsListFilter) }
    }

    @ConfirmAsync(function (this: EditProjectProfile) {
      return {
        message: `Are you sure you want to delete ${this.projectName}?`,
        confirmButtonText: 'Delete project',
        confirmButtonLoadingText: 'Deleting...'
      }
    })
    async handleDeleteProject() {
      this.isDeletingProject = true;
      try {
        const projectName = this.projectName;
        await this.$apollo.mutate({
          mutation: deleteProjectMutation,
          variables: { projectId: this.projectId },
        });
        this.$message({ message: `${projectName} has been deleted`, type: 'success' });
        this.$router.push('/');
      } catch(err) {
        reportError(err);
      } finally {
        this.isDeletingProject = false;
      }
    }

    async handleSave() {
      this.isSaving = true;
      try {
        const {name, isPublic, urlSlug} = this.model;
        await this.$apollo.mutate<UpdateProjectMutation>({
          mutation: updateProjectMutation,
          variables: {
            projectId: this.projectId,
            projectDetails: {
              name,
              isPublic,
              urlSlug: this.canEditUrlSlug ? urlSlug : null,
            }
          },
        });
        this.$message({ message: `${name} has been saved`, type: 'success' });
      } catch(err) {
        reportError(err);
      } finally {
        this.isSaving = false;
      }
    }

    @ConfirmAsync(function (this: EditProjectProfile, member: EditProjectQueryMember) {
      return {
        message: `Are you sure you want to remove ${member.user.name} from ${this.projectName}?`,
        confirmButtonText: 'Remove user',
        confirmButtonLoadingText: 'Removing...'
      }
    })
    async handleRemoveUser(member: EditProjectQueryMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromProjectMutation,
        variables: { projectId: this.projectId, userId: member.user.id },
      });
      await this.$apollo.queries.project.refetch();
    }

    @ConfirmAsync(function (this: EditProjectProfile, member: EditProjectQueryMember) {
      return {
        message: `This will allow ${member.user.name} to access all private datasets that are in ${this.projectName}. Are you sure you want to accept them into the project?`,
        confirmButtonText: 'Accept request',
        confirmButtonLoadingText: 'Accepting...'
      }
    })
    async handleAcceptUser(member: EditProjectQueryMember) {
      await this.$apollo.mutate({
        mutation: acceptRequestToJoinProjectMutation,
        variables: { projectId: this.projectId, userId: member.user.id },
      });
      await this.$apollo.queries.project.refetch();
    }

    @ConfirmAsync(function (this: EditProjectProfile, member: EditProjectQueryMember) {
      return {
        message: `Are you sure you want to decline ${member.user.name}'s request for access to ${this.projectName}?`,
        confirmButtonText: 'Decline request',
        confirmButtonLoadingText: 'Declining...'
      }
    })
    async handleRejectUser(member: EditProjectQueryMember) {
      await this.$apollo.mutate({
        mutation: removeUserFromProjectMutation,
        variables: { projectId: this.projectId, userId: member.user.id },
      });
      await this.$apollo.queries.project.refetch();
    }

    @ConfirmAsync(function (this: EditProjectProfile) {
      return {
        title: 'Add member',
        message: `An email will be sent inviting them to join the project. If they accept the invitation, they will be able to access the private datasets of ${this.projectName}.`,
        showInput: true,
        inputPlaceholder: 'Email address',
        inputPattern: emailRegex,
        inputErrorMessage: 'Please enter a valid email address',
        confirmButtonText: 'Invite to project',
        confirmButtonLoadingText: 'Sending invitation...'
      }
    })
    async handleAddMember(email: string) {
      await this.$apollo.mutate({
        mutation: inviteUserToProjectMutation,
        variables: { projectId: this.projectId, email },
      });
      await this.$apollo.queries.project.refetch();
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
    width: 950px;
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
