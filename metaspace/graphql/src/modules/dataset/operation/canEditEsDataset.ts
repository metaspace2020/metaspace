import { DatasetSource } from '../../../bindingTypes'
import { ContextUser } from '../../../context'

export default (dataset: DatasetSource, user: ContextUser) => {
  const ds = dataset._source
  if (user.role === 'admin'
    || user.id === ds.ds_submitter_id
    || user.groupIds != null && ds.ds_group_id != null && user.groupIds.includes(ds.ds_group_id)) {
    return true
  }
  return false
}
