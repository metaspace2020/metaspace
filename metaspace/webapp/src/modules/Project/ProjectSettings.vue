<template>
  <div class="project-settings max-w-measure-3 mx-auto leading-6">
    <div
      v-if="project != null"
      class="mt-6 mb-12"
    >
      <sm-form @submit="handleSave">
        <h2>Project Details</h2>
        <edit-project-form
          ref="projectForm"
          v-model="model"
          class="mt-3 mb-6 v-rhythm-6"
          :is-published="isPublished"
          :disabled="isSaving"
        />
        <short-link-field
          id="project-settings-short-link"
          v-model="model.urlSlug"
          :error="errors.urlSlug"
          :disabled="isSaving || (isPublished && !userisAdmin)"
        />
        <doi-field
          v-if="isPublished"
          id="project-settings-doi"
          v-model="model.doi"
          class="mt-6"
          :disabled="isSaving"
        />
        <!-- el-button does not submit the form *shrug* -->
        <button class="el-button el-button--primary mt-5">
          <i
            v-if="isSaving"
            class="el-icon-loading"
          />
          <span>
            Update details
          </span>
        </button>
      </sm-form>
      <div class="mt-12">
        <h2>Delete project</h2>
        <p v-if="isPublished">
          <em>Published projects cannot be deleted.</em>
        </p>
        <p v-else-if="isUnderReview">
          <em>This project is under review.</em>
          <br />
          To delete the project, remove the review link on the <router-link to="?tab=publishing">
            Publishing tab<!-- -->
          </router-link>.
        </p>
        <div v-else>
          <p>
            Datasets will not be deleted, but they will no longer be able to be shared with other users through this project.
          </p>
          <el-button
            class="mt-5"
            type="danger"
            :loading="isDeletingProject"
            @click="handleDeleteProject"
          >
            Delete project
          </el-button>
        </div>
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
  updateProjectDOIMutation,
  removeProjectDOIMutation,
} from '../../api/project'
import EditProjectForm from './EditProjectForm.vue'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import ConfirmAsync from '../../components/ConfirmAsync'
import reportError from '../../lib/reportError'
import { parseValidationErrors } from '../../api/validation'
import DoiField from './DoiField'
import ShortLinkField from './ShortLinkField'
import { SmForm } from '../../components/Form'

@Component<ProjectSettings>({
  components: {
    EditProjectForm,
    DoiField,
    ShortLinkField,
    SmForm,
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
      doi: '',
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

    get publicationDOI() {
      if (this.project) {
        const doi = this.project.externalLinks.find(_ => _.provider === 'DOI')
        if (doi && doi.link) {
          return doi.link
        }
      }
      return ''
    }

    get userisAdmin() {
      return this.currentUser && this.currentUser.role === 'admin'
    }

    @Watch('project')
    setModel() {
      this.model.name = this.project && this.project.name || ''
      this.model.isPublic = this.project ? this.project.isPublic : true
      this.model.urlSlug = this.project && this.project.urlSlug || ''
      this.model.doi = this.publicationDOI
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
        await (this.$refs.projectForm as any).validate()
        const { name, isPublic, urlSlug, doi } = this.model
        await this.$apollo.mutate<UpdateProjectMutation>({
          mutation: updateProjectMutation,
          variables: {
            projectId: this.projectId,
            projectDetails: {
              name,
              isPublic,
              urlSlug: urlSlug.length ? urlSlug : null,
            },
          },
        })

        if (this.publicationDOI && doi.length === 0) {
          await this.$apollo.mutate({
            mutation: removeProjectDOIMutation,
            variables: {
              projectId: this.projectId,
            },
          })
        } else if (doi !== this.publicationDOI) {
          await this.$apollo.mutate({
            mutation: updateProjectDOIMutation,
            variables: {
              projectId: this.projectId,
              link: doi,
            },
          })
        }

        this.$message({ message: `${name} has been saved`, type: 'success' })
        if (urlSlug !== this.projectUrlRoute.params.projectIdOrSlug) {
          this.$router.replace({
            params: { projectIdOrSlug: urlSlug || this.projectId },
            query: this.$route.query,
          })
        }
      } catch (err) {
        if (err !== false) { // false is the project validation form
          try {
            this.errors = parseValidationErrors(err)
          } finally {
            reportError(err)
          }
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

  h2 {
    @apply text-2xl leading-8 py-2 m-0;
  }

  p {
    @apply my-0;
  }
</style>
