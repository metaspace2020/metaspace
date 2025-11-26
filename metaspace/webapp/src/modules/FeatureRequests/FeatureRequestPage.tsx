import { defineComponent, computed, reactive, ref, inject } from 'vue'
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
  ElIcon,
  ElInputNumber,
  ElSwitch,
  ElSkeleton,
  ElRadioGroup,
  ElRadio,
  ElAlert,
  ElPagination,
} from '../../lib/element-plus'
import {
  myFeatureRequestsQuery,
  publicFeatureRequestsQuery,
  createFeatureRequestMutation,
  approveFeatureRequestMutation,
  rejectFeatureRequestMutation,
  toggleVoteFeatureRequestMutation,
  updateFeatureRequestVisibilityMutation,
  updateFeatureRequestDisplayOrderMutation,
  FeatureRequest,
  FeatureRequestStatus,
} from '../../api/featureRequest'
import { Fragment } from 'vue'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import ArrowUpIcon from '../../assets/inline/refactoring-ui/icon-arrow-thick-up.svg'

interface DialogState {
  visible: boolean
  mode: 'create' | 'detail' | 'approve' | 'reject'
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
  isProUser: string // 'yes' | 'no' | ''
}

interface LoadingState {
  [key: string]: boolean // key is request.id + action type
}

export default defineComponent({
  name: 'FeatureRequestPage',
  setup() {
    const apolloClient = inject(DefaultApolloClient)

    const { result: currentUserResult, loading: currentUserLoading } = useQuery<any>(currentUserRoleQuery, null, {
      fetchPolicy: 'network-only',
    })
    const currentUser = computed(() => currentUserResult.value?.currentUser)
    const isAdmin = computed(() => currentUser.value?.role === 'admin')

    // Query my feature requests
    const { result: myRequestsResult, refetch: refetchMyRequests } = useQuery<{ myFeatureRequests: FeatureRequest[] }>(
      myFeatureRequestsQuery,
      null,
      {
        fetchPolicy: 'network-only',
      }
    )
    const allMyRequests = computed(() => myRequestsResult.value?.myFeatureRequests || [])
    const myRequestsCount = computed(() => allMyRequests.value.length)
    const myRequests = computed(() => {
      const start = (myRequestsPage.value - 1) * myRequestsPageSize.value
      const end = start + myRequestsPageSize.value
      return allMyRequests.value.slice(start, end)
    })

    // Query public feature requests
    const { result: publicRequestsResult, refetch: refetchPublicRequests } = useQuery<{
      publicFeatureRequests: FeatureRequest[]
    }>(publicFeatureRequestsQuery, null, {
      fetchPolicy: 'network-only',
    })
    const allPublicRequests = computed(() => publicRequestsResult.value?.publicFeatureRequests || [])
    const publicRequestsCount = computed(() => allPublicRequests.value.length)
    const publicRequests = computed(() => {
      const start = (publicRequestsPage.value - 1) * publicRequestsPageSize.value
      const end = start + publicRequestsPageSize.value
      return allPublicRequests.value.slice(start, end)
    })

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
      isProUser: '',
    })

    // Loading state for individual actions
    const loadingStates = reactive<LoadingState>({})

    // Skeleton loading state
    const skeletonLoading = ref(false)

    // Pagination state for My Requests
    const myRequestsPage = ref(1)
    const myRequestsPageSize = ref(10)

    // Pagination state for Public Requests
    const publicRequestsPage = ref(1)
    const publicRequestsPageSize = ref(10)

    const openCreateDialog = () => {
      dialogState.mode = 'create'
      dialogState.title = ''
      dialogState.description = ''
      dialogState.selectedRequest = null
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.isProUser = ''
      dialogState.visible = true
    }

    const openDetailDialog = (request: FeatureRequest) => {
      dialogState.mode = 'detail'
      dialogState.title = request.title
      dialogState.description = request.description
      dialogState.selectedRequest = request
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = request.adminNotes || ''
      dialogState.visible = true
    }

    const openApproveDialog = (request: FeatureRequest) => {
      dialogState.mode = 'approve'
      dialogState.title = request.title
      dialogState.description = request.description
      dialogState.selectedRequest = request
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.visible = true
    }

    const openRejectDialog = (request: FeatureRequest) => {
      dialogState.mode = 'reject'
      dialogState.title = request.title
      dialogState.description = request.description
      dialogState.selectedRequest = request
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.visible = true
    }

    const closeDialog = () => {
      dialogState.visible = false
      dialogState.title = ''
      dialogState.description = ''
      dialogState.selectedRequest = null
      dialogState.errors = { title: '', description: '', adminNotes: '' }
      dialogState.adminNotes = ''
      dialogState.isProUser = ''
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
                isPro: dialogState.isProUser === 'yes',
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
          await refetchMyRequests()
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
          await Promise.all([refetchMyRequests(), refetchPublicRequests()])
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
          await Promise.all([refetchMyRequests(), refetchPublicRequests()])
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
        [FeatureRequestStatus.UNDER_REVIEW]: 'Under Review',
        [FeatureRequestStatus.APPROVED]: 'Approved',
        [FeatureRequestStatus.REJECTED]: 'Rejected',
      }
      return statusMap[status] || status
    }

    const getStatusType = (status: FeatureRequestStatus): string => {
      const statusTypeMap: Record<FeatureRequestStatus, string> = {
        [FeatureRequestStatus.UNDER_REVIEW]: 'warning',
        [FeatureRequestStatus.APPROVED]: 'success',
        [FeatureRequestStatus.REJECTED]: 'danger',
      }
      return statusTypeMap[status] || ''
    }

    const handleVote = async (request: FeatureRequest) => {
      if (!apolloClient) {
        ElNotification({
          title: 'Error',
          message: 'Application client not available',
          type: 'error',
          duration: 5000,
        })
        return
      }

      const loadingKey = `vote-${request.id}`
      if (loadingStates[loadingKey]) return

      loadingStates[loadingKey] = true
      skeletonLoading.value = true

      try {
        await apolloClient.mutate({
          mutation: toggleVoteFeatureRequestMutation,
          variables: {
            id: request.id,
          },
        })

        // Silently refetch without notification
        await Promise.all([refetchMyRequests(), refetchPublicRequests()])
      } catch (error: any) {
        const errorMessage = error.message || 'Failed to toggle vote'
        ElNotification({
          title: 'Error',
          message: errorMessage,
          type: 'error',
          duration: 5000,
        })
      } finally {
        loadingStates[loadingKey] = false
        skeletonLoading.value = false
      }
    }

    const handleVisibilityToggle = async (request: FeatureRequest) => {
      if (!apolloClient) return

      const loadingKey = `visibility-${request.id}`
      if (loadingStates[loadingKey]) return

      loadingStates[loadingKey] = true
      skeletonLoading.value = true

      try {
        await apolloClient.mutate({
          mutation: updateFeatureRequestVisibilityMutation,
          variables: {
            id: request.id,
            input: {
              isVisible: !request.isVisible,
            },
          },
        })

        // Silently refetch
        await Promise.all([refetchMyRequests(), refetchPublicRequests()])
      } catch (error: any) {
        ElNotification({
          title: 'Error',
          message: error.message || 'Failed to update visibility',
          type: 'error',
          duration: 5000,
        })
      } finally {
        loadingStates[loadingKey] = false
        skeletonLoading.value = false
      }
    }

    const handleDisplayOrderChange = async (request: FeatureRequest, newOrder: number) => {
      if (!apolloClient || newOrder < 0) return

      const loadingKey = `order-${request.id}`
      if (loadingStates[loadingKey]) return

      loadingStates[loadingKey] = true
      skeletonLoading.value = true

      try {
        await apolloClient.mutate({
          mutation: updateFeatureRequestDisplayOrderMutation,
          variables: {
            id: request.id,
            input: {
              displayOrder: newOrder,
            },
          },
        })

        // Silently refetch
        await Promise.all([refetchMyRequests(), refetchPublicRequests()])
      } catch (error: any) {
        ElNotification({
          title: 'Error',
          message: error.message || 'Failed to update display order',
          type: 'error',
          duration: 5000,
        })
      } finally {
        loadingStates[loadingKey] = false
        skeletonLoading.value = false
      }
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

    const renderTable = (
      requests: FeatureRequest[],
      title: string,
      showStatus: boolean = true,
      showVoting: boolean = false
    ) => {
      if (!requests || requests.length === 0) {
        return (
          <div class="section-empty">
            <p>Request a new feature to get started.</p>
          </div>
        )
      }

      const tableContent = (
        <ElTable data={requests} stripe border class="feature-requests-table">
          <ElTableColumn prop="title" label="Feature" minWidth="180">
            {{
              default: ({ row }: { row: FeatureRequest }) => <span class="request-title">{row.title}</span>,
            }}
          </ElTableColumn>
          <ElTableColumn prop="description" label="Description" minWidth="200">
            {{
              default: ({ row }: { row: FeatureRequest }) => <span class="request-description">{row.description}</span>,
            }}
          </ElTableColumn>
          {showStatus && (
            <ElTableColumn prop="status" label="Status" width="120">
              {{
                default: ({ row }: { row: FeatureRequest }) => (
                  <ElTag type={getStatusType(row.status) as any}>{getStatusText(row.status)}</ElTag>
                ),
              }}
            </ElTableColumn>
          )}
          {showVoting && (
            <ElTableColumn prop="likes" label="Votes" width="100" align="center">
              {{
                default: ({ row }: { row: FeatureRequest }) => {
                  const loadingKey = `vote-${row.id}`
                  return (
                    <div class="votes-cell">
                      <ElButton
                        link
                        type={row.hasVoted ? 'primary' : 'default'}
                        onClick={() => handleVote(row)}
                        loading={loadingStates[loadingKey]}
                        class="vote-button"
                      >
                        <ArrowUpIcon width="20" height="20" fill={row.hasVoted ? '#FFB65D' : 'lightgray'} />
                        <span class="vote-count">{row.likes}</span>
                      </ElButton>
                    </div>
                  )
                },
              }}
            </ElTableColumn>
          )}
          {isAdmin.value && (
            <ElTableColumn prop="createdAt" label="Date" width="120">
              {{
                default: ({ row }: { row: FeatureRequest }) => <span>{formatDate(row.createdAt)}</span>,
              }}
            </ElTableColumn>
          )}
          <ElTableColumn label="Actions" width={isAdmin.value ? '360' : '100'} fixed="right">
            {{
              default: ({ row }: { row: FeatureRequest }) => {
                const visibilityLoadingKey = `visibility-${row.id}`
                const orderLoadingKey = `order-${row.id}`

                return (
                  <div class="operations">
                    <ElButton link size="small" onClick={() => openDetailDialog(row)}>
                      Details
                    </ElButton>
                    {isAdmin.value && (
                      <Fragment>
                        {row.status === FeatureRequestStatus.UNDER_REVIEW && (
                          <Fragment>
                            <ElButton link size="small" class="approve-btn" onClick={() => openApproveDialog(row)}>
                              Approve
                            </ElButton>
                            <ElButton link size="small" class="reject-btn" onClick={() => openRejectDialog(row)}>
                              Reject
                            </ElButton>
                          </Fragment>
                        )}
                        {row.status === FeatureRequestStatus.APPROVED && (
                          <Fragment>
                            <ElSwitch
                              modelValue={row.isVisible}
                              onChange={() => handleVisibilityToggle(row)}
                              activeText="Visible"
                              inactiveText="Hidden"
                              size="small"
                              loading={loadingStates[visibilityLoadingKey]}
                              class="visibility-switch"
                            />
                            <ElInputNumber
                              modelValue={row.displayOrder}
                              onChange={(val: number | null) => val !== null && handleDisplayOrderChange(row, val)}
                              min={0}
                              step={1}
                              size="small"
                              controls-position="right"
                              class="order-input"
                              disabled={loadingStates[orderLoadingKey]}
                            />
                          </Fragment>
                        )}
                      </Fragment>
                    )}
                  </div>
                )
              },
            }}
          </ElTableColumn>
        </ElTable>
      )

      return (
        <ElSkeleton loading={skeletonLoading.value} rows={5} animated>
          {tableContent}
        </ElSkeleton>
      )
    }

    return () => {
      if (!currentUserLoading.value && !currentUser.value) {
        return (
          <div class="feature-request-page">
            <div class="page-content">
              <div class="login-prompt">You must be logged in to view this page</div>
            </div>
          </div>
        )
      }

      return (
        <div class="feature-request-page">
          <div class="page-content">
            {/* Public Approved Feature Requests Section */}
            <div class="section">
              <h2 class="section-title">Community feature requests</h2>
              <p class="section-description">Vote for the features you'd like to see implemented</p>
              {renderTable(publicRequests.value, 'Community Requests', false, true)}

              {/* Public Requests Pagination */}
              {publicRequestsCount.value > publicRequestsPageSize.value || publicRequestsPage.value !== 1 ? (
                <div class="pagination-container">
                  <ElPagination
                    total={publicRequestsCount.value}
                    pageSize={publicRequestsPageSize.value}
                    currentPage={publicRequestsPage.value}
                    onCurrentChange={(val: number) => {
                      publicRequestsPage.value = val
                    }}
                    layout="prev,pager,next"
                  />
                </div>
              ) : null}
            </div>

            {/* My Feature Requests Section */}
            <div class="section">
              <div class="section-header">
                <h2 class="section-title">{currentUser.value?.role === 'admin' ? 'All Requests' : 'My Requests'}</h2>
                <ElButton type="primary" onClick={openCreateDialog} class="section-add-btn">
                  <ElIcon class="mr-2">
                    <Plus />
                  </ElIcon>
                  Request new feature
                </ElButton>
              </div>
              {renderTable(myRequests.value, 'My Requests', true, false)}

              {/* My Requests Pagination */}
              {myRequestsCount.value > myRequestsPageSize.value || myRequestsPage.value !== 1 ? (
                <div class="pagination-container">
                  <ElPagination
                    total={myRequestsCount.value}
                    pageSize={myRequestsPageSize.value}
                    currentPage={myRequestsPage.value}
                    onCurrentChange={(val: number) => {
                      myRequestsPage.value = val
                    }}
                    layout="prev,pager,next"
                  />
                </div>
              ) : null}
            </div>
          </div>

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

              {/* Pro User Question - only for create mode */}
              {dialogState.mode === 'create' && (
                <div class="form-group">
                  <label class="form-label">Are you a METASPACE Pro user?</label>
                  <div class="flex items-center gap-2">
                    <div class="flex flex-row w-[200px]">
                      <ElRadioGroup
                        modelValue={dialogState.isProUser}
                        onUpdate:modelValue={(val: string) => {
                          dialogState.isProUser = val
                        }}
                        disabled={dialogState.loading}
                      >
                        <ElRadio label="yes">Yes</ElRadio>
                        <ElRadio label="no">No</ElRadio>
                      </ElRadioGroup>
                    </div>
                    <ElAlert type="info" closable={false}>
                      {{
                        default: () => (
                          <span class="flex items-center text-md">
                            <ElIcon size="16" class="mr-2">
                              <InfoFilled />
                            </ElIcon>
                            Feature requests from Pro users are prioritized.{' '}
                            <a href="/plans" target="_blank" rel="noopener" class="ml-1">
                              View pro plans
                            </a>
                          </span>
                        ),
                      }}
                    </ElAlert>
                  </div>
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

              {/* Admin notes field - for approve and reject modes */}
              {(dialogState.mode === 'approve' || dialogState.mode === 'reject') && (
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

              {/* Votes display - for detail mode */}
              {dialogState.mode === 'detail' && dialogState.selectedRequest && (
                <div class="form-group">
                  <label class="form-label">Votes</label>
                  <div class="detail-text">{dialogState.selectedRequest.likes} votes</div>
                </div>
              )}

              {/* Pro user display - for detail mode */}
              {dialogState.mode === 'detail' && dialogState.selectedRequest && isAdmin.value && (
                <div class="form-group">
                  <label class="form-label">Pro User</label>
                  <div class="detail-text">{dialogState.selectedRequest.isPro ? 'Yes' : 'No'}</div>
                </div>
              )}

              {/* Admin notes display - for detail mode (admin or own request) */}
              {dialogState.mode === 'detail' &&
                dialogState.selectedRequest?.adminNotes &&
                (isAdmin.value || dialogState.selectedRequest.userId === currentUser.value?.id) && (
                  <div class="form-group">
                    <label class="form-label">Admin Notes</label>
                    <div class="detail-text admin-notes">{dialogState.selectedRequest.adminNotes}</div>
                  </div>
                )}

              {/* Created date - for detail mode (admin only) */}
              {dialogState.mode === 'detail' && dialogState.selectedRequest && isAdmin.value && (
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
