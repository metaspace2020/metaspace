// minimal amount of code to support direct upload to S3
import config from '../../utils/config';
import * as crypto from 'crypto';
import {Router, Request, Response, NextFunction} from 'express';
import * as bodyParser from 'body-parser';
import * as genUuid from 'uuid';
import * as url from 'url';

/**
 * Generate a uuid to be used as the destination directory in S3, and sign it. This server-supplied signature allows
 * `signV2` to validate that the client hasn't tampered with the upload destination in an attempt to access/overwrite
 * other peoples' data.
 * @param req
 * @param res
 * @param next
 */
function generateUuidForUpload(req: Request, res: Response, next: NextFunction) {
  const hmac = crypto.createHmac('sha1', config.aws.aws_secret_access_key);
  const uuid = genUuid();
  const uuidSignature = hmac.update(uuid).digest('base64');
  res.json({uuid, uuidSignature});
}

/**
 * NOTE: This is very customized for fine-uploader, which generates the S3 request header values on the client-side.
 * This is unnecessarily difficult to keep secure - there are a lot of places where an adversary could try to sneak
 * through additional parameters that would allow unexpected behavior. This function is intentionally much stricter
 * than necessary in an attempt to minimize any unforeseen attack vectors.
 *
 * DO NOT UPDATE THIS FUNCTION TO SUPPORT OTHER UPLOAD LIBRARIES. Instead, only pick new upload libraries that allow the
 * S3 request headers to be generated entirely server-side, with the client only providing the minimal information
 * needed to generate the request (i.e. the action type, filename & chunk IDs).
 *
 * @param stringToSign
 * @param expectedUuidSignature
 * @returns {*}
 */
const validateStringToSign = (stringToSign: string, expectedUuidSignature: string) => {
  const headers = stringToSign.split('\n');
  if (headers.length < 5) {
    console.error('S3 Uploader - stringToSign is too short');
    return false;
  }

  const validations = {
    method: false,
    amzHeaders: false,
    resourcePathStructure: false,
    resourceBucket: false,
    resourceOrigin: false,
    resourceUuid: false,
    resourceQueryString: false,
  };

  // contentMd5 is unused by fine-uploader & doesn't need validation
  // contentType *probably* doesn't need validation.
  // Content-Type can allow executables, images, HTML and JS to become dangerous to users if we ever link to them
  // through the browser, but since we're not doing that it should be fine. It is otherwise difficult to validate
  // this field, because browsers are fit to give whatever type they want to the file being uploaded,
  // possibly even based on OS preferences, and fine-uploader will just pass that along to us and we need to accept it.
  // date is unused by fine-uploader (it uses x-amz-date instead)
  const [method, contentMd5, contentType, date] = headers;
  validations.method = ['PUT','POST','DELETE'].includes(method);

  const amzHeaders = headers.slice(4, headers.length - 1);
  validations.amzHeaders = amzHeaders.every(amzHeader => {
    const safePrefixes = ['x-amz-acl:', 'x-amz-date:', 'x-amz-meta-qqfilename:'];
    return amzHeader === '' || safePrefixes.some(prefix => amzHeader.startsWith(prefix));
  });

  const resource = headers[headers.length - 1];
  let actualUuidSignature = null;
  try {
    // A fake origin is needed because url.URL requires a valid base url when parsing absolute URLs,
    // and this should validate that the origin isn't changed
    const fakeOrigin = 'https://example.com';
    const {origin, pathname, searchParams} = new url.URL(resource, fakeOrigin);
    const pathParts = pathname.split('/');
    if (pathParts.length === 4 && pathParts[0] === '') {
      validations.resourcePathStructure = true;
      validations.resourceBucket = pathParts[1] === config.upload.bucket;
      actualUuidSignature = crypto.createHmac('sha1', config.aws.aws_secret_access_key)
                                  .update(pathParts[2])
                                  .digest('base64');
      validations.resourceOrigin = origin === fakeOrigin;
      validations.resourceUuid = actualUuidSignature === expectedUuidSignature;
      const allowedSearchParams = ['uploads', 'partNumber', 'uploadId'];
      const actualSearchParams = Array.from(searchParams.keys());
      validations.resourceQueryString = actualSearchParams.every(key => allowedSearchParams.includes(key));
    }
  } catch (err) {
    console.warn('Unparseable resource in s3 signature request: ', err);
  }

  if (Object.values(validations).every(validation => validation === true)) {
    return true;
  } else {
    console.error('AWS S3 signature request:', {
      valid: false,
      stringToSign,
      expectedUuidSignature,
      actualUuidSignature,
      validations,
    });
    return false;
  }
};

function signV2(req: Request, res: Response, next: NextFunction) {
  if (typeof req.body.headers === 'string'
    && typeof req.query.uuid_signature === 'string'
    && validateStringToSign(req.body.headers, req.query.uuid_signature)) {
    const signature = crypto.createHmac('sha1', config.aws.aws_secret_access_key)
                            .update(req.body.headers)
                            .digest('base64');
    res.json({signature});
  } else {
    res.status(500).json({ invalid: true });
  }
  // Policy signing is only needed for non-chunked uploads through fine-uploader, which are turned off in the
  // client-side config
  // else {
  //   const policy = new Buffer(JSON.stringify(req.body), 'utf-8').toString('base64'),
  //         signature = hmac.update(policy).digest('base64');
  //   res.json({policy, signature});
  // }
}

export default function fineUploaderS3Middleware() {
  const router = Router();
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  router.post('/s3/sign', signV2);
  router.get('/s3/uuid', generateUuidForUpload);
  return router;
}

