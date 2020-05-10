<template>
  <div class="project-settings max-w-measure-3 mx-auto leading-6">
    <div
      v-if="project != null"
      class="mt-6 mb-12"
    >
      <h2>Project Details</h2>
      <edit-project-form
        v-model="model"
        class="mt-3"
        :is-published="isPublished"
        :disabled="isSaving"
      />
      <div>
        <label for="project-settings-short-link">
          <span class="font-medium">
            Short link
          </span>
          <span class="block text-sm text-gray-800">
            Must be unique and use characters a-z, 0-9, hyphen or underscore
          </span>
          <span
            v-if="errors.urlSlug"
            class="block text-danger text-sm font-medium"
          >
            {{ errors.urlSlug }}
          </span>
        </label>
        <el-input
          id="project-settings-short-link"
          v-model="model.urlSlug"
          class="py-1"
          :class="{ 'sm-form-error': errors.urlSlug }"
          :disabled="isSaving || (isPublished && !userisAdmin)"
        >
          <span slot="prepend">{{ projectUrlPrefix }}</span>
        </el-input>
      </div>
      <div
        v-if="isPublished"
        class="mt-6"
      >
        <label for="project-settings-doi">
          <span class="font-medium">Publication DOI</span>
          <span class="block text-sm text-gray-800">
            Should link to the published paper
          </span>
        </label>
        <el-input
          id="project-settings-doi"
          v-model="model.doi"
          class="py-1"
          :disabled="isSaving"
        >
          <span slot="prepend">{{ DOI_ORG_DOMAIN }}</span>
          <span slot="append">
            <a
              :href="doiLink"
              target="_blank"
              rel="noopener"
              class="text-inherit"
            >Test link</a>
          </span>
        </el-input>
      </div>
      <el-button
        class="mt-5"
        type="primary"
        :loading="isSaving"
        @click="handleSave"
      >
        Update details
      </el-button>
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
      doi: '',
    };

    errors: {[field: string]: string} = {}

    currentUser: CurrentUserRoleResult | null = null;
    project: EditProjectQuery | null = null;

    DOI_ORG_DOMAIN = 'https://doi.org/'

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
          return doi.link.replace(this.DOI_ORG_DOMAIN, '')
        }
      }
      return ''
    }

    get doiLink() {
      return `${this.DOI_ORG_DOMAIN}${this.model.doi}`
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
              link: doi.length ? this.doiLink : null,
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

  h2 {
    @apply text-2xl leading-8 py-2 m-0;
  }

  p {
    @apply my-0;
  }
</style>
