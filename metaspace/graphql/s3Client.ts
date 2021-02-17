import { S3 } from 'aws-sdk'
import config from './src/utils/config'

// credentials needs to be a new object, don't know why!
const getCredentials = ({ credentials }: S3.ClientConfiguration = {}) => {
  const { accessKeyId = '', secretAccessKey = '' } = credentials || {}
  return {
    accessKeyId,
    secretAccessKey,
  }
}

export const getS3Config = () => {
  if (config.aws) {
    return {
      credentials: getCredentials(config.aws),
      region: config.aws.region,
    }
  }
  const { endpoint, httpOptions, s3ForcePathStyle } = config.s3 || {}
  return {
    credentials: getCredentials(config.s3),
    endpoint,
    httpOptions,
    s3ForcePathStyle,
  }
}

export const getS3Credentials = () => getS3Config().credentials

export const getS3Client = () => {
  const s3Config = getS3Config()
  return new S3(s3Config)
}
