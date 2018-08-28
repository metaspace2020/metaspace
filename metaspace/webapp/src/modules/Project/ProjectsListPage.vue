<template>
  <div class="page">
    <div class="page-content">
      <filter-panel level="projects" />
      <div v-loading="loading !== 0">
        <div v-for="project in projects" :key="project.id" class="project-item">
          <router-link :to="projectLink(project)" class="underlay" />
          <div class="info">
            <div class="info-line project-name">
              <router-link :to="projectLink(project)">{{project.name}}</router-link>
            </div>
            <div class="info-line">
              <span v-if="project.numDatasets > 0">
                <router-link :to="datasetsLink(project)">{{project.numDatasets}} Datasets</router-link>,
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
          <img v-if="!project.isPublic"
               class="private-icon"
               src="../../assets/padlock-icon.svg"
               title="This project is only visible to its members and METASPACE administrators">
        </div>
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
    ProjectsListItem,
    projectsListQuery,
  } from '../../api/project';
  import { UserRole } from '../../api/user';
  import { encodeParams, FilterPanel } from '../Filters';
  import isValid from 'date-fns/is_valid';
  import parse from 'date-fns/parse';
  import format from 'date-fns/format';

  interface CurrentUserQuery {
    id: string;
    role: UserRole;
  }

  @Component<ProjectsListPage>({
    components: {
      FilterPanel,
    },
    apollo: {
      projects: {
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
    currentUser: CurrentUserQuery | null = null;
    projects: ProjectsListItem[] | null = null;
    myProjects: ProjectsListItem[] | null = null;
    projectsCount = 0;

    page = 1;
    pageSize = 10;

    get query(): string {
      return this.$store.getters.filter.simpleQuery || '';
    }
    get allProjects() {
      // Concatenate the lists, deduplicating projects by ID
      // This takes advantage of JS Objects keeping their keys in insertion order to keep the projects sorted
      const projects: Record<string, ProjectsListItem>  = {};
      if (this.query !== '' && this.myProjects != null) {
        this.myProjects.forEach(p => projects[p.id] = p);
      }
      if (this.projects != null) {
        this.projects.forEach(p => projects[p.id] = p);
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
    projectLink({id}: ProjectsListItem) {
      return {
        name: 'project',
        params: {projectId: id}
      }
    }

    datasetsLink({name, id}: ProjectsListItem) {
      return {
        path: '/datasets',
        query: encodeParams({project: {name, id}})
      }
    }

    formatDate(date: string) {
      const parsedDate = parse(date);
      return isValid(parsedDate) ? format(parsedDate, 'YYYY-MM-DD') : '????-??-??';
    }
  }

</script>
<style scoped lang="scss">
  @import "~element-ui/packages/theme-chalk/src/common/var";

  .page {
    display: flex;
    justify-content: center;
    min-height: 80vh; // Ensure there's space for the loading spinner before is visible
  }

  .page-content {
    width: 800px;
  }

  .project-item {
    position: relative;
    border-radius: 5px;
    width: 100%;
    max-width: 800px;
    margin: 8px 0;
    padding: 10px;
    border: 1px solid #cce4ff;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    > * {
      z-index: 1;
    }
    > .underlay {
      z-index: auto;
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

</style>
