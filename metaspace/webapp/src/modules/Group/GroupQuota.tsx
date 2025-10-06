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
          return actionType
      }
    }

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
                    <ElTag type={row.remaining > 0 ? 'success' : 'danger'} size="small">
                      {row.remaining}
                    </ElTag>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn prop="actionType" label="Action" width="160">
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
              <ElTableColumn label="Usage status" width="120">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => (
                    <el-tag type={row.remaining > 0 ? 'success' : 'danger'} size="small">
                      {row.remaining > 0 ? 'Available' : 'Exhausted'}
                    </el-tag>
                  ),
                }}
              </ElTableColumn>
              <ElTableColumn label="Description">
                {{
                  default: ({ row }: { row: RemainingApiUsage }) => (
                    <span>
                      {row.remaining} of {row.limit} {getActionType(row.actionType)} remaining for {row.period}{' '}
                      {row.periodType}
                      {row.period > 1 ? 's' : ''}
                    </span>
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
