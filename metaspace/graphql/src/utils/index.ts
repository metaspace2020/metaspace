export { createConnection, findUserByEmail } from './db'
export { smApiDatasetRequest } from './smApi/datasets'

export type LooselyCompatible<T> =
  {[K in keyof T]?: T[K] extends (string | number | null | undefined) ? T[K] | null : any};
