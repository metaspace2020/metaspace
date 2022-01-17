import * as _ from 'lodash'
import { UserError } from 'graphql-errors'
import logger from '../logger'
import { snakeCase } from 'typeorm/util/StringUtils'
import { smApiJsonPost } from './smApiCall'

const valid_error_statuses = ['wrong_parameters', 'already_exists', 'malformed_csv', 'bad_data']

export const smApiDatabaseRequest = async(uri: string, args?: any) => {
  let reqDoc = args || {}
  // @ts-ignore
  reqDoc = _.mapKeys(reqDoc, (v, k) => snakeCase(k))

  const { response, content } = await smApiJsonPost(uri, reqDoc)

  if (!response.ok) {
    if (valid_error_statuses.includes(content.status)) {
      throw new UserError(JSON.stringify({
        type: content.status,
        error: content.error,
        details: content.details,
      }))
    } else {
      throw new UserError('Server error')
    }
  } else {
    logger.info(`Successful ${uri}`)
    logger.debug(`Body: ${JSON.stringify(reqDoc)}`)
    return content.data
  }
}

interface CreateDatabaseArgs {
    name: string;
    version: string;
    isPublic?: boolean;
    groupId: string;
    userId: string;
    filePath: string;
    fullName?: string;
    description?: string;
    link?: string;
    citation?: string;
}

export const smApiCreateDatabase = async(args: CreateDatabaseArgs) => {
  return await smApiDatabaseRequest('/v1/databases/create', args)
}

interface UpdateDatabaseArgs {
    archived?: boolean;
    isPublic?: boolean;
    fullName?: string;
    description?: string;
    link?: string;
    citation?: string;
}

export const smApiUpdateDatabase = async(id: number, args: UpdateDatabaseArgs) => {
  return await smApiDatabaseRequest(`/v1/databases/${id}/update`, args)
}

export const smApiDeleteDatabase = async(id: number) => {
  return await smApiDatabaseRequest(`/v1/databases/${id}/delete`)
}
