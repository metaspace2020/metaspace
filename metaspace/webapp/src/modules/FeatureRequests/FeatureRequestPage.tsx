import { defineComponent, computed, reactive, ref, inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentUserRoleQuery } from '../../api/user'
import { useQuery, DefaultApolloClient } from '@vue/apollo-composable'
import './FeatureRequestPage.scss'
import {
  ElButton,
  ElTable,
  ElTableColumn,
  ElTag,
  ElDialog,
  ElInput,
  ElNotification,
  ElSelect,
  ElOption,
  ElIcon,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
} from '../../lib/element-plus'
import {
  myFeatureRequestsQuery,
  publicFeatureRequestsQuery,
  createFeatureRequestMutation,
  approveFeatureRequestMutation,
  rejectFeatureRequestMutation,
  updateFeatureRequestStatusMutation,
  FeatureRequest,
  FeatureRequestStatus,
} from '../../api/featureRequest'
import { Fragment } from 'vue'
import { Loading, Plus } from '@element-plus/icons-vue'

interface DialogState {
  visible: boolean
  mode: 'create' | 'detail' | 'approve' | 'reject' | 'updateStatus'
  title: string
  description: string
  selectedRequest: FeatureRequest | null
  loading: boolean
  errors: {
    title: string
    description: string
    adminNotes: string
  }
  adminNotes: string
  newStatus: FeatureRequestStatus | null
}

export default defineComponent({
  name: 'FeatureRequestPage',
  setup() {
    const route = useRoute()
    const router = useRouter()
    
    // Initialize activeTab from query parameter or default to 'table'
    const initialView = route.query.view === 'board' ? 'board' : 'table'
    const activeTab = ref<'table' | 'board'>(initialView)
    const apolloClient = inject(DefaultApolloClient)
    
    // Watch for tab changes and update query parameter
    watch(activeTab, (newTab) => {
      router.replace({ query: { ...route.query, view: newTab } })
    })

    const { result: currentUserResult, loading: currentUserLoading } = useQuery<any>(currentUserRoleQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)
    const isAdmin = computed(() => currentUser.value?.role === 'admin')

    // Query my feature requests
    const {
      result: myRequestsResult,
      loading: myRequestsLoading,
      refetch: refetchMyRequests,
    } = useQuery<{ myFeatureRequests: FeatureRequest[] }>(myFeatureRequestsQuery, null, {
      fetchPolicy: 'network-only',
    })
    const myRequests = computed(() => myRequestsResult.value?.myFeatureRequests || [])

    // Query public feature requests
    const {
      result: publicRequestsResult,
      loading: publicRequestsLoading,
      refetch: refetchPublicRequests,
    } = useQuery<any>(publicFeatureRequestsQuery, null, {
      fetchPolicy: 'network-only',
    })
    const publicRequests = computed(() => publicRequestsResult.value?.publicFeatureRequests || null)

    // Dialog state
    const dialogState = reactive<DialogState>({
      visible: false,
      mode: 'create',
      title: '',
      description: '',
      selectedRequest: null,
      loading: false,
      errors: {
        title: '',
        description: '',
        adminNotes: '',
      },
      adminNotes: '',
      newStatus: null,
    })

    const openCreateDialog = () => {
      dialogState.mode = 'create'
      dialogState.title = ''
      dialogState.description = ''
      dialogState.selectedRequest = null
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.newStatus = null
      dialogState.visible = true
    }

    const openDetailDialog = (request: FeatureRequest) => {
      dialogState.mode = 'detail'
      dialogState.title = request.title
      dialogState.description = request.description
      dialogState.selectedRequest = request
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = request.adminNotes || ''
      dialogState.newStatus = null
      dialogState.visible = true
    }

    const openApproveDialog = (request: FeatureRequest) => {
      dialogState.mode = 'approve'
      dialogState.title = request.title
      dialogState.description = request.description
      dialogState.selectedRequest = request
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.newStatus = null
      dialogState.visible = true
    }

    const openRejectDialog = (request: FeatureRequest) => {
      dialogState.mode = 'reject'
      dialogState.title = request.title
      dialogState.description = request.description
      dialogState.selectedRequest = request
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.newStatus = null
      dialogState.visible = true
    }

    const openUpdateStatusDialog = (request: FeatureRequest) => {
      dialogState.mode = 'updateStatus'
      dialogState.title = request.title
      dialogState.description = request.description
      dialogState.selectedRequest = request
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = request.adminNotes || ''
      dialogState.newStatus = request.status
      dialogState.visible = true
    }

    const closeDialog = () => {
      dialogState.visible = false
      dialogState.title = ''
      dialogState.description = ''
      dialogState.selectedRequest = null
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.newStatus = null
    }

    const validateForm = (): boolean => {
      let isValid = true
      dialogState.errors = { title: '', description: '', adminNotes: '' }

      // Validate title and description for create mode
      if (dialogState.mode === 'create') {
        if (!dialogState.title.trim()) {
          dialogState.errors.title = 'Title is required'
          isValid = false
        } else if (dialogState.title.length > 200) {
          dialogState.errors.title = 'Title must be less than 200 characters'
          isValid = false
        }

        if (!dialogState.description.trim()) {
          dialogState.errors.description = 'Description is required'
          isValid = false
        } else if (dialogState.description.length > 2000) {
          dialogState.errors.description = 'Description must be less than 2000 characters'
          isValid = false
        }
      }

      // Validate admin notes for reject mode (mandatory)
      if (dialogState.mode === 'reject') {
        if (!dialogState.adminNotes.trim()) {
          dialogState.errors.adminNotes = 'Admin notes are required when rejecting a request'
          isValid = false
        }
      }

      // Validate status for updateStatus mode
      if (dialogState.mode === 'updateStatus') {
        if (!dialogState.newStatus) {
          dialogState.errors.adminNotes = 'Please select a status'
          isValid = false
        }
      }

      return isValid
    }

    const handleSubmit = async () => {
      if (!validateForm()) {
        return
      }

      if (!apolloClient) {
        ElNotification({
          title: 'Error',
          message: 'Application client not available',
          type: 'error',
          duration: 5000,
        })
        return
      }

      dialogState.loading = true

      try {
        if (dialogState.mode === 'create') {
          await apolloClient.mutate({
            mutation: createFeatureRequestMutation,
            variables: {
              input: {
                title: dialogState.title.trim(),
                description: dialogState.description.trim(),
              },
            },
          })

          ElNotification({
            title: 'Success',
            message: 'Feature request created successfully',
            type: 'success',
            duration: 3000,
          })

          closeDialog()
          refetchMyRequests()
        } else if (dialogState.mode === 'approve' && dialogState.selectedRequest) {
          await apolloClient.mutate({
            mutation: approveFeatureRequestMutation,
            variables: {
              id: dialogState.selectedRequest.id,
              input: {
                adminNotes: dialogState.adminNotes.trim() || undefined,
              },
            },
          })

          ElNotification({
            title: 'Success',
            message: 'Feature request approved successfully',
            type: 'success',
            duration: 3000,
          })

          closeDialog()
          refetchMyRequests()
          refetchPublicRequests()
        } else if (dialogState.mode === 'reject' && dialogState.selectedRequest) {
          await apolloClient.mutate({
            mutation: rejectFeatureRequestMutation,
            variables: {
              id: dialogState.selectedRequest.id,
              input: {
                adminNotes: dialogState.adminNotes.trim(),
              },
            },
          })

          ElNotification({
            title: 'Success',
            message: 'Feature request rejected',
            type: 'success',
            duration: 3000,
          })

          closeDialog()
          refetchMyRequests()
          refetchPublicRequests()
        } else if (dialogState.mode === 'updateStatus' && dialogState.selectedRequest && dialogState.newStatus) {
          await apolloClient.mutate({
            mutation: updateFeatureRequestStatusMutation,
            variables: {
              id: dialogState.selectedRequest.id,
              input: {
                status: dialogState.newStatus,
                adminNotes: dialogState.adminNotes.trim() || undefined,
              },
            },
          })

          ElNotification({
            title: 'Success',
            message: 'Feature request status updated successfully',
            type: 'success',
            duration: 3000,
          })

          closeDialog()
          refetchMyRequests()
          refetchPublicRequests()
        }
      } catch (error: any) {
        const errorMessage =
          error.message || `Failed to ${dialogState.mode === 'create' ? 'create' : 'update'} feature request`
        ElNotification({
          title: 'Error',
          message: errorMessage,
          type: 'error',
          duration: 5000,
        })
      } finally {
        dialogState.loading = false
      }
    }

    const getStatusText = (status: FeatureRequestStatus): string => {
      const statusMap: Record<FeatureRequestStatus, string> = {
        [FeatureRequestStatus.PROPOSED]: 'Proposed',
        [FeatureRequestStatus.UNDER_REVIEW]: 'Under Review',
        [FeatureRequestStatus.APPROVED]: 'Approved',
        [FeatureRequestStatus.IN_BACKLOG]: 'In Backlog',
        [FeatureRequestStatus.IN_DEVELOPMENT]: 'In Development',
        [FeatureRequestStatus.IMPLEMENTED]: 'Implemented',
        [FeatureRequestStatus.REJECTED]: 'Rejected',
      }
      return statusMap[status] || status
    }

    const getStatusType = (status: FeatureRequestStatus): string => {
      const statusTypeMap: Record<FeatureRequestStatus, string> = {
        [FeatureRequestStatus.PROPOSED]: 'info',
        [FeatureRequestStatus.UNDER_REVIEW]: 'warning',
        [FeatureRequestStatus.APPROVED]: 'success',
        [FeatureRequestStatus.IN_BACKLOG]: '',
        [FeatureRequestStatus.IN_DEVELOPMENT]: 'primary',
        [FeatureRequestStatus.IMPLEMENTED]: 'success',
        [FeatureRequestStatus.REJECTED]: 'danger',
      }
      return statusTypeMap[status] || ''
    }

    const formatDate = (dateString: string): string => {
      if (!dateString) return '-'
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    }

    const renderTable = (requests: FeatureRequest[], title: string, showStatus: boolean = true) => {
      if (!requests || requests.length === 0) {
        return (
          <div class="section-empty">
            <p>No feature requests in this category</p>
          </div>
        )
      }

      return (
        <ElTable data={requests} stripe border class="feature-requests-table">
          <ElTableColumn prop="title" label="Name" minWidth="50">
            {{
              default: ({ row }: { row: FeatureRequest }) => <span class="request-title">{row.title}</span>,
            }}
          </ElTableColumn>
          <ElTableColumn prop="userId" label="Reporter" width="100">
            {{
              default: () => <span class="request-reporter">User</span>,
            }}
          </ElTableColumn>
          {showStatus && (
            <ElTableColumn prop="status" label="Status" width="140">
              {{
                default: ({ row }: { row: FeatureRequest }) => (
                  <ElTag type={getStatusType(row.status) as any}>{getStatusText(row.status)}</ElTag>
                ),
              }}
            </ElTableColumn>
          )}
          <ElTableColumn prop="createdAt" label="Date" width="120">
            {{
              default: ({ row }: { row: FeatureRequest }) => <span>{formatDate(row.createdAt)}</span>,
            }}
          </ElTableColumn>
          <ElTableColumn prop="description" label="Description" maxWidth="250">
            {{
              default: ({ row }: { row: FeatureRequest }) => <span class="request-description">{row.description}</span>,
            }}
          </ElTableColumn>
          <ElTableColumn label="Operations" width="260" fixed="right">
            {{
              default: ({ row }: { row: FeatureRequest }) => (
                <div class="operations">
                  <ElButton link size="small" onClick={() => openDetailDialog(row)}>
                    Detail
                  </ElButton>
                  {isAdmin.value && (
                    <Fragment>
                      {row.status === FeatureRequestStatus.PROPOSED && (
                        <Fragment>
                          <ElButton link size="small" class="approve-btn" onClick={() => openApproveDialog(row)}>
                            Approve
                          </ElButton>
                          <ElButton link size="small" class="reject-btn" onClick={() => openRejectDialog(row)}>
                            Reject
                          </ElButton>
                        </Fragment>
                      )}
                      {(row.status === FeatureRequestStatus.APPROVED ||
                        row.status === FeatureRequestStatus.IN_BACKLOG ||
                        row.status === FeatureRequestStatus.IN_DEVELOPMENT) && (
                        <ElButton link size="small" onClick={() => openUpdateStatusDialog(row)}>
                          Edit
                        </ElButton>
                      )}
                    </Fragment>
                  )}
                </div>
              ),
            }}
          </ElTableColumn>
        </ElTable>
      )
    }

    const renderFeatureCard = (request: FeatureRequest) => {
      const dropdownItems = []

      // Always show Detail
      dropdownItems.push(<ElDropdownItem onClick={() => openDetailDialog(request)}>View Details</ElDropdownItem>)

      // Admin actions
      if (isAdmin.value) {
        if (request.status === FeatureRequestStatus.PROPOSED) {
          dropdownItems.push(
            <ElDropdownItem onClick={() => openApproveDialog(request)}>Approve</ElDropdownItem>,
            <ElDropdownItem onClick={() => openRejectDialog(request)}>Reject</ElDropdownItem>
          )
        } else if (
          request.status === FeatureRequestStatus.APPROVED ||
          request.status === FeatureRequestStatus.IN_BACKLOG ||
          request.status === FeatureRequestStatus.IN_DEVELOPMENT
        ) {
          dropdownItems.push(
            <ElDropdownItem onClick={() => openUpdateStatusDialog(request)}>Update Status</ElDropdownItem>
          )
        }
      }

      return (
        <div class="feature-card">
          <div class="card-header">
            <h3 class="card-title">{request.title}</h3>
            <ElDropdown trigger="click" placement="bottom-end">
              {{
                default: () => (
                  <button class="card-menu-btn">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="8" cy="2" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="14" r="1.5" />
                    </svg>
                  </button>
                ),
                dropdown: () => <ElDropdownMenu>{dropdownItems}</ElDropdownMenu>,
              }}
            </ElDropdown>
          </div>
          <p class="card-description">{request.description}</p>
          <div class="card-footer">
            <ElTag type={getStatusType(request.status) as any} size="small">
              {getStatusText(request.status)}
            </ElTag>
            <div class="card-meta">
              <div class="card-avatar" title="User">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM8 10c-4 0-6 2-6 4v1h12v-1c0-2-2-4-6-4z" />
                </svg>
              </div>
              <span class="card-date">{formatDate(request.createdAt)}</span>
            </div>
          </div>
        </div>
      )
    }

    const renderBoardColumn = (title: string, requests: FeatureRequest[], showAddButton: boolean = false) => {
      return (
        <div class="board-column">
          <div class="column-header">
            <h3 class="column-title">{title}</h3>
            <span class="column-count">{requests.length}</span>
          </div>
          <div class="column-content">
            {requests.length === 0 ? (
          <div class="column-empty">
            {showAddButton ? (
              <ElButton type="primary" onClick={openCreateDialog} class="add-card-btn">
                <ElIcon class="mr-2">
                  <Plus />
                </ElIcon>
                Request new feature
              </ElButton>
            ) : (
              <p>No items</p>
            )}
          </div>
            ) : (
              <Fragment>
                {requests.map((request) => renderFeatureCard(request))}
                {showAddButton && (
                  <ElButton type="primary" onClick={openCreateDialog} class="add-card-btn-small">
                    <ElIcon class="mr-2">
                      <Plus />
                    </ElIcon>
                    Request new feature
                  </ElButton>
                )}
              </Fragment>
            )}
          </div>
        </div>
      )
    }

    const renderBoardView = () => {
      // Group requests by column
      const myRequestsData = myRequests.value || []
      const backlogData = publicRequests.value?.in_backlog || []
      const developmentData = publicRequests.value?.in_development || []
      const implementedData = publicRequests.value?.implemented || []

      return (
        <div class="board-view">
          {renderBoardColumn(isAdmin.value ? 'All Requests' : 'My Requests', myRequestsData, true)}
          {renderBoardColumn('Backlog', backlogData)}
          {renderBoardColumn('Development', developmentData)}
          {renderBoardColumn('Implemented', implementedData)}
        </div>
      )
    }

    return () => {
      if (!currentUserLoading.value && !currentUser.value) {
        return (
          <div class="feature-request-page">
            <div class="page-header">
              <div class="header-content">
                <h1 class="page-title">Feature Requests</h1>
              </div>
            </div>
            <div class="page-content">
              <div class="login-prompt">You must be logged in to view this page</div>
            </div>
          </div>
        )
      }

      const loading = myRequestsLoading.value || publicRequestsLoading.value || currentUserLoading.value

      return (
        <div class="feature-request-page">
          <div class="page-header">
            <div class="header-content">
              <div class="view-tabs">
                <button
                  class={`tab-button ${activeTab.value === 'table' ? 'active' : ''}`}
                  onClick={() => (activeTab.value = 'table')}
                >
                  Table
                </button>
                <button
                  class={`tab-button ${activeTab.value === 'board' ? 'active' : ''}`}
                  onClick={() => (activeTab.value = 'board')}
                >
                  Board
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div class="loading-container">
              <ElIcon class="is-loading">
                <Loading />
              </ElIcon>
            </div>
          ) : (
            <div class="page-content">
              {activeTab.value === 'table' && (
                <Fragment>
                  {/* My Feature Requests Section */}
                  <div class="section">
                    <div class="section-header">
                      <h2 class="section-title">
                        {currentUser.value?.role === 'admin' ? 'All feature requests' : 'My feature requests'}
                      </h2>
                      <ElButton type="primary" onClick={openCreateDialog} class="section-add-btn">
                        <ElIcon class="mr-2">
                          <Plus />
                        </ElIcon>
                        Request new feature
                      </ElButton>
                    </div>
                    {renderTable(myRequests.value, 'My feature requests', true)}
                  </div>

                  {/* Backlog Section */}
                  <div class="section">
                    <h2 class="section-title">Backlog</h2>
                    {renderTable(publicRequests.value?.in_backlog || [], 'Backlog', false)}
                  </div>

                  {/* Development Section */}
                  <div class="section">
                    <h2 class="section-title">Development</h2>
                    {renderTable(publicRequests.value?.in_development || [], 'Development', false)}
                  </div>

                  {/* Implemented Section */}
                  <div class="section">
                    <h2 class="section-title">Implemented</h2>
                    {renderTable(publicRequests.value?.implemented || [], 'Implemented', false)}
                  </div>
                </Fragment>
              )}

              {activeTab.value === 'board' && renderBoardView()}
            </div>
          )}

          {/* Create/Edit/Detail Dialog */}
          <ElDialog
            modelValue={dialogState.visible}
            onUpdate:modelValue={(val: boolean) => (dialogState.visible = val)}
            title={
              dialogState.mode === 'create'
                ? 'Request New Feature'
                : dialogState.mode === 'approve'
                ? 'Approve Feature Request'
                : dialogState.mode === 'reject'
                ? 'Reject Feature Request'
                : dialogState.mode === 'updateStatus'
                ? 'Update Feature Request Status'
                : 'Feature Request Details'
            }
            width="600px"
            onClose={closeDialog}
            class="feature-request-dialog"
            closeOnClickModal={dialogState.mode !== 'create'}
            closeOnPressEscape={dialogState.mode !== 'create'}
            showClose={true}
            v-slots={{
              footer: () => (
                <div class="dialog-footer">
                  {dialogState.mode === 'detail' ? (
                    <ElButton onClick={closeDialog}>Close</ElButton>
                  ) : (
                    <Fragment>
                      <ElButton onClick={closeDialog} disabled={dialogState.loading}>
                        Cancel
                      </ElButton>
                      <ElButton
                        type={dialogState.mode === 'reject' ? 'danger' : 'primary'}
                        onClick={handleSubmit}
                        loading={dialogState.loading}
                      >
                        {dialogState.mode === 'create'
                          ? 'Submit'
                          : dialogState.mode === 'approve'
                          ? 'Approve'
                          : dialogState.mode === 'reject'
                          ? 'Reject'
                          : 'Update'}
                      </ElButton>
                    </Fragment>
                  )}
                </div>
              ),
            }}
          >
            <div class="dialog-content">
              {/* Title field - only for create mode */}
              {dialogState.mode === 'create' && (
                <div class="form-group">
                  <label class="form-label">
                    Title<span class="required">*</span>
                  </label>
                  <ElInput
                    modelValue={dialogState.title}
                    onUpdate:modelValue={(val: string) => {
                      dialogState.title = val
                      if (dialogState.errors.title) dialogState.errors.title = ''
                    }}
                    placeholder="Enter a descriptive title for your feature request"
                    maxlength={200}
                    showWordLimit
                    disabled={dialogState.loading}
                    class={dialogState.errors.title ? 'error-border' : ''}
                  />
                  {dialogState.errors.title && <div class="error-message">{dialogState.errors.title}</div>}
                </div>
              )}

              {/* Title display - for all other modes */}
              {dialogState.mode !== 'create' && (
                <div class="form-group">
                  <label class="form-label">Title</label>
                  <div class="detail-text">{dialogState.title}</div>
                </div>
              )}

              {/* Description field - only for create mode */}
              {dialogState.mode === 'create' && (
                <div class="form-group">
                  <label class="form-label">
                    Description<span class="required">*</span>
                  </label>
                  <ElInput
                    modelValue={dialogState.description}
                    onUpdate:modelValue={(val: string) => {
                      dialogState.description = val
                      if (dialogState.errors.description) dialogState.errors.description = ''
                    }}
                    type="textarea"
                    rows={6}
                    placeholder="Describe your feature request in detail..."
                    maxlength={2000}
                    showWordLimit
                    disabled={dialogState.loading}
                    class={dialogState.errors.description ? 'error-border' : ''}
                  />
                  {dialogState.errors.description && <div class="error-message">{dialogState.errors.description}</div>}
                </div>
              )}

              {/* Description display - for all other modes */}
              {dialogState.mode !== 'create' && (
                <div class="form-group">
                  <label class="form-label">Description</label>
                  <div class="detail-text description">{dialogState.description}</div>
                </div>
              )}

              {/* Status display - for detail mode */}
              {dialogState.mode === 'detail' && dialogState.selectedRequest && (
                <div class="form-group">
                  <label class="form-label">Status</label>
                  <div class="detail-text">
                    <ElTag type={getStatusType(dialogState.selectedRequest.status) as any}>
                      {getStatusText(dialogState.selectedRequest.status)}
                    </ElTag>
                  </div>
                </div>
              )}

              {/* Status selector - for updateStatus mode */}
              {dialogState.mode === 'updateStatus' && (
                <div class="form-group">
                  <label class="form-label">
                    Status<span class="required">*</span>
                  </label>
                  <ElSelect
                    modelValue={dialogState.newStatus}
                    onUpdate:modelValue={(val: FeatureRequestStatus) => {
                      dialogState.newStatus = val
                      if (dialogState.errors.adminNotes) dialogState.errors.adminNotes = ''
                    }}
                    placeholder="Select status"
                    class="w-full"
                    disabled={dialogState.loading}
                  >
                    <ElOption label="Approved" value={FeatureRequestStatus.APPROVED} />
                    <ElOption label="In Backlog" value={FeatureRequestStatus.IN_BACKLOG} />
                    <ElOption label="In Development" value={FeatureRequestStatus.IN_DEVELOPMENT} />
                    <ElOption label="Implemented" value={FeatureRequestStatus.IMPLEMENTED} />
                  </ElSelect>
                </div>
              )}

              {/* Admin notes field - for approve, reject, and updateStatus modes */}
              {(dialogState.mode === 'approve' ||
                dialogState.mode === 'reject' ||
                dialogState.mode === 'updateStatus') && (
                <div class="form-group">
                  <label class="form-label">
                    Admin Notes{dialogState.mode === 'reject' && <span class="required">*</span>}
                  </label>
                  <ElInput
                    modelValue={dialogState.adminNotes}
                    onUpdate:modelValue={(val: string) => {
                      dialogState.adminNotes = val
                      if (dialogState.errors.adminNotes) dialogState.errors.adminNotes = ''
                    }}
                    type="textarea"
                    rows={4}
                    placeholder={
                      dialogState.mode === 'reject' ? 'Provide a reason for rejection...' : 'Add optional notes...'
                    }
                    disabled={dialogState.loading}
                    class={dialogState.errors.adminNotes ? 'error-border' : ''}
                  />
                  {dialogState.errors.adminNotes && <div class="error-message">{dialogState.errors.adminNotes}</div>}
                </div>
              )}

              {/* Admin notes display - for detail mode */}
              {dialogState.mode === 'detail' && dialogState.selectedRequest?.adminNotes && (
                <div class="form-group">
                  <label class="form-label">Admin Notes</label>
                  <div class="detail-text admin-notes">{dialogState.selectedRequest.adminNotes}</div>
                </div>
              )}

              {/* Created date - for detail mode */}
              {dialogState.mode === 'detail' && dialogState.selectedRequest && (
                <div class="form-group">
                  <label class="form-label">Created At</label>
                  <div class="detail-text">{formatDate(dialogState.selectedRequest.createdAt)}</div>
                </div>
              )}
            </div>
          </ElDialog>
        </div>
      )
    }
  },
})
