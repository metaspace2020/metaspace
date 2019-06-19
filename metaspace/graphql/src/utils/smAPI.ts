import {UserError} from 'graphql-errors';
import fetch from 'node-fetch';
import * as _ from 'lodash';

import config from './config';
import {logger} from '.';

interface SMAPIBody {
  doc?: Object;
  email?: string;
  priority?: boolean;
  force?: boolean;
  del_first?: boolean;
  url?: string;
  transform?: Object;
}

const fieldRenameMap = {
  inputPath: 'input_path',
  uploadDT: 'upload_dt',
  isPublic: 'is_public',
  submitterId: 'submitter_id',
  groupId: 'group_id',
  projectIds: 'project_ids',
  molDBs: 'mol_dbs',
  neutralLosses: 'neutral_losses',
  chemMods: 'chem_mods',
  numPeaks: 'n_peaks',
  decoySampleSize: 'decoy_sample_size'
};

export const smAPIRequest = async (uri: string, args: any={}) => {
  const body: SMAPIBody = args || {};
  // @ts-ignore
  body.doc = _.mapKeys(body.doc, (v, k) => fieldRenameMap[k] || k);

  let rawResp = await fetch(`http://${config.services.sm_engine_api_host}${uri}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const resp = await rawResp.json();
  if (!rawResp.ok) {
    if (resp.status === 'dataset_busy') {
      throw new UserError(JSON.stringify({
        'type': 'dataset_busy',
        'hint': `Dataset is busy. Try again later.`
      }));
    }
    else {
      throw new UserError(`smAPIRequest: ${JSON.stringify(resp)}`);
    }
  }
  else {
    logger.info(`Successful ${uri}`);
    logger.debug(`Body: ${JSON.stringify(body)}`);
    return resp;
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

export const smAPIUpdateDataset = async (id: string, updates: UpdateDatasetArgs) => {
  try {
    await smAPIRequest(`/v1/datasets/${id}/update`, {
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

export const smAPIDeleteDataset = async (dsId: string, args?: DeleteDatasetArgs) => {
  return await smAPIRequest(`/v1/datasets/${dsId}/delete`, args);
};
