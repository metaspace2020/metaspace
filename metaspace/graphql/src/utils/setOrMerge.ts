import * as _ from 'lodash'

/**
 * A specialized version of `_.set` that checks to see if a value already exists at `path`, and if so,
 * calls `onConflict` to merge the old and new values.
 * @param obj
 * @param path
 * @param value
 * @param onConflict
 */
export const setOrMerge = <T>(
  obj: any,
  path: string,
  value: T,
  onConflict: (val: T, oldVal: T) => T = (val) => val
) => {
  let newVal = value
  if (_.hasIn(obj, path)) {
    const oldVal = _.get(obj, path)
    newVal = onConflict(value, oldVal)
  }
  return _.merge({}, obj, _.set({}, path, newVal))
}
