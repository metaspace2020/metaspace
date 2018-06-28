/**
 * Created by intsco on 5/9/17.
 * @jest-environment node
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  should = chai.should(),
  chaiHttp = require('chai-http'),
  fs = require('fs'),
  config = require('config'),
  {promisify} = require('util');

const {logger, db} = require('../utils.js'),
  {createImgServerAsync, IMG_TABLE_NAME} = require('../imageUpload');

chai.use(chaiHttp);

let getRespMimeMap = {
  fs: 'image/png',
  db: 'application/octet-stream'
}

describe('imageUploadTest with fs and db backends', () => {
  ['db', 'fs'].forEach( (storageType) => {

    describe(`${storageType} storage type`, () => {
      let server;

      beforeAll(async () => {
        server = await createImgServerAsync(config);
      });

      afterAll(done => {
        server.close(async () => {
          if (storageType === 'db') {
            await db.schema.dropTableIfExists(IMG_TABLE_NAME)
          }
          logger.debug('Iso image server closed');
          done();
        });
      });

      let image_id;

      it(`POST /${storageType}/iso_images/upload should store the image and respond with a new iso image id`, async () => {
        const resp = await chai.request(server)
          .post(`/${storageType}/iso_images/upload`)
          .attach('iso_image', fs.readFileSync('tests/test_iso_image.png'), 'test_iso_image.png')
          .send();

        expect(resp.status).toBe(201);
        expect(resp.type).toBe('application/json');
        expect(resp.body).toHaveProperty('image_id');

        image_id = resp.body.image_id;
      });

      it(`GET /${storageType}/iso_images/:image_id should respond with the iso image`, async () => {
        const resp = await chai.request(server)
          .get(`/${storageType}/iso_images/${image_id}`)
          .send();

        expect(resp.status).toBe(200);
        expect(resp.type).toBe(getRespMimeMap[storageType]);
      });

      it(`DELETE /${storageType}/iso_images/delete/${image_id} should delete the iso image`, async () => {
        const resp = await chai.request(server)
          .delete(`/${storageType}/iso_images/delete/${image_id}`)
          .send();

        expect(resp.status).toBe(202);
      });

      it(`GET /${storageType}/iso_images/:image_id should respond with 404 as the image is deleted`, async () => {
        try {
          const resp = await chai.request(server)
            .get(`/${storageType}/iso_images/${image_id}`)
            .send();
        } catch (e) {
          expect(e.status).toBe(404);
        }
      });

    });

  });

});
