import { Request } from 'express'

import config from '../../utils/config'
import { getS3Config } from '../../utils/awsClient'

type GetKey = (req: Request, filename: string) => string

export default function getCompanionOptions(path: string, getKey: GetKey) {
  return {
    providerOptions: {
      s3: {
        getKey,
        bucket: config.upload.bucket,
        awsClientOptions: getS3Config(),
        useAccelerateEndpoint: false,
        expires: 300,
        acl: 'private',
      },
    },
    server: {
      host: `localhost:${config.img_storage_port}`,
      path,
      protocol: 'http',
    },
    filePath: '/tmp',
    debug: true,
    logClientVersion: false,
    secret: config.uppy.secret,
    uploadUrls: config.uppy.uploadUrls,
  }
}
