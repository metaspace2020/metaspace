import { DatasetSource } from '../../../bindingTypes'
import { ContextUser } from '../../../context'

export default (dataset: DatasetSource, user: ContextUser) => {
  const ds = dataset._source
  if (user.role === 'admin') {
    return true
  }
  const isSubmitter = user.id === ds.ds_submitter_id
  const isBusy = ['QUEUED', 'ANNOTATING'].includes(ds.ds_status)
  const isInSameGroup = user.groupIds != null && ds.ds_group_id != null && user.groupIds.includes(ds.ds_group_id)
  if (!isBusy && (isSubmitter || isInSameGroup)) {
    return true
  }
  return false
}
