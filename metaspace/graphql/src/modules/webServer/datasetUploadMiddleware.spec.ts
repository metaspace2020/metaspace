jest.mock('../../utils/config', () => {
  return {
    default: {
      aws: {
        aws_secret_access_key: 'aws-secret-access-key',
        aws_access_key_id: 'aws-access-key-id',
        aws_region: 'aws-region'
      },
      upload: {
        bucket: 's3-upload-bucket',
      },
    },
  };
});
import * as supertest from 'supertest';
import * as express from 'express';
import datasetUploadMiddleware from './datasetUploadMiddleware';


jest.mock('aws-sdk/clients/s3', () => {
  return class MockS3 {
    createMultipartUpload(options: any, cb: any) {
      cb(null, { Key: options.Key })
    }
  }
})

describe.only('datasetUploadMiddleware', () => {
  let app: express.Express, uuid: string, uuidSignature: string
  beforeEach(async () => {
    app = express();
    app.use(datasetUploadMiddleware());

    const uuidResponse = await supertest(app)
      .get('/s3/uuid')
      .expect('Content-Type', /json/)
      .expect(200);
    uuid = uuidResponse.body.uuid;
    uuidSignature = uuidResponse.body.uuidSignature;
  });

  it('should return a key', async () => {
    const response = await supertest(app)
      .post(`/s3/multipart`)
      .set({ uuid, uuidSignature })
      .send({ filename: 'test.ibd', type: 'text/csv' })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toMatchObject({ key: `${uuid}/test.ibd` });
  })

  it('should error on invalid signature', async () => {
    await supertest(app)
      .post(`/s3/multipart`)
      .set({ uuid, uuidSignature: '123' })
      .send({ filename: 'test.ibd', type: 'text/csv' })
      .expect(500);
  })
});
