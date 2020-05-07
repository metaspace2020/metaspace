<template>
  <div class="project-settings">
    <div class="header-row">
      <h2>Project Details</h2>
      <div class="flex-spacer" />

      <div class="header-row-buttons">
        <el-button
          v-if="project"
          type="primary"
          :loading="isSaving"
          @click="handleSave"
        >
          Save
        </el-button>
      </div>
    </div>
    <edit-project-form
      v-model="model"
      :is-published="isPublished"
      :disabled="isSaving"
    />
    <div
      v-if="project != null && (project.isPublic || project.urlSlug)"
      style="margin-bottom: 2em"
    >
      <h2>Custom URL</h2>
      <p
        v-if="errors.urlSlug"
        class="text-danger text-sm my-2 font-medium"
      >
        {{ errors.urlSlug }}
      </P>
      <div class="max-w-measure-3">
        <el-input
          v-model="model.urlSlug"
          :class="{ 'sm-form-error': errors.urlSlug }"
          :disabled="isSaving"
        >
          <span slot="prepend">{{ projectUrlPrefix }}</span>
        </el-input>
      </div>
    </div>
    <div v-if="project">
      <h2>Delete project</h2>
      <p v-if="isPublished">
        <em>Published projects cannot be deleted.</em>
      </p>
      <p v-else-if="isUnderReview">
        <em>This project is under review.</em>
        <br /> <!-- hacking the layout -->
        <br />
        To delete this project, first remove the review link on the <router-link to="?tab=publishing">
          Publishing tab<!-- -->
        </router-link>.
      </p>
      <div
        v-else
        class="flex justify-between items-start"
      >
        <p class="max-w-measure-3 mt-0 leading-snug">
          Datasets will not be deleted, but they will no longer be able to be shared with other users through this project.
        </p>
        <el-button
          type="danger"
          :loading="isDeletingProject"
          @click="handleDeleteProject"
        >
          Delete project
        </el-button>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Prop, Watch } from 'vue-property-decorator'
import {
  deleteProjectMutation,
  editProjectQuery,
  EditProjectQuery,
  UpdateProjectMutation,
  updateProjectMutation,
} from '../../api/project'
import EditProjectForm from './EditProjectForm.vue'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import ConfirmAsync from '../../components/ConfirmAsync'
import reportError from '../../lib/reportError'
import { parseValidationErrors } from '../../api/validation'

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
    },
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

    errors: {[field: string]: string} = {}

    currentUser: CurrentUserRoleResult | null = null;
    project: EditProjectQuery | null = null;

    get projectName() {
      return this.project ? this.project.name : ''
    }

    get datasetsListFilter() {
      return {
        project: this.projectId,
      }
    }

    get projectUrlRoute() {
      const projectIdOrSlug = this.project ? this.project.urlSlug || this.project.id : ''
      return { name: 'project', params: { projectIdOrSlug } }
    }

    get projectUrlPrefix() {
      const { href } = this.$router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined, true)
      return location.origin + href.replace('REMOVE', '')
    }

    get isPublished() {
      return this.project && this.project.publicationStatus === 'PUBLISHED'
    }

    get isUnderReview() {
      return this.project && this.project.publicationStatus === 'UNDER_REVIEW'
    }

    @Watch('project')
    setModel() {
      this.model.name = this.project && this.project.name || ''
      this.model.isPublic = this.project ? this.project.isPublic : true
      this.model.urlSlug = this.project && this.project.urlSlug || ''
    }

    @ConfirmAsync(function(this: ProjectSettings) {
      return {
        message: `Are you sure you want to delete ${this.projectName}?`,
        confirmButtonText: 'Delete project',
        confirmButtonLoadingText: 'Deleting...',
      }
    })
    async handleDeleteProject() {
      this.isDeletingProject = true
      try {
        const projectName = this.projectName
        await this.$apollo.mutate({
          mutation: deleteProjectMutation,
          variables: { projectId: this.projectId },
        })
        this.$message({ message: `${projectName} has been deleted`, type: 'success' })
        this.$router.push('/')
      } catch (err) {
        reportError(err)
      } finally {
        this.isDeletingProject = false
      }
    }

    async handleSave() {
      this.errors = {}
      this.isSaving = true
      try {
        const { name, isPublic, urlSlug } = this.model
        const slugChanged = urlSlug !== this.projectUrlRoute.params.projectIdOrSlug
        await this.$apollo.mutate<UpdateProjectMutation>({
          mutation: updateProjectMutation,
          variables: {
            projectId: this.projectId,
            projectDetails: {
              name,
              isPublic,
              // Avoid sending a null urlSlug unless it's being intentionally unset
              ...(slugChanged ? { urlSlug: urlSlug || null } : {}),
            },
          },
        })
        this.$message({ message: `${name} has been saved`, type: 'success' })
        if (slugChanged) {
          this.$router.replace({
            params: { projectIdOrSlug: urlSlug || this.projectId },
            query: this.$route.query,
          })
        }
      } catch (err) {
        try {
          this.errors = parseValidationErrors(err)
        } finally {
          reportError(err)
        }
      } finally {
        this.isSaving = false
      }
    }
}

</script>
<style scoped lang="scss">
  .project-settings {
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
</style>
