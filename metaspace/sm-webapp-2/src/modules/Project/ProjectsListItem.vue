<template>
  <div class="project-item border border-solid border-gray-200 leading-5 relative rounded w-full p-5 box-border transition-shadow ease-in-out duration-200">
    <router-link
      :to="projectLink"
      class="underlay"
    />
    <div class="item-body">
      <div class="info">
        <div class="info-line project-name pr-5 flex items-start">
          <router-link
            :to="projectLink"
            class="text-2xl tracking-snug font-medium text-inherit no-underline truncate leading-none pb-2"
          >
            {{ project.name }}
          </router-link>
          <i
            v-if="!project.isPublic"
            class="el-icon-lock ml-2 text-xl"
            title="This project is only visible to its members and METASPACE administrators"
          />
          <copy-button
            class="ml-1"
            is-id
            :text="project.id"
          >
            Copy project id to clipboard
          </copy-button>
        </div>
        <div>
          <div class="info-line">
            <span v-if="project.numDatasets > 0">
              <router-link :to="datasetsLink"><span>{{ plural(project.numDatasets, 'dataset', 'datasets') }}</span></router-link>,
            </span>
            {{ plural(project.numMembers, 'member', 'members') }}
          </div>
          <div
            v-if="projectManagers.length>0"
            class="info-line"
          >
            Managed by
            <span
              v-for="(manager, ind) in projectManagers"
              :key="manager.user.id"
            >
              <span class="font-medium">{{ manager.user.name }}</span><!--
              --><span v-if="(ind < projectManagers.length)">
                <span v-if="manager.user.primaryGroup || ind+1 < projectManagers.length">, </span>
              </span>
<!--              <router-link-->
<!--                v-if="manager.user.primaryGroup"-->
<!--                :to="groupHref(manager)"-->
<!--              >-->
<!--                {{ manager.user.primaryGroup.group.shortName }}&lt;!&ndash;-->
<!--              &ndash;&gt;</router-link><span v-if="(ind+1 < projectManagers.length) && manager.user.primaryGroup">, </span>-->
            </span>
          </div>
          <div class="info-line">
            <span v-if="project.publicationStatus === 'PUBLISHED'">
              Published <elapsed-time :date="project.publishedDT" />
            </span>
            <span v-else-if="canManage && project.publicationStatus === 'UNDER_REVIEW'">
              Under review
            </span>
            <span v-else-if="project.latestUploadDT != null">
              Last submission <elapsed-time :date="project.latestUploadDT" />
            </span>
            <span v-else>
              Created <elapsed-time :date="project.createdDT" />
            </span>
          </div>
          <div
            v-if="project.description"
            class="description"
          >
            {{ project.description }}
          </div>
        </div>
      </div>
      <div class="actions">
        <div v-if="project.numDatasets > 0">
          <i class="el-icon-picture" />
          <router-link :to="annotationsLink">
            Browse annotations
          </router-link>
        </div>
        <div v-if="canManage">
          <i class="el-icon-edit" />
          <router-link :to="manageLink">
            Manage project
          </router-link>
        </div>
        <div v-if="canDelete">
          <i class="el-icon-delete" />
          <a
            href="#"
            class="text-danger"
            @click.prevent="handleDeleteProject"
          >Delete project</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import {defineComponent, ref, computed, toRefs, PropType, inject} from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import ElapsedTime from '../../components/ElapsedTime'
import CopyButton from '../../components/CopyButton.vue'
import { ProjectRoleOptions as UPRO } from '../../api/project'
import { useConfirmAsync } from '../../components/ConfirmAsync'
import { deleteProjectMutation, ProjectsListProject } from '../../api/project'
import { ElMessage } from 'element-plus'
import {plural} from "../../lib/vueFilters";
import {CurrentUserRoleResult} from "../../api/user";
import {DefaultApolloClient} from "@vue/apollo-composable";

interface ManagerGroupName {
  user: {
    name: string
    primaryGroup?: {
      group: {
        id: string
        shortName: string
      }
    }
  }
  role: string
}

export default defineComponent({
  components: {
    ElapsedTime,
    CopyButton,
  },
  props: {
    currentUser: Object as PropType<CurrentUserRoleResult | null>,
    project: {
      type: Object as PropType<ProjectsListProject | any>,
      required: true,
    },
    refreshData: Function as PropType<() => void>,
  },
  setup(props) {
    const apolloClient = inject(DefaultApolloClient);
    const { currentUser, project } = toRefs(props)
    const confirmAsync = useConfirmAsync();

    const projectManagers = computed(() => project.value?.members?.filter(member => (member.role === UPRO.MANAGER)) || [])
    const projectLink = computed(() => ({
      name: 'project',
      params: { projectIdOrSlug: project.value.urlSlug || project.value.id },
    }))

    const datasetsLink = computed(() => ({
      path: '/datasets',
      query: { project: project.value.id },
    }))

    const annotationsLink = computed(() => ({
      path: '/annotations',
      query: { project: project.value.id, database: '' },
    }))

    const manageLink = computed(() => ({
      name: 'project',
      params: { projectIdOrSlug: project.value.urlSlug || project.value.id },
      query: { tab: 'settings' },
    }))

    const userIsAdmin = computed(() => currentUser.value && currentUser.value.role === 'admin')
    const userIsManager = computed(() => project.value.currentUserRole === 'MANAGER')

    const canManage = computed(() => userIsAdmin.value || userIsManager.value)
    const canDelete = computed(() => userIsAdmin.value || (userIsManager.value && project.value.publicationStatus === 'UNPUBLISHED'))

    const shortGroupName = (manager: ManagerGroupName) => manager.user.primaryGroup ? manager.user.primaryGroup.group.shortName : null

    const groupHref = (manager: ManagerGroupName) => ({
      name: 'group',
      params: { groupIdOrSlug: manager.user.primaryGroup?.group.id },
    })

    async function handleDeleteProject() {
      const confirmOptions ={
        message: `Are you sure you want to delete ${project.value.name}?`,
        confirmButtonText: 'Delete project',
        confirmButtonLoadingText: 'Deleting...',
      }
      const projectName = props.project.name


      await confirmAsync(confirmOptions, async () => {
        await apolloClient.mutate({
          mutation: deleteProjectMutation,
          variables: { projectId: props.project.id },
        })
        await props.refreshData()
        ElMessage({ message: `${projectName.value} has been deleted`, type: 'success' })
      });
    }

    return {
      projectManagers,
      projectLink,
      datasetsLink,
      annotationsLink,
      manageLink,
      userIsAdmin,
      userIsManager,
      canManage,
      canDelete,
      shortGroupName,
      groupHref,
      handleDeleteProject,
      plural,
    }
  }
})
</script>


<style scoped lang="scss">
  @import "element-plus/theme-chalk/src/mixins/mixins";

  .project-item {
    max-width: 800px;
    > * {
      z-index: 1;
    }
    > .underlay {
      z-index: 0;
    }
  }

  .project-item + .project-item {
    margin: 10px 0;
  }

  .project-item:hover {
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  }

  .info {
    overflow: hidden;
    flex: auto;
  }

  .item-body {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    > * {
      z-index: 1;
    }
  }

  .info-line {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .private-icon {
    margin-left: 3px;
    margin-bottom: -1px;
    width: 20px;
    opacity: 0.4;
  }

  .underlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }

  .actions {
    flex: 0 0 170px;
  }

  .annotations {
    position: absolute;
    top: 25px;
    right: 20px;
    width: 45px;
    cursor: pointer;
  }
</style>
