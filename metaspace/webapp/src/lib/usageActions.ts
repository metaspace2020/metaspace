/**
 * User-facing wording for api-usage action types, shared by the quota,
 * usage-history and top-up views so the same action never reads differently
 * across sections.
 */
export const getActionTypeText = (actionType: string): string => {
  switch (actionType.toLowerCase()) {
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
