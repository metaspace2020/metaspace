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

describe.only('datasetUploadMiddleware', () => {
  let app: express.Express, uuid: string, uuidSignature: string
  beforeEach(async () => {
    app = express();
    app.use(datasetUploadMiddleware());
    const uuidResponse = await supertest(app)
      .get('/s3/uuid')
      .expect('Content-Type', /json/)
      .expect(200);

    console.log(uuidResponse.body)
    uuid = uuidResponse.body.uuid;
    uuidSignature = uuidResponse.body.uuidSignature;
  });

  it('should return a key', async () => {
    const response = await supertest(app)
      .post(`/s3/multipart?uuid=${uuid}&uuidSignature=${uuidSignature}`)
      .send({ filename: 'test.ibd', type: 'text/csv' })
      .expect('Content-Type', /json/)
      .expect(200);
    console.log(response.body)
    expect(response.body).toMatchObject({ key: `${uuid}/test.ibd` });
  })

  it('should error on invalid signature', async () => {
    const response = await supertest(app)
      .post(`/s3/multipart?uuid=${uuid}&uuidSignature=123`)
      .send({ filename: 'test.ibd', type: 'text/csv' })
      .expect('Content-Type', /json/)
      .expect(500);

    expect(response.body).toEqual({ invalid: true });
  })
});
