import { defineComponent, computed, PropType } from 'vue'
import { useQuery } from '@vue/apollo-composable'
import { ElTable, ElTableColumn, ElTag } from '../../lib/element-plus'
import { getRemainingApiUsagesQuery, RemainingApiUsage } from '../../api/plan'

export default defineComponent({
  name: 'GroupQuota',
  props: {
    groupId: {
      type: String,
      required: true,
    },
    types: {
      type: Array as PropType<string[]>,
      required: false,
      default: () => ['create'],
    },
  },
  setup(props) {
    const groupId = computed(() => props.groupId)

    const queryVars = computed(() => ({
      groupId: groupId.value === 'NO_GROUP' ? null : groupId.value,
      types: props.types?.join(','),
    }))

    const { result: remainingApiUsagesResult, loading: quotaLoading } = useQuery<any>(
      getRemainingApiUsagesQuery,
      queryVars,
      {
        fetchPolicy: 'network-only',
      }
    )
    const remainingApiUsages = computed(() =>
      remainingApiUsagesResult.value != null ? remainingApiUsagesResult.value.remainingApiUsages : []
    )

    const getActionType = (actionType: string) => {
      switch (actionType) {
        case 'create':
          return 'private submissions'
        case 'update':
          return 'updated metadata'
        case 'reprocess':
          return 'private resubmissions'
        default:
          return 'private submissions'
      }
    }

    // Extra credits are granted on top of the plan quota, so a row is still usable
    // once its plan quota runs out as long as unused credits remain.
    const getAvailable = (row: RemainingApiUsage) => row.remaining + (row.creditsRemaining || 0)
    const hasCredits = (row: RemainingApiUsage) => (row.creditsTotal || 0) > 0
    const showCreditsColumn = computed(() => (remainingApiUsages.value as RemainingApiUsage[]).some(hasCredits))

    return () => {
      const remainingUsages = remainingApiUsages.value as RemainingApiUsage[]

      return (
        <div class="section">
          {quotaLoading.value ? (
            <div class="loading-container">
              <el-skeleton animated>
                <el-skeleton-item variant="h3" style={{ width: '25%' }} />
                <el-skeleton-item variant="text" style={{ width: '100%' }} />
                <el-skeleton-item variant="text" style={{ width: '80%' }} />
                <el-skeleton-item variant="text" style={{ width: '90%' }} />
              </el-skeleton>
            </div>
          ) : remainingUsages && remainingUsages.length > 0 ? (
            <ElTable data={remainingUsages}>
              <ElTableColumn prop="limit" label="Limit" width="60">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => <span class="limit-value">{row.limit}</span>,
                }}
              </ElTableColumn>
              <ElTableColumn prop="remaining" label="Remaining" width="100">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => (
                    <ElTag type={getAvailable(row) > 0 ? 'success' : 'danger'} size="small">
                      {row.remaining}
                    </ElTag>
                  ),
                }}
              </ElTableColumn>
              {showCreditsColumn.value && (
                <ElTableColumn prop="creditsRemaining" label="Credits" width="80">
                  {{
                    default: ({ row }: { row: RemainingApiUsage }) =>
                      hasCredits(row) ? (
                        <ElTag type={(row.creditsRemaining || 0) > 0 ? 'success' : 'info'} size="small">
                          +{row.creditsRemaining || 0}
                        </ElTag>
                      ) : (
                        <span>-</span>
                      ),
                  }}
                </ElTableColumn>
              )}
              <ElTableColumn prop="actionType" label="Action" width="150">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => (
                    <ElTag type="info" size="small">
                      {getActionType(row.actionType)}
                    </ElTag>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn prop="period" label="Period" width="70">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => (
                    <span>
                      {row.period} {row.periodType}
                      {row.period > 1 ? 's' : ''}
                    </span>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn label="Usage status" width="110">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => (
                    <ElTag type={getAvailable(row) > 0 ? 'success' : 'danger'} size="small">
                      {getAvailable(row) > 0 ? 'Available' : 'Exhausted'}
                    </ElTag>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn label="Description" minWidth="140">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => (
                    <div>
                      <div class="quota-note">
                        {row.remaining} of {row.limit} remaining
                      </div>
                      {hasCredits(row) && (
                        <div class="credits-note text-xs text-gray-500">
                          {row.creditsUsed || 0}/{row.creditsTotal} extra credits used
                        </div>
                      )}
                    </div>
                  ),
                }}
              </ElTableColumn>
            </ElTable>
          ) : (
            <div class="empty-state">No quota information available</div>
          )}
        </div>
      )
    }
  },
})
