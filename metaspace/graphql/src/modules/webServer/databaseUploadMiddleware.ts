import * as http from 'http'
import * as express from 'express'
import * as companion from '@uppy/companion'
import * as genUuid from 'uuid'
import config from '../../utils/config'
import * as bodyParser from 'body-parser'

export default function(httpServer: http.Server) {
  const providerOptions =
      config.aws ? {
        s3: {
          getKey: (req: express.Request, filename: string, metadata: object) => {
            return `${config.upload.moldbPrefix}/${genUuid()}/${filename}`
          },
          key: config.aws.aws_access_key_id,
          secret: config.aws.aws_secret_access_key,
          bucket: config.upload.bucket,
          region: config.aws.aws_region,
          useAccelerateEndpoint: false, // default: false,
          expires: 300, // default: 300 (5 minutes)
          acl: 'private', // default: public-read
        },
      } : {}

  const options = {
    providerOptions,
    server: {
      host: `localhost:${config.img_storage_port}`,
      protocol: 'http',
      path: '/database_upload',
    },
    filePath: '/tmp',
    debug: true,
  }

  const router = express.Router()
  router.use(bodyParser.json({ limit: '1MB' }))
  router.use(companion.app(options))
  companion.socket(httpServer, options)
  return router
}
