export {logger} from '../../utils';
export {createConnection} from './db';

export type LooselyCompatible<T> =
  {[K in keyof T]?: T[K] extends (string | number | null | undefined) ? T[K] | null : any};
