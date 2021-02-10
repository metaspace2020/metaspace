import config from '../../utils/config'
import { Request } from 'express'

type GetKey = (req: Request, filename: string) => string

export default function getCompanionOptions(path: string, getKey: GetKey) {
  return {
    providerOptions: {
      s3: {
        getKey,
        endpoint: config.upload.endpoint,
        key: config.upload.access_key_id,
        secret: config.upload.secret_access_key,
        bucket: config.upload.bucket,
        region: config.aws.aws_region,
        awsClientOptions: config.upload.local_server_proxy
          ? {
              s3ForcePathStyle: true,
              httpOptions: {
                proxy: config.upload.local_server_proxy,
              },
            }
          : undefined,
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
  }
}
