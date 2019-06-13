/**
 * Created by intsco on 5/9/17.
 * @jest-environment node
 */
import * as supertest from 'supertest';
import * as express from 'express';
import * as Knex from 'knex';
import * as fs from 'fs';
import config, {ImageStorageType} from '../src/utils/config';

const {logger} = require('../utils.js'),
  {initDBConnection} = require('../src/utils/knexDb'),
  {createImageServerApp, IMG_TABLE_NAME} = require('../imageUpload');

let getRespMimeMap = {
  fs: 'image/png',
  db: 'application/octet-stream'
};

describe('imageUploadTest with fs and db backends', () => {
  (['db', 'fs'] as ImageStorageType[]).forEach( (storageType) => {

    describe(`${storageType} storage type`, () => {
      let server: supertest.SuperTest<supertest.Test>;
      let knex: Knex;

      beforeAll(async () => {
        logger.info('> Before all');
        knex = initDBConnection();
        server = supertest(await createImageServerApp(config, knex));
      });

      afterAll(async () => {
        logger.info('> After all');
        await new Promise(resolve => server.end(resolve));
        await knex.destroy();
      });

      let image_id: string;

      it(`POST /${storageType}/iso_images/upload should store the image and respond with a new iso image id`, async () => {
        const resp = await server
          .post(`/${storageType}/iso_images/upload`)
          .attach('iso_image', fs.readFileSync('tests/test_iso_image.png'), 'test_iso_image.png');

        expect(resp.status).toBe(201);
        expect(resp.type).toBe('application/json');
        expect(resp.body).toHaveProperty('image_id');

        image_id = resp.body.image_id;
      });

      it(`GET /${storageType}/iso_images/:image_id should respond with the iso image`, async () => {
        const resp = await server
          .get(`/${storageType}/iso_images/${image_id}`)
          .send();

        expect(resp.status).toBe(200);
        expect(resp.type).toBe(getRespMimeMap[storageType]);
      });

      it(`DELETE /${storageType}/iso_images/delete/${image_id!} should delete the iso image`, async () => {
        const resp = await server
          .delete(`/${storageType}/iso_images/delete/${image_id}`)
          .send();

        expect(resp.status).toBe(202);
      });

      it(`GET /${storageType}/iso_images/:image_id should respond with 404 as the image is deleted`, async () => {
        try {
          const resp = await server
            .get(`/${storageType}/iso_images/${image_id}`)
            .send();
        } catch (e) {
          expect(e.status).toBe(404);
        }
      });

    });

  });

});
