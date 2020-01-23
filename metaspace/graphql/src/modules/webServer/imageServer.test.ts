/**
 * Created by intsco on 5/9/17.
 * @jest-environment node
 */
import * as supertest from 'supertest';
import * as Knex from 'knex';
import * as fs from 'fs';

import config, {ImageStorageType} from '../../utils/config';
import logger from '../../utils/logger';
import {createImageServerApp, initDBConnection} from './imageServer';


const getRespMimeMap = {
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
        await knex.destroy();
      });

      let image_id: string;

      it(`POST /${storageType}/iso_images/upload should store the image and respond with a new iso image id`, async () => {
        const resp = await server
          .post(`/${storageType}/iso_images/upload`)
          .attach('iso_image', fs.readFileSync('tests/test_iso_image.png'), 'test_iso_image.png')
          .expect(201)
          .expect('Content-Type', /application\/json/);

        expect(resp.body).toHaveProperty('image_id');

        image_id = resp.body.image_id;
      });

      it(`GET /${storageType}/iso_images/:image_id should respond with the iso image`, async () => {
        await server
          .get(`/${storageType}/iso_images/${image_id}`)
          .send()
          .expect(200)
          .expect('Content-Type', getRespMimeMap[storageType]);
      });

      it(`DELETE /${storageType}/iso_images/delete/${image_id!} should delete the iso image`, async () => {
        await server
          .delete(`/${storageType}/iso_images/delete/${image_id}`)
          .send()
          .expect(202);
      });

      it(`GET /${storageType}/iso_images/:image_id should respond with 404 as the image is deleted`, async () => {
        await server
          .get(`/${storageType}/iso_images/${image_id}`)
          .send()
          .expect(404);
      });

    });

  });

});
