<template>
  <div class="project-item">
    <router-link :to="projectLink" class="underlay" />
    <div class="item-body">
      <div class="info">
        <div class="info-line project-name">
          <router-link :to="projectLink">{{project.name}}</router-link>
        </div>
        <div class="info-line">
          <span v-if="project.numDatasets > 0">
            <router-link :to="datasetsLink">{{project.numDatasets}} Datasets</router-link>,
          </span>
          {{project.numMembers}} Members
        </div>
        <div class="info-line">
          <span v-if="project.latestUploadDT != null">
            Last submission <b>{{formatDate(project.latestUploadDT)}}</b>
          </span>
          <span v-else>
            Created on <b>{{formatDate(project.createdDT)}}</b>
          </span>
        </div>
        <div class="description" v-if="project.description">
          {{project.description}}
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
    <img v-if="!project.isPublic"
         class="private-icon"
         src="../../assets/padlock-icon.svg"
         title="This project is only visible to its members and METASPACE administrators">
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

  @Component
  export default class ProjectsListItem extends Vue {
    @Prop({type: Object})
    currentUser!: CurrentUserRoleResult | null;
    @Prop({type: Object, required: true})
    project!: ProjectsListProject;
    @Prop({type: Function, required: true})
    refreshData!: () => void;

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
        name: 'edit-project',
        params: {projectId: this.project.id}
      }
    }

    get canManage() {
      return (this.currentUser && this.currentUser.role === 'admin') || this.project.currentUserRole === 'MANAGER';
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
    padding: 10px;
    border: 1px solid #cce4ff;
    box-sizing: border-box;
    > * {
      z-index: 1;
    }
    > .underlay {
      z-index: 0;
    }
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

  .project-name a {
    font-size: 1.5em;
    text-decoration: none;
    color: $--color-text-regular;
  }

  .private-icon {
    position: absolute;
    opacity: 0.2;
    width: 24px;
    height: 32px;
    right: 10px;
    bottom: 8px;
  }

  .underlay {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
  }

  .actions {
    width: 170px;
  }

  .delete, .delete > a {
    color: #a00;
  }

</style>
