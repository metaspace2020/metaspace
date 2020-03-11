jest.mock('../../utils/config', () => {
  return {
    default: {
      aws: {
        aws_secret_access_key: 'aws-secret-access-key',
      },
      upload: {
        bucket: 's3-upload-bucket',
      },
    },
  };
});
import * as supertest from 'supertest';
import * as express from 'express';
import fineUploaderS3Middleware from './fineUploaderS3Middleware';


describe('fineUploaderS3Middleware', () => {
  let app, uuid, uuidSignature, signUrl;
  beforeEach(async () => {
    app = express();
    app.use(fineUploaderS3Middleware());
    const uuidResponse = await supertest(app)
      .get('/s3/uuid')
      .expect('Content-Type', /json/)
      .expect(200);
    uuid = uuidResponse.body.uuid;
    uuidSignature = uuidResponse.body.uuidSignature;
    signUrl = `/s3/sign?uuid_signature=${encodeURIComponent(uuidSignature)}`;
  });

  const formatRequest = (headers) => {
    return {
      headers: headers
        .replace('(BUCKET_TO_REPLACE)', 's3-upload-bucket')
        .replace('(UUID_TO_REPLACE)', uuid)
    };
  };


  describe('should accept valid requests with signed UUIDs', () => {
    const TEST_CASES = [
      ['Initiate chunked .ibd upload', "POST\n\n\n\nx-amz-acl:private\nx-amz-date:Fri, 01 Mar 2019 16:57:27 GMT\nx-amz-meta-qqfilename:foo.ibd\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/foo.ibd?uploads"],
      ['Initiate chunked .imzML upload', "POST\n\n\n\nx-amz-acl:private\nx-amz-date:Fri, 01 Mar 2019 16:57:27 GMT\nx-amz-meta-qqfilename:foo.imzML\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/foo.imzML?uploads"],
      ['Upload .imzML chunk', "PUT\n\n\n\nx-amz-date:Fri, 01 Mar 2019 16:57:27 GMT\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/foo.imzML?partNumber=1&uploadId=adFIMtmNnXo4IyYwLY43hTDVXon0BrjGCtOeAt8XjgHmb54L2TmAz2Gdo6h5RjdwDUoj7vZxHtF32EQCg7eRDHkLT4VQn7pjjLaFwrNxWUSICM1IR4z4fW8XfknPdduS"],
      ['Finalize .imzML upload', "POST\n\napplication/xml; charset=UTF-8\n\nx-amz-date:Fri, 01 Mar 2019 16:57:27 GMT\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/foo.imzML?uploadId=adFIMtmNnXo4IyYwLY43hTDVXon0BrjGCtOeAt8XjgHmb54L2TmAz2Gdo6h5RjdwDUoj7vZxHtF32EQCg7eRDHkLT4VQn7pjjLaFwrNxWUSICM1IR4z4fW8XfknPdduS"],
      ['Cancel .imzML upload', "DELETE\n\n\n\nx-amz-date:Fri, 01 Mar 2019 17:01:01 GMT\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/Untreated_3_434_lite.imzML?uploadId=pdukgX54cobm5tG4bCyBkpjtFt.uuY3JaRpo6T_H6zC9ok_UD5Qjo2bH0QIr31e8k6jx_bKTCe.U1D78_ndKLXFugTpBDWIGu_gFjSlZxq5GhdZAHiDlAEf6prQNAiGX"],
      ['Minimal valid case (template for rejection tests)', "POST\n\n\n\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/filename"],
    ];
    TEST_CASES.forEach(([name, headers]) => {
      it(name, async () => {
        const response = await supertest(app)
          .post(signUrl)
          .send(formatRequest(headers))
          .expect('Content-Type', /json/)
          .expect(200);

        expect(response.body).toEqual({
          signature: expect.any(String)
        });
      })
    })
  });
  describe('should reject invalid/unsigned requests', () => {
    let oldConsoleError;
    beforeEach(() => {
      oldConsoleError = console.error;
      console.error = jest.fn();
    });
    afterEach(() => {
      console.error = oldConsoleError;
    });


    const TEST_CASES = [
      ['Malformed request', "POST\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/filename"],
      ['Invalid method', "GET\n\n\n\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/filename"],
      ['Invalid header', "POST\n\n\n\nx-amz-website-redirect-location:http://viruses.com/\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/filename"],
      ['Invalid path', "POST\n\n\n\n/filename"],
      ['Invalid path 2', "POST\n\n\n\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/subdir/filename"],
      ['Invalid bucket', "POST\n\n\n\n/some-other-bucket/(UUID_TO_REPLACE)/filename"],
      ['Invalid uuid', "POST\n\n\n\n/(BUCKET_TO_REPLACE)/01234567-0123-0123-0123-0123456789ab/filename"],
      ['Invalid uuid 2', "POST\n\n\n\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)-abcd/filename"],
      ['Invalid querystring', "POST\n\n\n\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/filename?versionId=1"],
    ];
    TEST_CASES.forEach(([name, headers]) => {

      it(name, async () => {
        const response = await supertest(app)
          .post(signUrl)
          .send(formatRequest(headers))
          .expect('Content-Type', /json/)
          .expect(500);

        expect(response.body).toEqual({ invalid: true });
      })
    });

    it('Invalid uuid signature', async () => {
      const response = await supertest(app)
        .post(signUrl + 'a')
        .send(formatRequest("POST\n\n\n\n/(BUCKET_TO_REPLACE)/(UUID_TO_REPLACE)/filename"))
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toEqual({ invalid: true });
    })

  })
});
