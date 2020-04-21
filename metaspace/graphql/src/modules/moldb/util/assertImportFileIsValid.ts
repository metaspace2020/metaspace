import {S3} from 'aws-sdk';
import config from '../../../utils/config';
import {UserError} from 'graphql-errors';

const FILE_SIZE_LIMIT_MB = 150;

export const assertImportFileIsValid = async (filePath: string) => {
  const parsedPath = /s3:\/\/([^/]+)\/(.*)/.exec(filePath);
  if (parsedPath == null) {
    throw new UserError('Wrong file path');
  }
  const [, bucket, key] = parsedPath;
  if (bucket != config.upload.bucket || !key.startsWith(config.upload.moldbPrefix)) {
    throw new UserError('Wrong file path');
  }

  const s3 = new S3({
    region: config.aws.aws_region,
    credentials: {
      accessKeyId: config.aws.aws_access_key_id,
      secretAccessKey: config.aws.aws_secret_access_key,
    },
  });
  const object = await s3.headObject({ Bucket: bucket, Key: key }).promise();
  if (object == null || object.ContentLength == null) {
    throw new UserError('File does not exist');
  }
  if (object.ContentLength > FILE_SIZE_LIMIT_MB * 2**20) {
    throw new UserError(`File is bigger than the file size limit ${FILE_SIZE_LIMIT_MB}`);
  }
};