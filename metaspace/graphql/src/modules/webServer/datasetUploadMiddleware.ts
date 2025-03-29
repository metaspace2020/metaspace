import * as http from 'http'
import * as crypto from 'crypto'
import { Router, Request, Response } from 'express'
import * as companion from '@uppy/companion'
import * as genUuid from 'uuid'
import * as bodyParser from 'body-parser'
import * as moment from 'moment'

import getCompanionOptions from './getCompanionOptions'

import { getS3Credentials } from '../../utils/awsClient'
import logger from '../../utils/logger'

import * as cache from 'memory-cache'

const UPLOAD_KEY_PREFIX = 'upload_uuid:'
const UPLOAD_TIMEOUT = 30 * 60 // 30 minutes in seconds

function isUuidActive(uuid: string): Promise<boolean> {
  return Promise.resolve(cache.get(`${UPLOAD_KEY_PREFIX}${uuid}`) !== null)
}

async function generateUniqueUuid(): Promise<string> {
  const uuid = genUuid.v4()

  try {
    const isActive = await isUuidActive(uuid)
    if (!isActive) {
      // Store UUID with automatic expiration (UPLOAD_TIMEOUT in milliseconds)
      cache.put(
        `${UPLOAD_KEY_PREFIX}${uuid}`,
        moment().utc().toISOString(),
        UPLOAD_TIMEOUT * 1000
      )
    } else {
      // In the unlikely case of a collision, generate a new UUID
      return generateUniqueUuid()
    }
  } catch (err) {
    logger.warn('Cache operation failed, falling back to simple UUID generation:', err)
  }

  return uuid
}

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
async function generateUuidForUpload(req: Request, res: Response) {
  try {
    const uuid = await generateUniqueUuid()
    const uuidSignature = signUuid(uuid)
    res.json({ uuid, uuidSignature })
  } catch (err) {
    logger.error('Error generating UUID:', err)
    res.status(500).json({ error: 'Failed to generate UUID' })
  }
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

      // Try to clean up the UUID when upload completes, but don't block if it fails
      try {
        cache.del(`${UPLOAD_KEY_PREFIX}${uuid}`)
      } catch (err) {
        logger.warn('Failed to clean up UUID from cache:', err)
      }

      const source = req.body?.metadata?.source
      const user = req.body?.metadata?.user
      const size = req.body?.metadata?.size || 'not-provided'

      logger.debug(`[${source}] File ${filename} uploaded to ${uuid} from user ${user}, size: ${size} bytes`)

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
