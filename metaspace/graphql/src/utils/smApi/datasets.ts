import { UserError } from 'graphql-errors'
import * as _ from 'lodash'
import { snakeCase } from 'typeorm/util/StringUtils'

import logger from '../logger'
import { smApiJsonPost } from './smApiCall'

interface DatasetRequestBody {
  doc?: unknown;
  email?: string;
  priority?: boolean;
  force?: boolean;
  del_first?: boolean;
  url?: string;
  transform?: unknown;
}

const datasetDocFieldMapping = {
  databaseIds: 'moldb_ids',
  numPeaks: 'n_peaks',
}

export const smApiDatasetRequest = async(uri: string, args: any = {}) => {
  const reqDoc: DatasetRequestBody = args || {}
  // @ts-ignore
  reqDoc.doc = _.mapKeys(reqDoc.doc, (v, k) => datasetDocFieldMapping[k] || snakeCase(k))

  const { response, content } = await smApiJsonPost(uri, reqDoc)

  if (!response.ok) {
    if (content.status === 'dataset_busy') {
      throw new UserError(JSON.stringify({
        type: 'dataset_busy',
        hint: 'Dataset is busy. Try again later.',
      }))
    } else {
      throw new UserError(`Request to sm-api failed: ${JSON.stringify(content)}`)
    }
  } else {
    logger.info(`Successful ${uri}`)
    logger.debug(`Body: ${JSON.stringify(reqDoc)}`)
    return content
  }
}

interface UpdateDatasetArgs {
  name?: string;
  inputPath?: string;
  uploadDT?: string;
  metadata?: unknown;
  config?: unknown;
  isPublic?: boolean;
  submitterId?: string;
  groupId?: string | null;
  projectIds?: string[];
}

interface UpdateDatasetMetaArgs {
  asyncEsUpdate?: boolean;
  priority?: number;
  force?: boolean;
  useLithops?: boolean;
  performEnrichment?: boolean;
}

export const smApiUpdateDataset = async(id: string, updates: UpdateDatasetArgs, args: UpdateDatasetMetaArgs = {}) => {
  try {
    const camelCaseArgs = _.mapKeys(args, (v, k) => snakeCase(k))
    await smApiDatasetRequest(`/v1/datasets/${id}/update`, {
      doc: updates,
      ...camelCaseArgs,
    })
  } catch (err) {
    logger.error('Failed to update dataset', err)
  }
}

export interface DeleteDatasetArgs {
  del_raw?: boolean;
  force?: boolean;
}

export const smApiDeleteDataset = async(dsId: string, args?: DeleteDatasetArgs) => {
  return await smApiDatasetRequest(`/v1/datasets/${dsId}/delete`, args)
}
