import { computed, defineComponent, reactive, ref, watch, inject } from 'vue'
import { useQuery, useMutation, DefaultApolloClient } from '@vue/apollo-composable'
import './News.scss'
import {
  allNewsQuery,
  AllNewsQuery,
  AllNewsInput,
  News,
  createNewsMutation,
  deleteNewsMutation,
  recordNewsEventMutation,
  unreadNewsCountQuery,
  CreateNewsInput,
  NewsType,
  NewsVisibility,
} from '../../api/news'
import { currentUserRoleQuery, CurrentUserRoleResult } from '../../api/user'
import {
  ElLoading,
  ElInput,
  ElButton,
  ElIcon,
  ElPagination,
  ElDialog,
  ElRadioGroup,
  ElRadio,
  ElMessage,
  ElMessageBox,
  ElTabs,
  ElTabPane,
  ElAutocomplete,
  ElTag,
  ElDatePicker,
} from '../../lib/element-plus'
import gql from 'graphql-tag'
import { Search, Delete, View, Plus, Document, SetUp, User } from '@element-plus/icons-vue'
import ElapsedTime from '../../components/ElapsedTime'
import RichText from '../../components/RichText/RichText'
import { NewsDialog } from './NewsDialog'
import safeJsonParse from '../../lib/safeJsonParse'

// Utility function to extract plain text from Tiptap JSON
const extractPlainText = (content: string): string => {
  try {
    const parsed = safeJsonParse(content)
    if (!parsed || typeof parsed !== 'object') {
      return content
    }

    const extractTextFromNode = (node: any): string => {
      if (node.text) {
        return node.text
      }
      if (node.content && Array.isArray(node.content)) {
        return node.content.map(extractTextFromNode).join(' ')
      }
      return ''
    }

    return extractTextFromNode(parsed)
  } catch {
    return content
  }
}

// GraphQL query for searching users
const allUsersQuery = gql`
  query AllUsers($query: String!) {
    allUsers(query: $query) {
      id
      name
      email
    }
  }
`

interface User {
  id: string
  name: string
  email: string
}

export default defineComponent({
  name: 'NewsList',
  directives: {
    loading: ElLoading.directive,
  },
  setup() {
    const searchText = ref('')
    const currentPage = ref(1)
    const pageSize = ref(10)
    const activeTab = ref<'all' | 'unread'>('all')

    const state = reactive({
      showCreateDialog: false,
      showViewDialog: false,
      selectedNews: null as News | null,
      createForm: {
        title: '',
        content: JSON.stringify({ type: 'doc', content: [] }),
        type: 'news' as NewsType,
        visibility: 'logged_users' as NewsVisibility,
        showOnHomePage: false,
        showFrom: null as string | null,
        showUntil: null as string | null,
        targetUserIds: [] as string[],
        blacklistUserIds: [] as string[],
      },
      selectedUsers: [] as User[],
      selectedBlacklistUsers: [] as User[],
      userSearchText: '',
      blacklistUserSearchText: '',
      isCreating: false,
    })

    // Get current user role
    const { result: userResult } = useQuery<{ currentUser: CurrentUserRoleResult }>(
      currentUserRoleQuery,
      {},
      { fetchPolicy: 'cache-first' }
    )

    const currentUser = computed(() => userResult.value?.currentUser)
    const isAdmin = computed(() => currentUser.value?.role === 'admin')

    // Compute plain text length from rich text content
    const contentPlainTextLength = computed(() => {
      return extractPlainText(state.createForm.content).length
    })

    // Check if form is valid for submission
    const isFormValid = computed(() => {
      return (
        state.createForm.title.trim().length > 0 &&
        state.createForm.title.length <= 100 &&
        contentPlainTextLength.value > 0 &&
        contentPlainTextLength.value <= 1500
      )
    })

    // Apollo client for user search
    const apolloClient = inject(DefaultApolloClient)

    // Query input
    const queryInput = computed<AllNewsInput>(() => ({
      orderBy: 'ORDER_BY_CREATED_AT',
      sortingOrder: 'DESCENDING',
      filter: {
        hasViewed: activeTab.value === 'unread' ? false : undefined,
      },
      offset: (currentPage.value - 1) * pageSize.value,
      limit: pageSize.value,
    }))

    // Fetch news
    const { result, loading, refetch } = useQuery<AllNewsQuery>(allNewsQuery, queryInput, {
      fetchPolicy: 'cache-and-network',
    })

    const newsList = computed(() => result.value?.allNews?.news || [])
    const totalCount = computed(() => result.value?.allNews?.total || 0)

    // Mutations
    const { mutate: createNews } = useMutation(createNewsMutation)
    const { mutate: deleteNews } = useMutation(deleteNewsMutation)
    const { mutate: recordNewsEvent } = useMutation(recordNewsEventMutation)

    // Watch for search text and tab changes and reset to first page
    watch([searchText, activeTab], () => {
      currentPage.value = 1
    })

    const handlePageChange = (page: number) => {
      currentPage.value = page
    }

    const getNewsIcon = (type: NewsType) => {
      switch (type) {
        case 'message':
          return Document
        case 'system_notification':
          return SetUp
        case 'news':
        default:
          return User
      }
    }

    const handleViewNews = async (news: News) => {
      state.selectedNews = news
      state.showViewDialog = true

      // Record view event if not already viewed
      if (!news.hasViewed) {
        try {
          await recordNewsEvent({
            input: {
              newsId: news.id,
              eventType: 'viewed',
            },
          })
          // Refetch to update read status
          refetch()

          // Also update the unread news count cache to update header notification
          try {
            const currentData = apolloClient.readQuery({ query: unreadNewsCountQuery })
            if (currentData && currentData.unreadNewsCount > 0) {
              apolloClient.writeQuery({
                query: unreadNewsCountQuery,
                data: {
                  unreadNewsCount: Math.max(0, currentData.unreadNewsCount - 1),
                },
              })
            }
          } catch (error) {
            console.warn('Could not update unread news count cache:', error)
            // Fallback to refetch
            apolloClient.refetchQueries({
              include: [unreadNewsCountQuery],
            })
          }
        } catch (error) {
          console.error('Error recording news view:', error)
        }
      }
    }

    const handleDeleteNews = async (news: News) => {
      try {
        await ElMessageBox.confirm(
          'Are you sure you want to delete this news item? This action cannot be undone.',
          'Delete News',
          {
            confirmButtonText: 'Delete',
            cancelButtonText: 'Cancel',
            type: 'warning',
          }
        )

        await deleteNews({ id: news.id })
        ElMessage.success('News deleted successfully')
        refetch()
      } catch (error: any) {
        if (error !== 'cancel') {
          ElMessage.error('Failed to delete news')
          console.error('Error deleting news:', error)
        }
      }
    }

    const handleCreateNews = async () => {
      if (!state.createForm.title.trim()) {
        ElMessage.warning('Please enter a title')
        return
      }

      if (state.createForm.title.length > 100) {
        ElMessage.warning('Title must be 100 characters or less')
        return
      }

      if (contentPlainTextLength.value === 0) {
        ElMessage.warning('Please enter a message')
        return
      }

      if (contentPlainTextLength.value > 1500) {
        ElMessage.warning('Message must be 1500 characters or less')
        return
      }

      // Validate content has actual text
      const plainText = extractPlainText(state.createForm.content).trim()
      if (!plainText) {
        ElMessage.warning('Please enter a message')
        return
      }

      // Validate specific users selection
      if (state.createForm.visibility === 'specific_users' && state.selectedUsers.length === 0) {
        ElMessage.warning('Please select at least one user for specific user visibility')
        return
      }

      // Validate blacklist users selection for visibility_except
      if (state.createForm.visibility === 'visibility_except' && state.selectedBlacklistUsers.length === 0) {
        ElMessage.warning('Please select at least one user to blacklist for visibility except option')
        return
      }

      // Validate date range if both dates are provided
      if (state.createForm.showFrom && state.createForm.showUntil) {
        const fromDate = new Date(state.createForm.showFrom)
        const untilDate = new Date(state.createForm.showUntil)
        if (fromDate >= untilDate) {
          ElMessage.warning('Show from date must be before show until date')
          return
        }
      }

      state.isCreating = true
      try {
        const input: CreateNewsInput = {
          title: state.createForm.title,
          content: state.createForm.content,
          type: state.createForm.type,
          visibility: state.createForm.visibility,
          showOnHomePage: state.createForm.showOnHomePage,
          showFrom: state.createForm.showFrom || undefined,
          showUntil: state.createForm.showUntil || undefined,
          targetUserIds:
            state.createForm.visibility === 'specific_users' ? state.selectedUsers.map((u) => u.id) : undefined,
          blacklistUserIds:
            state.createForm.visibility === 'visibility_except'
              ? state.selectedBlacklistUsers.map((u) => u.id)
              : undefined,
        }

        await createNews({ input })
        ElMessage.success('News created successfully')
        state.showCreateDialog = false
        resetCreateForm()
        refetch()
      } catch (error) {
        ElMessage.error('Failed to create news')
        console.error('Error creating news:', error)
      } finally {
        state.isCreating = false
      }
    }

    const resetCreateForm = () => {
      state.createForm = {
        title: '',
        content: JSON.stringify({ type: 'doc', content: [] }),
        type: 'news',
        visibility: 'logged_users',
        showOnHomePage: false,
        showFrom: null,
        showUntil: null,
        targetUserIds: [],
        blacklistUserIds: [],
      }
      state.selectedUsers = []
      state.selectedBlacklistUsers = []
      state.userSearchText = ''
      state.blacklistUserSearchText = ''
    }

    const handleCloseCreateDialog = () => {
      state.showCreateDialog = false
      resetCreateForm()
    }

    // Filter news based on search text (client-side for now)
    const filteredNewsList = computed(() => {
      if (!searchText.value) {
        return newsList.value
      }
      const query = searchText.value.toLowerCase()
      return newsList.value.filter((news) => {
        return news.title.toLowerCase().includes(query) || extractPlainText(news.content).toLowerCase().includes(query)
      })
    })

    // User search functionality
    const handleSearchUsers = async (queryString: string, callback: (suggestions: any[]) => void) => {
      if (!queryString) {
        callback([])
        return
      }

      try {
        const result = await apolloClient.query({
          query: allUsersQuery,
          variables: { query: queryString },
        })
        const users: User[] = result.data.allUsers || []
        const suggestions = users
          .filter((user) => !state.selectedUsers.some((selected) => selected.id === user.id))
          .map((user) => ({
            value: `${user.name} (${user.email})`,
            user: user,
          }))
        callback(suggestions)
      } catch (error) {
        console.error('Error searching users:', error)
        callback([])
      }
    }

    const handleSelectUser = (item: { user: User }) => {
      state.selectedUsers.push(item.user)
      state.userSearchText = ''
    }

    const handleRemoveUser = (userId: string) => {
      state.selectedUsers = state.selectedUsers.filter((user) => user.id !== userId)
    }

    // Blacklist user search functionality
    const handleSearchBlacklistUsers = async (queryString: string, callback: (suggestions: any[]) => void) => {
      if (!queryString) {
        callback([])
        return
      }

      try {
        const result = await apolloClient.query({
          query: allUsersQuery,
          variables: { query: queryString },
        })
        const users: User[] = result.data.allUsers || []
        const suggestions = users
          .filter((user) => !state.selectedBlacklistUsers.some((selected) => selected.id === user.id))
          .map((user) => ({
            value: `${user.name} (${user.email})`,
            user: user,
          }))
        callback(suggestions)
      } catch (error) {
        console.error('Error searching blacklist users:', error)
        callback([])
      }
    }

    const handleSelectBlacklistUser = (item: { user: User }) => {
      state.selectedBlacklistUsers.push(item.user)
      state.blacklistUserSearchText = ''
    }

    const handleRemoveBlacklistUser = (userId: string) => {
      state.selectedBlacklistUsers = state.selectedBlacklistUsers.filter((user) => user.id !== userId)
    }

    return () => {
      return (
        <div class="news-page  py-8 px-6 min-h-screen">
          <div class="max-w-5xl mx-auto">
            {/* Header */}
            <div class="flex items-center justify-between mb-6">
              <h1 class="text-3xl font-bold text-gray-900">News page</h1>
              {isAdmin.value && (
                <ElButton type="primary" onClick={() => (state.showCreateDialog = true)}>
                  <ElIcon class="mr-1">
                    <Plus />
                  </ElIcon>
                  Post news
                </ElButton>
              )}
            </div>

            {/* Tabs and Search */}
            <div class="bg-white rounded-lg shadow-sm">
              <div class="border-b border-gray-200">
                <div class="px-6 flex items-center justify-between">
                  {/* Tabs */}
                  <ElTabs v-model={activeTab.value} class="news-tabs">
                    <ElTabPane label="All" name="all" />
                    <ElTabPane label="Unread" name="unread" />
                  </ElTabs>

                  {/* Search */}
                  <ElInput v-model={searchText.value} placeholder="Search" class="w-64" clearable>
                    {{
                      prefix: () => (
                        <ElIcon>
                          <Search />
                        </ElIcon>
                      ),
                    }}
                  </ElInput>
                </div>
              </div>

              {/* News List */}
              <div v-loading={loading.value} class="divide-y divide-gray-200">
                {filteredNewsList.value.length === 0 ? (
                  <div class="p-12 text-center text-gray-500">{loading.value ? 'Loading...' : 'No news found'}</div>
                ) : (
                  filteredNewsList.value.map((news) => (
                    <div
                      key={news.id}
                      class="px-6 py-5 hover:bg-gray-50 transition-colors flex items-start gap-4 cursor-pointer"
                      onClick={() => handleViewNews(news)}
                    >
                      {/* Unread indicator and icon */}
                      <div class="flex items-center gap-3">
                        {!news.hasViewed ? (
                          <div class="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0" />
                        ) : (
                          <div class="w-3 h-3 flex-shrink-0" />
                        )}
                        {/* News type icon */}
                        <div class="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-full flex-shrink-0">
                          <ElIcon size={20} class="text-gray-600">
                            {(() => {
                              const IconComponent = getNewsIcon(news.type)
                              return <IconComponent />
                            })()}
                          </ElIcon>
                        </div>
                      </div>

                      {/* Content */}
                      <div class="flex-1 min-w-0">
                        <h3 class="text-lg font-medium text-gray-900 mb-1 m-0">{news.title}</h3>
                        <p class="text-gray-600 text-sm line-clamp-2">
                          {(() => {
                            const plainText = extractPlainText(news.content)
                            return plainText.length > 100 ? plainText.substring(0, 100) + '...' : plainText
                          })()}
                        </p>
                      </div>

                      {/* Time and actions */}
                      <div class="flex items-center gap-3 flex-shrink-0">
                        <span class="text-gray-500 text-sm whitespace-nowrap">
                          <ElapsedTime date={news.createdAt} />
                        </span>
                        <ElButton
                          link
                          onClick={(e: Event) => {
                            e.stopPropagation()
                            handleViewNews(news)
                          }}
                          class="text-gray-400 hover:text-gray-600 p-1"
                        >
                          <ElIcon size={20}>
                            <View />
                          </ElIcon>
                        </ElButton>
                        {isAdmin.value && (
                          <ElButton
                            link
                            onClick={(e: Event) => {
                              e.stopPropagation()
                              handleDeleteNews(news)
                            }}
                            class="text-gray-400 hover:text-red-600 p-1"
                          >
                            <ElIcon size={20}>
                              <Delete />
                            </ElIcon>
                          </ElButton>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pagination */}
            {totalCount.value > pageSize.value && (
              <div class="flex justify-center mt-6">
                <ElPagination
                  total={totalCount.value}
                  pageSize={pageSize.value}
                  currentPage={currentPage.value}
                  onCurrentChange={handlePageChange}
                  layout="prev, pager, next"
                  background
                />
              </div>
            )}

            {/* Create News Dialog */}
            <ElDialog
              modelValue={state.showCreateDialog}
              title="Create news"
              width="700px"
              onClose={handleCloseCreateDialog}
              v-slots={{
                footer: () => (
                  <div class="flex justify-end gap-3">
                    <ElButton onClick={handleCloseCreateDialog}>Cancel</ElButton>
                    <ElButton
                      type="primary"
                      onClick={handleCreateNews}
                      loading={state.isCreating}
                      disabled={!isFormValid.value || state.isCreating}
                    >
                      Create
                    </ElButton>
                  </div>
                ),
              }}
            >
              <div class="space-y-6">
                {/* Title */}
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label class="block text-sm font-medium text-gray-700">Title</label>
                    <span class={`text-xs ${state.createForm.title.length > 100 ? 'text-red-500' : 'text-gray-500'}`}>
                      {state.createForm.title.length}/100
                    </span>
                  </div>
                  <ElInput
                    v-model={state.createForm.title}
                    placeholder="Enter title"
                    size="large"
                    maxlength={100}
                    showWordLimit={true}
                  />
                </div>

                {/* Message */}
                <div>
                  <div class="flex justify-between items-center mb-2">
                    <label class="block text-sm font-medium text-gray-700">Message</label>
                    <span class={`text-xs ${contentPlainTextLength.value > 1500 ? 'text-red-500' : 'text-gray-500'}`}>
                      {contentPlainTextLength.value}/1500 characters
                    </span>
                  </div>
                  <RichText
                    key={state.showCreateDialog ? 'editing' : 'closed'}
                    content={state.createForm.content}
                    readonly={false}
                    autoFocus={true}
                    alwaysEditing={true}
                    maxCharacters={1500}
                    hideStateStatus={true}
                    update={(content: string) => {
                      state.createForm.content = content
                    }}
                    contentClassName="min-h-[160px] p-4 text-gray-800"
                  />
                  {contentPlainTextLength.value > 1500 && (
                    <div class="text-red-500 text-xs mt-1">
                      Content exceeds 1500 character limit. Please shorten your message.
                    </div>
                  )}
                </div>

                {/* Type */}
                <div>
                  <div class="text-sm font-medium text-gray-700 mb-3">Type</div>
                  <ElRadioGroup v-model={state.createForm.type} class="flex flex-row gap-2">
                    <ElRadio label="news">News</ElRadio>
                    <ElRadio label="message">Message</ElRadio>
                    <ElRadio label="system_notification">System Notification</ElRadio>
                  </ElRadioGroup>
                </div>

                {/* Visibility */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-3">Visibility</label>
                  <ElRadioGroup v-model={state.createForm.visibility} class="flex flex-col gap-2">
                    <ElRadio label="public">Public</ElRadio>
                    <ElRadio label="logged_users">Logged Users Only</ElRadio>
                    <ElRadio label="pro_users">Pro Users Only</ElRadio>
                    <ElRadio label="non_pro_users">Non-Pro Users Only</ElRadio>
                    <ElRadio label="specific_users">Specific Users</ElRadio>
                    <ElRadio label="visibility_except">All Users Except Selected</ElRadio>
                  </ElRadioGroup>
                </div>

                {/* User Selection - Only show when Specific Users is selected */}
                {state.createForm.visibility === 'specific_users' && (
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Select Users</label>

                    {/* Selected Users Tags */}
                    {state.selectedUsers.length > 0 && (
                      <div class="mb-3 flex flex-wrap gap-2">
                        {state.selectedUsers.map((user) => (
                          <ElTag key={user.id} closable onClose={() => handleRemoveUser(user.id)} class="mb-1">
                            {user.name} ({user.email})
                          </ElTag>
                        ))}
                      </div>
                    )}

                    {/* User Search Input */}
                    <ElAutocomplete
                      v-model={state.userSearchText}
                      fetchSuggestions={handleSearchUsers}
                      placeholder="Search for users by name or email..."
                      onSelect={handleSelectUser}
                      class="w-full"
                      clearable
                    />
                  </div>
                )}

                {/* Blacklist User Selection - Only show when Visibility Except is selected */}
                {state.createForm.visibility === 'visibility_except' && (
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Select Users to Exclude</label>

                    {/* Selected Blacklist Users Tags */}
                    {state.selectedBlacklistUsers.length > 0 && (
                      <div class="mb-3 flex flex-wrap gap-2">
                        {state.selectedBlacklistUsers.map((user) => (
                          <ElTag
                            key={user.id}
                            closable
                            onClose={() => handleRemoveBlacklistUser(user.id)}
                            class="mb-1"
                            type="danger"
                          >
                            {user.name} ({user.email})
                          </ElTag>
                        ))}
                      </div>
                    )}

                    {/* Blacklist User Search Input */}
                    <ElAutocomplete
                      v-model={state.blacklistUserSearchText}
                      fetchSuggestions={handleSearchBlacklistUsers}
                      placeholder="Search for users to exclude by name or email..."
                      onSelect={handleSelectBlacklistUser}
                      class="w-full"
                      clearable
                    />
                  </div>
                )}

                {/* Show From Date */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Show From (Optional)</label>
                  <ElDatePicker
                    v-model={state.createForm.showFrom}
                    type="datetime"
                    placeholder="Select start date and time"
                    format="YYYY-MM-DD HH:mm:ss"
                    valueFormat="YYYY-MM-DD HH:mm:ss"
                    class="w-full"
                    clearable
                  />
                  <div class="text-xs text-gray-500 mt-1">If set, news will only be visible from this date onwards</div>
                </div>

                {/* Show Until Date */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Show Until (Optional)</label>
                  <ElDatePicker
                    v-model={state.createForm.showUntil}
                    type="datetime"
                    placeholder="Select end date and time"
                    format="YYYY-MM-DD HH:mm:ss"
                    valueFormat="YYYY-MM-DD HH:mm:ss"
                    class="w-full"
                    clearable
                  />
                  <div class="text-xs text-gray-500 mt-1">If set, news will only be visible until this date</div>
                </div>

                {/* Display on home page */}
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-3">Display on home page</label>
                  <ElRadioGroup v-model={state.createForm.showOnHomePage}>
                    <ElRadio label={true}>Yes</ElRadio>
                    <ElRadio label={false}>No</ElRadio>
                  </ElRadioGroup>
                </div>
              </div>
            </ElDialog>

            {/* View News Dialog */}
            <NewsDialog
              modelValue={state.showViewDialog}
              news={state.selectedNews}
              onUpdate:modelValue={(value: boolean) => {
                state.showViewDialog = value
                if (!value) {
                  state.selectedNews = null
                }
              }}
              onNewsRead={() => {
                // Refresh the news list to update the viewed status
                refetch()
              }}
            />
          </div>
        </div>
      )
    }
  },
})
