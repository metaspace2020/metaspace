jest.mock('../../utils/config', () => {
  return {
    default: {
      aws: {
        region: 'aws-region',
        credentials: {
          secretAccessKey: 'aws-secret-access-key',
          accessKeyId: 'aws-access-key-id',
        },
      },
      upload: {
        bucket: 's3-upload-bucket',
      },
      uppy: {
        secret: 'secretUppy',
        uploadUrls: [/^http(s){0,1}:\/\/(.+\.)*metaspace2020\.eu\/.*/, /.+/],
      },
      log: {
        level: 'error',
      },
    },
  }
})
import * as supertest from 'supertest'
import * as express from 'express'
import datasetUploadMiddleware from './datasetUploadMiddleware'

jest.mock('aws-sdk/clients/s3', () => {
  return class MockS3 {
    createMultipartUpload(options: any, cb: any) {
      cb(null, { Key: options.Key })
    }
  }
})

describe.only('datasetUploadMiddleware', () => {
  let app: express.Express, uuid: string, uuidSignature: string
  beforeEach(async() => {
    app = express()
    app.use(datasetUploadMiddleware())

    // Suppress Uppy logging the client version every call
    const oldLog = console.log
    jest.spyOn(console, 'log').mockImplementation((...args) => {
      if (!/companion.client.version/.test(args[0])) {
        oldLog(...args)
      }
    })

    const uuidResponse = await supertest(app)
      .get('/s3/uuid')
      .expect('Content-Type', /json/)
      .expect(200)
    uuid = uuidResponse.body.uuid
    uuidSignature = uuidResponse.body.uuidSignature
  })

  it('should return a key', async() => {
    const response = await supertest(app)
      .post('/s3/multipart')
      .set({ uuid, uuidSignature })
      .send({ filename: 'test.ibd', type: 'text/csv' })
      .expect('Content-Type', /json/)
      .expect(200)

    expect(response.body).toMatchObject({ key: `${uuid}/test.ibd` })
  })

  it('should error on invalid signature', async() => {
    await supertest(app)
      .post('/s3/multipart')
      .set({ uuid, uuidSignature: '123' })
      .send({ filename: 'test.ibd', type: 'text/csv' })
      .expect(500)
  })
})
