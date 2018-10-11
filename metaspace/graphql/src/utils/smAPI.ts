import {UserError} from 'graphql-errors';
import fetch from 'node-fetch';

import config from './config';
import {logger} from '.';

interface SMAPIBody {
  doc?: Object;
  priority?: boolean;
  force?: boolean;
  del_first?: boolean;
  url?: string;
  transform?: Object;
}

export const smAPIRequest = async (uri: string, args: any={}) => {
  const {doc, delFirst, priority, force, url, transform} = args;
  const body: SMAPIBody = {
    priority, force, del_first: delFirst, url, transform,
  };
  if (doc) {
    body.doc = {
      name: doc.name,
      input_path: doc.inputPath,
      upload_dt: doc.uploadDT,
      metadata: doc.metadata,
      is_public: doc.isPublic,
      submitter_id: doc.submitterId,
      group_id: doc.groupId,
      project_ids: doc.projectIds,
      adducts: doc.adducts,
      mol_dbs: doc.molDBs,
    }
  }

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
