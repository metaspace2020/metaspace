import {UserError} from 'graphql-errors';
import fetch from 'node-fetch';
import * as _ from 'lodash';
import {snakeCase} from "typeorm/util/StringUtils";

import config from '../config';
import logger from '../logger';

interface DatasetRequestBody {
  doc?: Object;
  email?: string;
  priority?: boolean;
  force?: boolean;
  del_first?: boolean;
  url?: string;
  transform?: Object;
}

const datasetDocFieldMapping = {
  databaseIds: 'moldb_ids',
  numPeaks: 'n_peaks',
};

export const smApiDatasetRequest = async (uri: string, args: any={}) => {
  const reqDoc: DatasetRequestBody = args || {};
  // @ts-ignore
  reqDoc.doc = _.mapKeys(reqDoc.doc, (v, k) => datasetDocFieldMapping[k] || snakeCase(k));

  let resp = await fetch(`http://${config.services.sm_engine_api_host}${uri}`, {
    method: 'POST',
    body: JSON.stringify(reqDoc),
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const respDoc = await resp.json();
  if (!resp.ok) {
    if (respDoc.status === 'dataset_busy') {
      throw new UserError(JSON.stringify({
        'type': 'dataset_busy',
        'hint': `Dataset is busy. Try again later.`
      }));
    }
    else {
      throw new UserError(`smAPIRequest: ${JSON.stringify(respDoc)}`);
    }
  }
  else {
    logger.info(`Successful ${uri}`);
    logger.debug(`Body: ${JSON.stringify(reqDoc)}`);
    return respDoc;
  }
};

interface UpdateDatasetArgs {
  name?: string;
  inputPath?: string;
  uploadDT?: string;
  metadata?: object;
  config?: object;
  isPublic?: boolean;
  submitterId?: string;
  groupId?: string | null;
  projectIds?: string[];
}

export const smApiUpdateDataset = async (id: string, updates: UpdateDatasetArgs) => {
  try {
    await smApiDatasetRequest(`/v1/datasets/${id}/update`, {
      doc: updates
    });
  } catch (err) {
    logger.error('Failed to update dataset', err);
  }
};

export interface DeleteDatasetArgs {
  del_raw?: boolean;
  force?: boolean;
}

export const smApiDeleteDataset = async (dsId: string, args?: DeleteDatasetArgs) => {
  return await smApiDatasetRequest(`/v1/datasets/${dsId}/delete`, args);
};
