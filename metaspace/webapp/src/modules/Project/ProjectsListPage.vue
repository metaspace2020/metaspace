<template>
  <div class="page">
    <create-project-dialog
      :visible="showCreateProjectDialog && currentUser != null"
      :current-user-id="currentUser && currentUser.id"
      @close="handleCloseCreateProject"
      @create="handleProjectCreated"
    />
    <div class="page-content">
      <div
        v-if="currentUser"
        class="flex flex-row items-center justify-end flex-1 w-full py-4"
      >
        <el-button
          type="primary"
          size="small"
          @click="handleOpenCreateProject"
        >
          Create project
        </el-button>
      </div>
      <div class="header-row">
        <filter-panel
          level="projects"
          :simple-filter-options="simpleFilterOptions"
        />
        <div
          class="flex flex-row items-center justify-end flex-1"
        >
          <sort-dropdown
            class="pb-2"
            size="default"
            :options="sortingOptions"
            @sort="handleSortChange"
          />
        </div>
      </div>

      <div class="clearfix" />
      <div
        v-loading="loading !== 0"
        style="min-height: 100px;"
      >
        <projects-list-item
          v-for="project in projects"
          :key="project.id"
          :project="project"
          :current-user="currentUser"
          :refresh-data="handleRefreshData"
        />
      </div>
      <div
        v-if="projectsCount > pageSize || page !== 1"
        style="text-align: center;"
      >
        <el-pagination
          :total="projectsCount"
          :page-size="pageSize"
          :current-page.sync="page"
          layout="prev,pager,next"
        />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from 'vue'
import { Component, Watch } from 'vue-property-decorator'
import {
  MyProjectsListQuery,
  myProjectsListQuery,
  projectsCountQuery,
  ProjectsListProject,
  projectsListQuery,
} from '../../api/project'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import { FilterPanel } from '../Filters'
import QuickFilterBox from '../Filters/filter-components/SimpleFilterBox.vue'
import ProjectsListItem from './ProjectsListItem.vue'
import CreateProjectDialog from './CreateProjectDialog.vue'
import { getLocalStorage } from '../../lib/localStorage'
import { SortDropdown } from '../../components/SortDropdown/SortDropdown'

  @Component<ProjectsListPage>({
    components: {
      FilterPanel,
      ProjectsListItem,
      CreateProjectDialog,
      QuickFilterBox,
      SortDropdown,
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
          return this.filter !== 'all'
        },
        variables() {
          return {
            query: this.query,
            offset: (this.page - 1) * this.pageSize,
            limit: this.pageSize,
            orderBy: this.orderBy,
            sortingOrder: this.sortingOrder,
          }
        },
      },
      allProjectsCount: {
        query: projectsCountQuery,
        skip() {
          return this.filter !== 'all'
        },
        variables() {
          return {
            query: this.query,
          }
        },
        update(data: any) {
          return data.projectsCount
        },
      },
      myProjects: {
        query: myProjectsListQuery,
        loadingKey: 'loading',
        skip() {
          return this.filter !== 'my'
        },
        update(data: MyProjectsListQuery) {
          return data.myProjects && data.myProjects.projects
            ? data.myProjects.projects.map(userProject => userProject.project)
            : []
        },
      },
    },
  })
export default class ProjectsListPage extends Vue {
    loading = 0;
    currentUser: CurrentUserRoleResult | null = null;
    allProjects: ProjectsListProject[] | null = null;
    myProjects: ProjectsListProject[] | null = null;
    allProjectsCount = 0;
    orderBy : string = 'ORDER_BY_POPULARITY';
    sortingOrder : string = 'DESCENDING';
    sortingOptions: any[] = [
      {
        value: 'ORDER_BY_POPULARITY',
        label: 'Project size',
      },
      {
        value: 'ORDER_BY_DATE',
        label: 'Creation date',
      },
      {
        value: 'ORDER_BY_UP_DATE',
        label: 'Publication date',
      },
      {
        value: 'ORDER_BY_NAME',
        label: 'Project name',
      },
      {
        value: 'ORDER_BY_MANAGER_NAME',
        label: 'Manager name',
      },
      {
        value: 'ORDER_BY_DATASETS_COUNT',
        label: 'Number of datasets',
      },
      {
        value: 'ORDER_BY_MEMBERS_COUNT',
        label: 'Number of members',
      },
    ]

    showCreateProjectDialog = false;
    page = 1;
    pageSize = 10;

    get query(): string {
      return this.$store.getters.filter.simpleQuery || ''
    }

    get filter(): 'all' | 'my' {
      const { simpleFilter } = this.$store.getters.filter
      return simpleFilter === 'my-projects' && this.currentUser != null ? 'my' : 'all'
    }

    get filteredMyProjects() {
      if (this.query && this.myProjects != null) {
        return this.myProjects.filter(p => p.name.toLowerCase().includes(this.query.toLowerCase()))
      } else {
        return this.myProjects || []
      }
    }

    get projects() {
      if (this.filter === 'my') {
        return this.filteredMyProjects.slice((this.page - 1) * this.pageSize, this.page * this.pageSize)
      } else {
        return this.allProjects
      }
    }

    get projectsCount() {
      if (this.filter === 'my') {
        return this.filteredMyProjects.length
      } else {
        return this.allProjectsCount
      }
    }

    get simpleFilterOptions() {
      if (this.currentUser == null) {
        return null
      } else {
        // due to some misbehaviour from setting initial value from getLocalstorage with null values
        // on filterSpecs, the filter is being initialized here if user is logged
        const localSimpleFilter = this.$store.getters.filter.simpleFilter
          ? this.$store.getters.filter.simpleFilter : (getLocalStorage('simpleFilter') || null)
        this.$store.commit('updateFilter', {
          ...this.$store.getters.filter,
          simpleFilter: localSimpleFilter,
        })

        return [
          { value: null, label: 'All projects' },
          { value: 'my-projects', label: 'My projects' },
        ]
      }
    }

    @Watch('query')
    @Watch('tab')
    resetPagination() {
      this.page = 1
    }

    created() {
      this.$store.commit('updateFilter', this.$store.getters.filter)
    }

    async handleRefreshData() {
      await Promise.all([
        this.$apollo.queries.allProjects.refetch(),
        this.$apollo.queries.myProjects.refetch(),
        this.$apollo.queries.allProjectsCount.refetch(),
      ])
    }

    handleOpenCreateProject() {
      this.showCreateProjectDialog = true
    }

    handleCloseCreateProject() {
      this.showCreateProjectDialog = false
    }

    handleSortChange(value: string, sortingOrder: string) {
      this.orderBy = !value ? 'ORDER_BY_POPULARITY' : value
      this.sortingOrder = !sortingOrder ? 'DESCENDING' : sortingOrder
    }

    handleProjectCreated({ id }: {id: string}) {
      this.$router.push({ name: 'project', params: { projectIdOrSlug: id } })
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

  .el-pagination {
    margin: 10px 0;
  }
</style>
