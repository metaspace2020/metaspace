import * as http from 'http'
import * as crypto from 'crypto'
import { Router, Request, Response } from 'express'
import * as companion from '@uppy/companion'
import * as genUuid from 'uuid'
import * as bodyParser from 'body-parser'

import getCompanionOptions from './getCompanionOptions'

import { getS3Credentials } from '../../utils/awsClient'
import logger from '../../utils/logger'

function signUuid(uuid: string) {
  const credentials = getS3Credentials()
  const hmac = crypto.createHmac('sha1', credentials?.secretAccessKey || '')
  return hmac.update(uuid).digest('base64')
}

/**
 * Generate a uuid to be used as the destination directory in S3, and sign it. This server-supplied signature can
 * validate that the client hasn't tampered with the upload destination in an attempt to access/overwrite
 * other peoples' data.
 * @param req
 * @param res
 * @param next
 */
function generateUuidForUpload(req: Request, res: Response) {
  const uuid = genUuid.v4()
  const uuidSignature = signUuid(uuid)
  res.json({ uuid, uuidSignature })
}

export default function(httpServer?: http.Server) {
  const options = getCompanionOptions(
    '/dataset_upload',
    (req: Request, filename: string) => {
      const uuid = req.header('uuid')

      if (uuid === undefined) {
        throw new Error('uuid is not valid')
      }
      const uuidSignature = req.header('uuidSignature')
      const signedUuid = signUuid(uuid)
      if (signedUuid !== uuidSignature) {
        throw new Error('uuid is not valid')
      }

      const source = req.body?.metadata?.source
      const user = req.body?.metadata?.user

      logger.debug(`[${source}] File ${filename} uploaded to ${uuid} from user ${user}`)

      return `${uuid}/${filename}`
    }
  )

  const router = Router()
  router.use(bodyParser.json({ limit: '1MB' }))
  router.get('/s3/uuid', generateUuidForUpload)
  router.use(companion.app(options))
  if (httpServer) {
    companion.socket(httpServer, options)
  }
  return router
}
