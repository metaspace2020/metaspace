<template>
  <div class="project-settings">
    <div class="header-row">
      <h2>Project Details</h2>
      <div class="flex-spacer" />

      <div class="header-row-buttons">
        <el-button v-if="project"
                   type="primary"
                   @click="handleSave"
                   :loading="isSaving">
          Save
        </el-button>
      </div>
    </div>
    <edit-project-form v-model="model" :disabled="isSaving" />
    <div v-if="project != null && (project.isPublic || project.urlSlug || canEditUrlSlug)" style="margin-bottom: 2em">
      <h2>Custom URL</h2>
      <div v-if="canEditUrlSlug">
        <router-link :to="projectUrlRoute">{{projectUrlPrefix}}</router-link>
        <input v-model="model.urlSlug" />
      </div>
      <div v-if="!canEditUrlSlug && project && project.urlSlug">
        <router-link :to="projectUrlRoute">
          {{projectUrlPrefix}}<span class="urlSlug">{{project.urlSlug}}</span>
        </router-link>
      </div>
      <div v-if="!canEditUrlSlug && project && !project.urlSlug">
        <p>
          <router-link :to="projectUrlRoute">
            {{projectUrlPrefix}}<span class="urlSlug">{{project.id}}</span>
          </router-link>
        </p>
        <p><a href="mailto:contact@metaspace2020.eu">Contact us</a> to set up a custom URL for your project.</p>
      </div>
    </div>
    <div v-if="project">
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
</template>
<script lang="ts">
  import Vue from 'vue';
  import {Component, Prop, Watch} from 'vue-property-decorator';
  import {
    deleteProjectMutation,
    editProjectQuery,
    EditProjectQuery,
    UpdateProjectMutation,
    updateProjectMutation,
  } from '../../api/project';
  import EditProjectForm from './EditProjectForm.vue';
  import {currentUserRoleQuery, CurrentUserRoleResult} from '../../api/user';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import reportError from '../../lib/reportError';

  @Component<ProjectSettings>({
    components: {
      EditProjectForm,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
      },
      project: {
        query: editProjectQuery,
        variables() { return { projectId: this.projectId } },
      },
    }
  })
  export default class ProjectSettings extends Vue {
    @Prop()
    projectId!: string;

    projectLoading = 0;
    isDeletingProject = false;
    isSaving = false;
    model = {
      name: '',
      isPublic: true,
      urlSlug: '',
    };

    currentUser: CurrentUserRoleResult | null = null;
    project: EditProjectQuery | null = null;

    get canEditUrlSlug(): boolean {
      return this.currentUser && this.currentUser.role === 'admin' || false;
    }
    get projectName() {
      return this.project ? this.project.name : '';
    }
    get datasetsListFilter() {
      return {
        project: this.projectId,
      };
    }
    get projectUrlRoute() {
      const projectIdOrSlug = this.project ? this.project.urlSlug || this.project.id : '';
      return { name: 'project', params: { projectIdOrSlug } };
    }
    get projectUrlPrefix() {
      const {href} = this.$router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true);
      return location.origin + href.replace('REMOVE', '');
    }

    @Watch('project')
    setModel() {
      this.model.name = this.project && this.project.name || '';
      this.model.isPublic = this.project ? this.project.isPublic : true;
      this.model.urlSlug = this.project && this.project.urlSlug || '';
    }

    @ConfirmAsync(function (this: ProjectSettings) {
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
              // Avoid sending a null urlSlug unless it's being intentionally unset
              ...(this.canEditUrlSlug ? {urlSlug: urlSlug || null} : {}),
            }
          },
        });
        this.$message({ message: `${name} has been saved`, type: 'success' });
        if (this.canEditUrlSlug) {
          this.$router.replace({
            params: {projectIdOrSlug: urlSlug || this.projectId},
            query: this.$route.query,
          });
        }
      } catch(err) {
        reportError(err);
      } finally {
        this.isSaving = false;
      }
    }
  }

</script>
<style scoped lang="scss">
  .project-settings {
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
