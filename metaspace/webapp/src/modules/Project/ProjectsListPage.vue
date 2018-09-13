<template>
  <div class="page">
    <div class="page-content">
      <filter-panel level="projects" />
      <div v-loading="loading !== 0">
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

  @Component<ProjectsListPage>({
    components: {
      FilterPanel,
      ProjectsListItem,
    },
    apollo: {
      currentUser: {
        query: currentUserRoleQuery,
        loadingKey: 'loading',
      },
      allProjects: {
        query: projectsListQuery,
        loadingKey: 'loading',
        variables() {
          return {
            query: this.query,
            offset: (this.page - 1) * this.pageSize,
            limit: this.pageSize,
          }
        },
      },
      myProjects: {
        query: myProjectsListQuery,
        loadingKey: 'loading',
        skip() {
          return this.query !== '';
        },
        update(data: MyProjectsListQuery) {
          return data.myProjects && data.myProjects.projects
            ? data.myProjects.projects.map(userProject => userProject.project)
            : [];
        }
      },
      projectsCount: {
        query: projectsCountQuery,
        variables() {
          return {
            query: this.query,
          }
        },
      }
    }
  })
  export default class ProjectsListPage extends Vue {
    loading = 0;
    currentUser: CurrentUserRoleResult | null = null;
    allProjects: ProjectsListProject[] | null = null;
    myProjects: ProjectsListProject[] | null = null;
    projectsCount = 0;

    page = 1;
    pageSize = 10;

    get query(): string {
      return this.$store.getters.filter.simpleQuery || '';
    }
    get projects() {
      // Concatenate the lists, deduplicating projects by ID
      // This takes advantage of JS Objects keeping their keys in insertion order to keep the projects sorted
      const projects: Record<string, ProjectsListProject>  = {};
      if (this.query === '' && this.myProjects != null) {
        this.myProjects.forEach(p => projects[p.id] = p);
      }
      if (this.allProjects != null) {
        this.allProjects.forEach(p => projects[p.id] = p);
      }
      return Object.values(projects);
    }

    @Watch('query')
    resetPagination() {
      this.page = 1;
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
</style>
