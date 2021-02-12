import { S3 } from 'aws-sdk'
import config from './src/utils/config'

export const getS3Config = () => ({ ...config.aws, ...config.s3 })

export const getS3Credentials = () => {
  const { aws, s3 } = config
  return s3?.credentials || aws?.credentials || undefined
}

export const getS3Client = () => {
  return new S3(getS3Config())
}
