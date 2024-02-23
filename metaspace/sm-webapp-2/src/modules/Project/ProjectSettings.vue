<template>
  <div class="project-settings max-w-measure-3 mx-auto leading-6">
    <div v-if="project != null" class="mt-6 mb-12">
      <sm-form @submit="handleSave">
        <h2>Project Details</h2>
        <edit-project-form
          ref="projectForm"
          :model-value="model"
          class="mt-3 mb-6 v-rhythm-6"
          :is-published="isPublished"
          :disabled="isSaving"
          @update:modelValue="handleUpdate"
        />
        <short-link-field
          id="project-settings-short-link"
          :model-value="model.urlSlug"
          :error="errors.urlSlug"
          :disabled="isSaving || (isPublished && !userisAdmin)"
          @update:modelValue="(value) => handleUpdate({ ...model, urlSlug: value })"
        />
        <doi-field
          v-if="isPublished"
          id="project-settings-doi"
          :model-value="model.doi"
          class="mt-6"
          :disabled="isSaving"
          @update:modelValue="(value) => handleUpdate({ ...model, doi: value })"
        />
        <!-- el-button does not submit the form *shrug* -->
        <button class="el-button el-button--primary mt-5">
          <i v-if="isSaving" class="el-icon-loading" />
          <span> Update details </span>
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
          To delete the project, remove the review link on the
          <router-link to="?tab=publishing"> Publishing tab<!-- --> </router-link>.
        </p>
        <div v-else>
          <p>
            Datasets will not be deleted, but they will no longer be able to be shared with other users through this
            project.
          </p>
          <el-button class="mt-5" type="danger" :loading="isDeletingProject" @click="handleDeleteProject">
            Delete project
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, reactive, watch, computed, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import EditProjectForm from './EditProjectForm.vue'
import DoiField from './DoiField'
import ShortLinkField from './ShortLinkField'
import { SmForm } from '../../components/Form'
import {
  deleteProjectMutation,
  editProjectQuery,
  updateProjectMutation,
  updateProjectDOIMutation,
  removeProjectDOIMutation,
} from '../../api/project'
import reportError from '../../lib/reportError'
import { parseValidationErrors } from '../../api/validation'
import { useConfirmAsync } from '../../components/ConfirmAsync'
import { currentUserRoleQuery } from '../../api/user'
import { ElMessage, ElButton } from 'element-plus'

export default defineComponent({
  components: {
    EditProjectForm,
    DoiField,
    ShortLinkField,
    SmForm,
    ElButton,
  },
  props: {
    projectId: String,
  },
  setup(props) {
    const route = useRoute()
    const router = useRouter()
    const apolloClient = inject(DefaultApolloClient)

    const projectForm = ref(null)
    const model = reactive({
      name: '',
      isPublic: true,
      urlSlug: '',
      doi: '',
    })
    const errors = ref<any>({})
    const isDeletingProject = ref(false)
    const isSaving = ref(false)
    const confirmAsync = useConfirmAsync()

    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null, { fetchPolicy: 'cache-first' })
    const currentUser = computed(() => currentUserResult.value?.currentUser)

    const { result: projectResult } = useQuery(
      editProjectQuery,
      { projectId: props.projectId },
      { fetchPolicy: 'network-only' }
    )
    const project = computed(() => projectResult.value?.project)

    const projectName = computed(() => project.value?.name || '')
    const datasetsListFilter = computed(() => props.projectId)
    const projectUrlRoute = computed(() => {
      const projectIdOrSlug = project.value ? project.value.urlSlug || project.value.id : ''
      return { name: 'project', params: { projectIdOrSlug } }
    })
    const projectUrlPrefix = computed(() => {
      const { href } = router.resolve({ name: 'project', params: { projectIdOrSlug: 'REMOVE' } }, undefined)
      return location.origin + href.replace('REMOVE', '')
    })
    const isPublished = computed(() => project.value?.publicationStatus === 'PUBLISHED')
    const isUnderReview = computed(() => project.value?.publicationStatus === 'UNDER_REVIEW')
    const userisAdmin = computed(() => currentUser.value?.role === 'admin')
    const publicationDOI = computed(() => {
      if (project.value) {
        const doi = project.value.externalLinks.find((_) => _.provider === 'DOI')
        if (doi && doi.link) {
          return doi.link
        }
      }
      return ''
    })

    const handleUpdate = (newModel) => {
      Object.assign(model, newModel)
    }

    watch(project, (newProject) => {
      if (newProject) {
        model.name = newProject.name || ''
        model.isPublic = newProject.isPublic
        model.urlSlug = newProject.urlSlug || ''
        model.doi = newProject.doi || ''
      }
    })

    const handleDeleteProject = async () => {
      const confirmOptions = {
        message: `Are you sure you want to delete ${projectName.value}?`,
        confirmButtonText: 'Delete project',
        confirmButtonLoadingText: 'Deleting...',
      }

      await confirmAsync(confirmOptions, async () => {
        isDeletingProject.value = true
        try {
          await apolloClient.mutate({
            mutation: deleteProjectMutation,
            variables: { projectId: props.projectId },
          })
          ElMessage({ message: `${projectName.value} has been deleted`, type: 'success' })
          router.push('/')
        } catch (err) {
          reportError(err)
        } finally {
          isDeletingProject.value = false
        }
      })
    }

    const handleSave = async () => {
      errors.value = {}
      isSaving.value = true
      try {
        await projectForm.value.validate()
        const { name, isPublic, urlSlug, doi } = model
        await apolloClient.mutate({
          mutation: updateProjectMutation,
          variables: {
            projectId: props.projectId,
            projectDetails: {
              name,
              isPublic,
              urlSlug: urlSlug.length ? urlSlug : null,
            },
          },
        })

        if (publicationDOI.value && doi.length === 0) {
          await apolloClient.mutate({
            mutation: removeProjectDOIMutation,
            variables: {
              projectId: props.projectId,
            },
          })
        } else if (doi !== publicationDOI.value) {
          await apolloClient.mutate({
            mutation: updateProjectDOIMutation,
            variables: {
              projectId: props.projectId,
              link: doi,
            },
          })
        }

        ElMessage({ message: `${name} has been saved`, type: 'success' })
        if (urlSlug !== projectUrlRoute.value.params.projectIdOrSlug) {
          router.replace({
            params: { projectIdOrSlug: urlSlug || props.projectId },
            query: route.query,
          })
        }
      } catch (err) {
        if (err !== false) {
          // false is the project validation form
          try {
            errors.value = parseValidationErrors(err)
          } finally {
            reportError(err)
          }
        }
      } finally {
        isSaving.value = false
      }
    }

    return {
      handleDeleteProject,
      handleSave,
      projectForm,
      datasetsListFilter,
      projectUrlRoute,
      projectUrlPrefix,
      publicationDOI,
      model,
      errors,
      isDeletingProject,
      isSaving,
      router,
      projectName,
      isPublished,
      isUnderReview,
      userisAdmin,
      project,
      handleUpdate,
    }
  },
})
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
