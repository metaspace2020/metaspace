import { computed, defineComponent, reactive, ref, watch } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import './DatabaseList.scss'
import { publicMolecularDBsQuery, PublicMolecularDBsQuery, MolecularDB, PublicMolecularDBsInput } from '@/api/moldb'
import {
  ElTable,
  ElTableColumn,
  ElLoading,
  ElInput,
  ElButton,
  ElIcon,
  ElTooltip,
  ElPagination,
} from '../../../lib/element-plus'
import { Search, QuestionFilled } from '@element-plus/icons-vue'
import ElapsedTime from '../../../components/ElapsedTime'
import safeJsonParse from '../../../lib/safeJsonParse'
import UploadDialog from '../UploadDialog'

interface DownloadJson {
  filename: string
  link: string
}

export default defineComponent({
  name: 'DatabaseList',
  props: {
    className: {
      type: String,
      default: 'database-list',
    },
  },
  directives: {
    loading: ElLoading.directive,
  },
  setup() {
    const searchText = ref('')
    const currentPage = ref(1)
    const pageSize = ref(10)
    const state = reactive({
      showUploadDialog: false,
    })
    const onUploadDialogClose = () => {
      state.showUploadDialog = false
    }
    const onUploadDialogDone = () => {
      state.showUploadDialog = false
      refetch()
    }
    const onUploadDialogOpen = () => {
      state.showUploadDialog = true
    }
    const queryInput = computed<PublicMolecularDBsInput>(() => ({
      orderBy: 'ORDER_BY_CREATED_DT',
      sortingOrder: 'DESCENDING',
      filter: searchText.value ? { query: searchText.value } : undefined,
      offset: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    }))

    const { result, loading, refetch } = useQuery<PublicMolecularDBsQuery>(
      publicMolecularDBsQuery,
      { input: queryInput },
      { fetchPolicy: 'cache-and-network' }
    )

    const databases = computed(() => result.value?.allPublicMolecularDBs?.databases || [])
    const totalCount = computed(() => result.value?.allPublicMolecularDBs?.totalCount || 0)

    // Watch for search text changes and reset to first page
    watch(searchText, () => {
      currentPage.value = 1
    })

    const getDownloadInfo = (database: MolecularDB): DownloadJson | null => {
      try {
        return safeJsonParse(database.downloadLink)
      } catch (e) {
        return null
      }
    }

    const handleDownload = (database: MolecularDB) => {
      const downloadInfo = getDownloadInfo(database)
      if (downloadInfo) {
        // Create a temporary anchor element to trigger download
        const link = document.createElement('a')
        link.href = downloadInfo.link
        link.download = downloadInfo.filename
        link.click()
      }
    }

    const handlePageChange = (page: number) => {
      currentPage.value = page
    }

    return () => {
      return (
        <div class="database-list min-h-screen p-6">
          <div class="max-w-4xl mx-auto">
            <div class="mb-8">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-3">
                  <h1 class="text-3xl font-bold text-gray-900">Databases</h1>
                  <ElTooltip
                    content={
                      'All the public available metabolite databases can be found here ' +
                      'for download. The databases were not curated by the METASPACE team. You ' +
                      'can also check your group specific databases on your group page.'
                    }
                    placement="right"
                    popperClass="max-w-md"
                  >
                    <ElIcon class=" cursor-help">
                      <QuestionFilled />
                    </ElIcon>
                  </ElTooltip>
                </div>
              </div>

              {/* Search Bar */}
              <div class="flex items-center gap-4 mb-6 justify-between">
                <ElInput v-model={searchText.value} placeholder="Search" class="max-w-md" clearable>
                  {{
                    prefix: () => (
                      <ElIcon>
                        <Search />
                      </ElIcon>
                    ),
                  }}
                </ElInput>
                <ElButton
                  type="primary"
                  class="flex items-center gap-2"
                  onClick={() => {
                    onUploadDialogOpen()
                  }}
                >
                  Upload public database
                </ElButton>
              </div>
            </div>

            {/* Table */}
            <ElTable v-loading={loading.value} data={databases.value} style={{ width: '100%' }}>
              <ElTableColumn
                prop="name"
                label="Name"
                minWidth={144}
                sortable
                sortBy={['name', 'version']}
                v-slots={{
                  default: ({ row }: { row: MolecularDB }) => (
                    <span>
                      <span class="text-body font-medium">{row.name}</span>{' '}
                      <span class="text-gray-700">{row.version}</span>
                    </span>
                  ),
                }}
              />
              <ElTableColumn
                prop="createdDT"
                label="Uploaded"
                minWidth={144}
                sortable
                v-slots={{
                  default: ({ row }: { row: MolecularDB }) => <ElapsedTime key={row.id} date={row.createdDT} />,
                }}
              />
              <ElTableColumn prop="group.shortName" label="Group" minWidth={120} sortable />
              <ElTableColumn
                label="Actions"
                width={120}
                align="center"
                v-slots={{
                  default: ({ row }: { row: MolecularDB }) => {
                    const downloadInfo = getDownloadInfo(row)
                    return (
                      <ElButton
                        type="primary"
                        link
                        onClick={() => handleDownload(row)}
                        disabled={!downloadInfo}
                        class="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        Download
                      </ElButton>
                    )
                  },
                }}
              />
            </ElTable>

            {/* Pagination */}
            {totalCount.value > pageSize.value && (
              <div class="flex justify-center mt-6">
                <ElPagination
                  total={totalCount.value}
                  pageSize={pageSize.value}
                  currentPage={currentPage.value}
                  onCurrentChange={handlePageChange}
                  layout="prev,pager,next"
                />
              </div>
            )}

            {state.showUploadDialog && (
              <UploadDialog onClose={onUploadDialogClose} onDone={onUploadDialogDone} isPublic={true} />
            )}
          </div>
        </div>
      )
    }
  },
})
