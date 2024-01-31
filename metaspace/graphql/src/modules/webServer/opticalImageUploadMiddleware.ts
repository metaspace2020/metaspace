import * as http from 'http'
import * as express from 'express'
import * as companion from '@uppy/companion'
import * as uuid from 'uuid'
import * as bodyParser from 'body-parser'

import getCompanionOptions from './getCompanionOptions'

export default function(httpServer: http.Server) {
  const options = getCompanionOptions(
    '/raw_opt_upload',
    (req: express.Request) => {
      const datasetId = req.body?.metadata?.datasetId
      const file_id = req.header('uuid') || req.body?.metadata?.uuid || uuid.v4()
      return `raw_optical/${datasetId}/${file_id}`
    }
  )

  const router = express.Router()
  router.use(bodyParser.json({ limit: '1MB' }))
  router.use(companion.app(options))
  companion.socket(httpServer, options)
  return router
}
