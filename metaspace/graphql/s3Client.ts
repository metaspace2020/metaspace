import { S3 } from 'aws-sdk'
import config from './src/utils/config'
import * as _ from 'lodash'

export const getS3Config = () => {
  // Deep clone the config object because the `config` package adds a bunch of non-enumerable properties to objects
  // such as 'get', 'set', 'watch', etc., which aws-sdk treats as values, leading to errors.
  // Deep cloning removes the non-enumerable properties.
  return _.cloneDeep(config.aws ?? config.s3)
}

export const getS3Credentials = () => getS3Config()?.credentials

export const getS3Client = () => {
  const s3Config = getS3Config()
  return new S3(s3Config)
}
