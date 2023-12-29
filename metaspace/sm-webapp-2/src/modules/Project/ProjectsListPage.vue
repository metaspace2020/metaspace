<template>
  <div class="page">
    <create-project-dialog
      v-if="currentUser != null"
      :visible="showCreateProjectDialog"
      :current-user-id="currentUser && currentUser.id"
      @close="handleCloseCreateProject"
      @create="handleProjectCreated"
    />
    <div class="page-content">
      <div
        v-if="currentUser != null"
        class="flex flex-row items-center justify-end flex-1 w-full py-4"
      >
        <el-button
          type="primary"
          size="default"
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
            size="large"
            :options="sortingOptions"
            @sort="handleSortChange"
          />
        </div>
      </div>

      <div class="clearfix" />
      <div
        v-loading="loading"
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
          :current-page="page"
          layout="prev,pager,next"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import {onBeforeRouteUpdate, useRouter} from 'vue-router';
import { FilterPanel } from '../Filters'
import QuickFilterBox from '../Filters/filter-components/SimpleFilterBox.vue';
import ProjectsListItem from './ProjectsListItem.vue';
import CreateProjectDialog from './CreateProjectDialog.vue';
import { getLocalStorage } from '../../lib/localStorage';
import SortDropdown from '../../components/SortDropdown/SortDropdown'
import {
  MyProjectsListQuery,
  myProjectsListQuery,
  projectsCountQuery,
  ProjectsListProject,
  projectsListQuery,
} from '../../api/project'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import { useQuery } from '@vue/apollo-composable';

export default defineComponent({
  components: {
    FilterPanel,
    ProjectsListItem,
    CreateProjectDialog,
    // eslint-disable-next-line vue/no-unused-components
    QuickFilterBox,
    SortDropdown,
  },
  setup() {
    const store = useStore();
    const router = useRouter();
    const loading = ref(0);
    const showCreateProjectDialog = ref(false);
    const page = ref(1);
    const pageSize = ref(10);
    const orderBy = ref('ORDER_BY_POPULARITY');
    const sortingOrder = ref('DESCENDING');
    const sortingOptions = ref([
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
    ])


    const filter = computed(() => {
      const simpleFilter = store.getters.filter.simpleFilter;
      return simpleFilter === 'my-projects' && currentUser.value != null ? 'my' : 'all';
    });
    const query = computed(() => store.getters.filter.simpleQuery || '');

    const { result: currentUserResult } = useQuery(currentUserRoleQuery, null, { fetchPolicy: 'cache-first' });
    const currentUser = computed(() => currentUserResult.value?.currentUser as CurrentUserRoleResult | null);
    const { result: allProjectsResult, refetch: refetchAllProjects } = useQuery(projectsListQuery, () => ({
      query: query.value,
      offset: (page.value - 1) * pageSize.value,
      limit: pageSize.value,
      orderBy: orderBy.value,
      sortingOrder: sortingOrder.value,
    }), { fetchPolicy: 'cache-first' });

    const allProjects = computed(() => allProjectsResult.value?.allProjects as ProjectsListProject[] | null);

    const { result: allProjectsCountResult, refetch: refetchAllProjectsCount } = useQuery(projectsCountQuery, () => ({
      query: query.value,
    }), { fetchPolicy: 'cache-first' });

    const allProjectsCount = computed(() => allProjectsCountResult.value?.projectsCount || 0);

    const { result: myProjectsResult, refetch: refetchMyProjects } = useQuery(myProjectsListQuery,
      null, { fetchPolicy: 'cache-first' });

    const myProjects = computed(() => myProjectsResult.value?.myProjects?.projects
      ? myProjectsResult.value?.myProjects?.projects.map(userProject => userProject.project)
      : []);



    const filteredMyProjects = computed(()  => {
      if (query.value && myProjects.value != null) {
        return myProjects.value.filter(p => p.name.toLowerCase().includes(query.value.toLowerCase()))
      } else {
        return myProjects.value || []
      }
    });

    const projects = computed(() => {
      if (filter.value === 'my') {
        return filteredMyProjects.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
      } else {
        return allProjects.value
      }
    });

    const projectsCount = computed(() => {
      if (filter.value === 'my') {
        return filteredMyProjects.value.length
      } else {
        return allProjectsCount.value
      }
    });

    const simpleFilterOptions = computed(() => {
      if (currentUser.value == null) {
        return null
      } else {
        return [
          { value: '', label: 'All projects' },
          { value: 'my-projects', label: 'My projects' },
        ]
      }
    })


    watch([query, filter], () => {
      page.value = 1;
    });

    watch(currentUser, (newValue) => {
      if(!newValue) return
      // due to some misbehaviour from setting initial value from getLocalstorage with null values
      // on filterSpecs, the filter is being initialized here if user is logged
      const localSimpleFilter = store.getters.filter.simpleFilter
        ? store.getters.filter.simpleFilter : (getLocalStorage('simpleFilter') || null)
      store.commit('updateFilter', {
        ...store.getters.filter,
        simpleFilter: localSimpleFilter,
      })
    })

    onMounted(() => {
      store.commit('updateFilter', store.getters.filter);
    });

    const handleRefreshData = async () => {
      await Promise.all([
        refetchAllProjects(),
        refetchAllProjectsCount(),
        refetchMyProjects(),
      ]);
    };

    const handleOpenCreateProject = () => {
      showCreateProjectDialog.value = true;
    };

    const handleCloseCreateProject = () => {
      showCreateProjectDialog.value = false;
    };

    const handleSortChange = (value: string, order: string) => {
      orderBy.value = value || 'ORDER_BY_POPULARITY';
      sortingOrder.value = order || 'DESCENDING';
    };

    const handleProjectCreated = async ({ id }: { id: string }) => {
      handleRefreshData();
      router.push({ name: 'project', params: { projectIdOrSlug: id } });
    };

    return {
      loading,
      currentUser,
      allProjects,
      myProjects,
      allProjectsCount,
      showCreateProjectDialog,
      page,
      pageSize,
      orderBy,
      sortingOrder,
      query,
      filter,
      projects,
      projectsCount,
      handleRefreshData,
      handleOpenCreateProject,
      handleCloseCreateProject,
      handleSortChange,
      handleProjectCreated,
      sortingOptions,
      simpleFilterOptions,
    };
  }
});
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
