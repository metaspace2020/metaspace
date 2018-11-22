<template>
  <div class="page">
    <create-project-dialog
      :visible="showCreateProjectDialog && currentUser != null"
      :currentUserId="currentUser && currentUser.id"
      @close="handleCloseCreateProject"
      @create="handleProjectCreated"
    />
    <div class="page-content">
      <div class="header-row">
        <el-radio-group v-if="currentUser != null" v-model="tab">
          <el-radio-button :label="ALL_PROJECTS" />
          <el-radio-button :label="MY_PROJECTS" />
        </el-radio-group>
        <filter-panel level="projects" />
        <div style="flex-grow: 1" />
        <el-button v-if="currentUser" @click="handleOpenCreateProject">Create project</el-button>
      </div>
      <div class="clearfix"/>
      <div v-loading="loading !== 0" style="min-height: 100px;">
        <projects-list-item v-for="project in projects"
                            :key="project.id"
                            :project="project"
                            :currentUser="currentUser"
                            :refreshData="handleRefreshData" />
      </div>
      <div style="text-align: center;" v-if="projectsCount > pageSize || page !== 1">
      <el-pagination :total="projectsCount"
                     :page-size="pageSize"
                     :current-page.sync="page"
                     layout="prev,pager,next" />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
  import Vue from 'vue';
  import { Component, Watch } from 'vue-property-decorator';
  import {
    MyProjectsListQuery,
    myProjectsListQuery,
    projectsCountQuery,
    ProjectsListProject,
    projectsListQuery,
  } from '../../api/project';
  import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user';
  import { FilterPanel } from '../Filters';
  import ProjectsListItem from './ProjectsListItem.vue';
  import CreateProjectDialog from './CreateProjectDialog.vue';

  @Component<ProjectsListPage>({
    components: {
      FilterPanel,
      ProjectsListItem,
      CreateProjectDialog,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        fetchPolicy: 'cache-first',
        loadingKey: 'loading',
      },
      allProjects: {
        query: projectsListQuery,
        loadingKey: 'loading',
        skip() {
          return this.tab !== this.ALL_PROJECTS;
        },
        variables() {
          return {
            query: this.query,
            offset: (this.page - 1) * this.pageSize,
            limit: this.pageSize,
          }
        },
      },
      allProjectsCount: {
        query: projectsCountQuery,
        skip() {
          return this.tab !== this.ALL_PROJECTS;
        },
        variables() {
          return {
            query: this.query,
          }
        },
        update(data: any) {
          return data.projectsCount;
        }
      },
      myProjects: {
        query: myProjectsListQuery,
        loadingKey: 'loading',
        skip() {
          return this.tab !== this.MY_PROJECTS;
        },
        update(data: MyProjectsListQuery) {
          return data.myProjects && data.myProjects.projects
            ? data.myProjects.projects.map(userProject => userProject.project)
            : [];
        }
      }
    }
  })
  export default class ProjectsListPage extends Vue {
    readonly MY_PROJECTS = 'My projects';
    readonly ALL_PROJECTS = 'All projects';
    loading = 0;
    currentUser: CurrentUserRoleResult | null = null;
    allProjects: ProjectsListProject[] | null = null;
    myProjects: ProjectsListProject[] | null = null;
    allProjectsCount = 0;
    tab = this.ALL_PROJECTS;

    showCreateProjectDialog = false;
    page = 1;
    pageSize = 10;

    get query(): string {
      return this.$store.getters.filter.simpleQuery || '';
    }
    get filteredMyProjects() {
      if (this.query && this.myProjects != null) {
        return this.myProjects.filter(p => p.name.toLowerCase().includes(this.query.toLowerCase()));
      } else {
        return this.myProjects || [];
      }
    }
    get projects() {
      if (this.tab === this.ALL_PROJECTS) {
        return this.allProjects;
      } else {
        return this.filteredMyProjects.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
      }
    }
    get projectsCount() {
      if (this.tab === this.ALL_PROJECTS) {
        return this.allProjectsCount;
      } else {
        return this.filteredMyProjects.length;
      }
    }

    @Watch('query')
    @Watch('tab')
    resetPagination() {
      this.page = 1;
    }

    @Watch('currentUser')
    resetTab() {
      if (this.currentUser == null) {
        this.tab = this.ALL_PROJECTS;
      }
    }

    created() {
      this.$store.commit('updateFilter', this.$store.getters.filter);
    }

    async handleRefreshData() {
      await Promise.all([
        this.$apollo.queries.allProjects.refetch(),
        this.$apollo.queries.myProjects.refetch(),
        this.$apollo.queries.projectsCount.refetch(),
      ])
    }

    handleOpenCreateProject() {
      this.showCreateProjectDialog = true;
    }
    handleCloseCreateProject() {
      this.showCreateProjectDialog = false;
    }
    handleProjectCreated({id}: {id: string}) {
      this.$router.push({name: 'project', params: {projectIdOrSlug: id}});
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
    width: 800px;
  }

  .header-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
  }
</style>
