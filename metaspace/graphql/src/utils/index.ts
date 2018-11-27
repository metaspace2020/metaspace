import {logger as _logger} from '../../utils';
import {LoggerInstance} from 'winston';

export {createConnection, findUserByEmail} from './db';
export {smAPIRequest} from './smAPI';

export const logger = _logger as LoggerInstance;

export type LooselyCompatible<T> =
  {[K in keyof T]?: T[K] extends (string | number | null | undefined) ? T[K] | null : any};
