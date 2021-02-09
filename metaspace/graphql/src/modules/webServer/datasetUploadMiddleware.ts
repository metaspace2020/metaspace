import * as http from 'http';
import * as crypto from 'crypto';
import {Router, Request, Response, NextFunction} from 'express';
import * as companion from '@uppy/companion';
import * as genUuid from "uuid";
import * as bodyParser from "body-parser";
import getCompanionOptions from './getCompanionOptions'

import config from '../../utils/config';

function signUuid(uuid: string) {
  const hmac = crypto.createHmac('sha1', config.upload.secret_access_key);
  return hmac.update(uuid).digest('base64');
}

/**
 * Generate a uuid to be used as the destination directory in S3, and sign it. This server-supplied signature can
 * validate that the client hasn't tampered with the upload destination in an attempt to access/overwrite
 * other peoples' data.
 * @param req
 * @param res
 * @param next
 */
function generateUuidForUpload(req: Request, res: Response, next: NextFunction) {
  const uuid = genUuid();
  const uuidSignature = signUuid(uuid)
  res.json({uuid, uuidSignature});
}

export default function (httpServer?: http.Server) {
  const options = getCompanionOptions(
    '/dataset_upload',
    (req: Request, filename: string, metadata: object) => {
      const uuid = req.header('uuid')
      if (uuid === undefined) {
        throw new Error('uuid is not valid')
      }
      const uuidSignature = req.header('uuidSignature')
      const signedUuid = signUuid(uuid)
      if (signedUuid !== uuidSignature) {
        throw new Error('uuid is not valid')
      }
      return `${uuid}/${filename}`
    }
  )

  const router = Router()
  router.use(bodyParser.json({ limit: '1MB' }))
  router.get('/s3/uuid', generateUuidForUpload)
  router.use(companion.app(options))
  if (httpServer) {
    companion.socket(httpServer, options);
  }
  return router
}
