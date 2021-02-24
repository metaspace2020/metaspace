import { S3, SES } from 'aws-sdk'
import config from './config'
import * as _ from 'lodash'

export const getAWSConfig = () => {
  // The 'config' package adds a bunch of non-enumerable properties to objects such as 'get', 'set', 'watch', etc.,
  // which aws-sdk treats as values, leading to errors. Deep cloning removes the non-enumerable properties.
  return _.cloneDeep(config.aws)
}

export const getS3Config = () => getAWSConfig() ?? _.cloneDeep(config.s3)

export const getS3Credentials = () => getS3Config()?.credentials

export const getS3Client = () => {
  const s3Config = getS3Config()
  return new S3(s3Config)
}

export const getSESClient = () => {
  const awsConfig = getAWSConfig()
  return awsConfig != null ? new SES(awsConfig) : null
}
