<template>
  <div class="project-item">
    <router-link :to="projectLink" class="underlay" />
    <div class="item-body">
      <div class="info">
        <div class="info-line project-name">
          <router-link :to="projectLink"><span style="margin-left: 5px">{{project.name}}</span></router-link>
          <img v-if="!project.isPublic"
               class="private-icon"
               src="../../assets/padlock-icon.svg"
               title="This project is only visible to its members and METASPACE administrators">
        </div>
        <div style="margin-left: 12px">
          <div class="info-line">
            <span v-if="project.numDatasets > 0">
              <router-link :to="datasetsLink"><span>{{project.numDatasets | plural('Dataset', 'Datasets')}}</span></router-link>,
            </span>
            {{project.numMembers | plural('Member', 'Members')}}
          </div>
          <div class="info-line" v-if="projectManagers.length>0">
            <span>Manager<span v-if="projectManagers.length>1">s</span>:</span>
            <span v-for="(manager, ind) in projectManagers">
              {{manager.user.name}}<span v-if="(ind < projectManagers.length)">
              <span v-if="manager.user.primaryGroup || ind+1 < projectManagers.length">, </span></span>
              <router-link class="group-link" v-if="manager.user.primaryGroup" :to="groupHref(manager)">
                {{manager.user.primaryGroup.group.shortName}}<!--
              --></router-link><span v-if="(ind+1 < projectManagers.length) && manager.user.primaryGroup">, </span>
            </span>
          </div>
          <div class="info-line">
            <span v-if="project.latestUploadDT != null" >
              Last submission <b><span style="font-size: 14px">{{formatDate(project.latestUploadDT)}}</span></b>
            </span>
              <span v-else >
                Created on <b><span style="font-size: 14px">{{formatDate(project.createdDT)}}</span></b>
            </span>
          </div>
          <div class="description" v-if="project.description">
            {{project.description}}
          </div>
        </div>
      </div>
      <div class="actions">
        <div v-if="project.numDatasets > 0">
          <i class="el-icon-picture" />
          <router-link :to="annotationsLink">Browse annotations</router-link>
        </div>
        <div v-if="canManage">
          <i class="el-icon-edit"></i>
          <router-link :to="manageLink">Manage project</router-link>
        </div>
        <div v-if="canManage" class="delete">
          <i class="el-icon-delete"></i>
          <a href="#" @click.prevent="handleDeleteProject">Delete project</a>
        </div>
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Prop } from 'vue-property-decorator';
  import { deleteProjectMutation, ProjectsListProject } from '../../api/project';
  import { encodeParams } from '../Filters';
  import isValid from 'date-fns/is_valid';
  import parse from 'date-fns/parse';
  import format from 'date-fns/format';
  import { CurrentUserRoleResult } from '../../api/user';
  import ConfirmAsync from '../../components/ConfirmAsync';
  import {plural} from '../../lib/vueFilters';
  import {ProjectRoleOptions as UPRO} from '../../api/project';

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
      plural
    }
  })

  export default class ProjectsListItem extends Vue {
    @Prop({type: Object})
    currentUser!: CurrentUserRoleResult | null;
    @Prop({type: Object, required: true})
    project!: ProjectsListProject;
    @Prop({type: Function, required: true})
    refreshData!: () => void;

    get projectManagers(): Array<Object> {
      return this.project.members.filter(member => (member.role === UPRO.MANAGER))
    }

    get projectLink() {
      return {
        name: 'project',
        params: {projectIdOrSlug: this.project.urlSlug || this.project.id}
      }
    }

    get datasetsLink() {
      return {
        path: '/datasets',
        query: encodeParams({project: this.project.id })
      }
    }

    get annotationsLink() {
      return {
        path: '/annotations',
        query: encodeParams({project: this.project.id, database: ''})
      }
    }
    get manageLink() {
      return {
        name: 'project',
        params: {projectIdOrSlug: this.project.urlSlug || this.project.id},
        query: {tab: 'settings'},
      }
    }

    get canManage() {
      return (this.currentUser && this.currentUser.role === 'admin') || this.project.currentUserRole === 'MANAGER';
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
      };
    }

    formatDate(date: string) {
      const parsedDate = parse(date);
      return isValid(parsedDate) ? format(parsedDate, 'YYYY-MM-DD') : '????-??-??';
    }

    @ConfirmAsync(function (this: ProjectsListItem) {
      return {
        message: `Are you sure you want to delete ${this.project.name}?`,
        confirmButtonText: 'Delete project',
        confirmButtonLoadingText: 'Deleting...'
      }
    })
    async handleDeleteProject() {
      const projectName = this.project.name;
      await this.$apollo.mutate({
        mutation: deleteProjectMutation,
        variables: { projectId: this.project.id },
      });
      await this.refreshData();
      this.$message({ message: `${projectName} has been deleted`, type: 'success' });
    }
  }

</script>
<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";

  .project-item {
    position: relative;
    border-radius: 5px;
    width: 100%;
    max-width: 800px;
    margin: 8px 0;
    padding: 8px 0 10px 8px;
    border: 1px solid #cce4ff;
    box-sizing: border-box;
    > * {
      z-index: 1;
    }
    > .underlay {
      z-index: 0;
    }
  }

  .info {
    overflow: hidden;
    flex: auto;
    padding-right: 12px;
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
    margin-top: 1px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .description {
    $line-height: 1.2em;
    $lines: 5;
    line-height: $line-height;
    max-height: $line-height * $lines;
    overflow: hidden;
    position: relative;
    // Make content have uniform margins that don't count towards the line limit
    margin-top: 0.5em;
    &>*:first-child { margin-top: 0; }
    &>*:last-child { margin-bottom: 0; }
    // Fade out content if it's too long
    &:before {
      content:'';
      width:100%;
      height:100%;
      position:absolute;
      left:0;
      top:0;
      background:linear-gradient(transparent ($line-height * ($lines - 1.5)), white);
    }
  }

  .project-name {
    margin-bottom: 2px;

    a {
      font-size: 1.5em;
      text-decoration: none;
      color: #333;
    }
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
    padding-top: 5px;
    margin-right: 10px;
  }

  .annotations {
    position: absolute;
    top: 25px;
    right: 20px;
    width: 45px;
    cursor: pointer;
  }

  .delete, .delete > a {
    color: #a00;
  }

  .group-link {
    cursor: pointer;
    color: sienna;
  }


</style>
