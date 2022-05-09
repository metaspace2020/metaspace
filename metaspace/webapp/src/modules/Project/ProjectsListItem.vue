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
              <router-link :to="datasetsLink"><span>{{ project.numDatasets | plural('dataset', 'datasets') }}</span></router-link>,
            </span>
            {{ project.numMembers | plural('member', 'members') }}
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
              <router-link
                v-if="manager.user.primaryGroup"
                :to="groupHref(manager)"
              >
                {{ manager.user.primaryGroup.group.shortName }}<!--
              --></router-link><span v-if="(ind+1 < projectManagers.length) && manager.user.primaryGroup">, </span>
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
import Vue from 'vue'
import { Component, Prop } from 'vue-property-decorator'
import { deleteProjectMutation, ProjectsListProject } from '../../api/project'
import { encodeParams } from '../Filters'
import isValid from 'date-fns/is_valid'
import parse from 'date-fns/parse'
import format from 'date-fns/format'
import { CurrentUserRoleResult } from '../../api/user'
import ConfirmAsync from '../../components/ConfirmAsync'
import { plural } from '../../lib/vueFilters'
import { ProjectRoleOptions as UPRO } from '../../api/project'
import ElapsedTime from '../../components/ElapsedTime'
import CopyButton from '../../components/CopyButton.vue'

  interface managerGroupName {
    user: {
      name: string
      primaryGroup: {
        group: {
          id: string,
          shortName: string
        }
      }
    },
    role: string
  }

  @Component({
    filters: {
      plural,
    },
    components: {
      ElapsedTime,
      CopyButton,
    },
  })

export default class ProjectsListItem extends Vue {
    @Prop({ type: Object })
    currentUser!: CurrentUserRoleResult | null;

    @Prop({ type: Object, required: true })
    project!: ProjectsListProject;

    @Prop({ type: Function, required: true })
    refreshData!: () => void;

    get projectManagers(): Array<Object> {
      return this.project.members.filter(member => (member.role === UPRO.MANAGER))
    }

    get projectLink() {
      return {
        name: 'project',
        params: { projectIdOrSlug: this.project.urlSlug || this.project.id },
      }
    }

    get datasetsLink() {
      return {
        path: '/datasets',
        query: encodeParams({ project: this.project.id }),
      }
    }

    get annotationsLink() {
      return {
        path: '/annotations',
        query: encodeParams({ project: this.project.id, database: '' }),
      }
    }

    get manageLink() {
      return {
        name: 'project',
        params: { projectIdOrSlug: this.project.urlSlug || this.project.id },
        query: { tab: 'settings' },
      }
    }

    get userIsAdmin() {
      return this.currentUser && this.currentUser.role === 'admin'
    }

    get userIsManager() {
      return this.project.currentUserRole === 'MANAGER'
    }

    get canManage() {
      return this.userIsAdmin || this.userIsManager
    }

    get canDelete() {
      return (
        this.userIsAdmin || (
          this.userIsManager && this.project.publicationStatus === 'UNPUBLISHED'
        )
      )
    }

    shortGroupName(manager: managerGroupName): string|null {
      if (manager.user.primaryGroup !== null) {
        return manager.user.primaryGroup.group.shortName
      } else {
        return null
      }
    }

    groupHref(manager: managerGroupName) {
      return {
        name: 'group',
        params: {
          groupIdOrSlug: manager.user.primaryGroup.group.id,
        },
      }
    }

    @ConfirmAsync(function(this: ProjectsListItem) {
      return {
        message: `Are you sure you want to delete ${this.project.name}?`,
        confirmButtonText: 'Delete project',
        confirmButtonLoadingText: 'Deleting...',
      }
    })
    async handleDeleteProject() {
      const projectName = this.project.name
      await this.$apollo.mutate({
        mutation: deleteProjectMutation,
        variables: { projectId: this.project.id },
      })
      await this.refreshData()
      this.$message({ message: `${projectName} has been deleted`, type: 'success' })
    }
}

</script>
<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";

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
