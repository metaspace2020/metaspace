import * as _ from 'lodash';
import fetch from 'node-fetch';
import config from '../config';
import { UserError } from 'graphql-errors';
import logger from '../logger';
import { snakeCase } from 'typeorm/util/StringUtils';


const valid_error_statuses = ['wrong_parameters', 'already_exists', 'malformed_csv'];

export const smApiDatabaseRequest = async (uri: string, args?: any) => {
  let reqDoc = args || {};
  // @ts-ignore
  reqDoc = _.mapKeys(reqDoc, (v, k) => snakeCase(k));

  let resp = await fetch(`http://${config.services.sm_engine_api_host}${uri}`, {
    method: 'POST',
    body: JSON.stringify(reqDoc),
    headers: { 'Content-Type': 'application/json' }
  });

  const respDoc = await resp.json();
  if (!resp.ok) {
    if (valid_error_statuses.includes(respDoc.status)) {
      throw new UserError(JSON.stringify({
        type: respDoc.status,
        hint: respDoc.errors,
      }));
    }
    else {
      throw new UserError(`Server error`);
    }
  }
  else {
    logger.info(`Successful ${uri}`);
    logger.debug(`Body: ${JSON.stringify(reqDoc)}`);
    return respDoc.data;
  }
};

interface CreateDatabaseArgs {
    name: string;
    version: string;
    isPublic?: boolean;
    groupId: string;
    filePath: string;
    fullName?: string;
    description?: string;
    link?: string;
    citation?: string;
}

export const smApiCreateDatabase = async (args: CreateDatabaseArgs) => {
  return await smApiDatabaseRequest(`/v1/databases/create`, args);
};

interface UpdateDatabaseArgs {
    archived?: boolean;
    isPublic?: boolean;
    fullName?: string;
    description?: string;
    link?: string;
    citation?: string;
}

export const smApiUpdateDatabase = async (id: number, args: UpdateDatabaseArgs) => {
  return await smApiDatabaseRequest(`/v1/databases/${id}/update`, args);
};

export const smApiDeleteDatabase = async (id: number) => {
  return await smApiDatabaseRequest(`/v1/databases/${id}/delete`);
};
