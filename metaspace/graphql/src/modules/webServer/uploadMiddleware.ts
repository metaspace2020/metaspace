import * as http from 'http'
import * as express from 'express'
import * as companion from '@uppy/companion'
import * as uuid from 'uuid'
import * as bodyParser from 'body-parser'

import getCompanionOptions from './getCompanionOptions'

export default function(path: string, s3_prefix: string, httpServer?: http.Server) {
  const options = getCompanionOptions(
    path,
    (req: express.Request, filename: string) => {
      return `${s3_prefix}/${uuid.v4()}/${encodeURIComponent(filename)}`
    },
  )

  const router = express.Router()
  router.use(bodyParser.json({ limit: '1MB' }))
  router.use(companion.app(options))
  if (httpServer) {
    companion.socket(httpServer, options)
  }
  return router
}
