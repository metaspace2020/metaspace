/**
 * Created by intsco on 5/9/17.
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  should = chai.should(),
  chaiHttp = require('chai-http'),
  fs = require('fs'),
  config = require('config');

const {logger, db} = require('../utils.js'),
  {createImgServerAsync, IMG_TABLE_NAME} = require('../imageUpload');

chai.use(chaiHttp);

let img_storage_types = [{type: 'image/png', storage_type: 'fs'},
                         {type: 'application/octet-stream', storage_type: 'db'}];

describe('imageUploadTest with fs and db backends', () => {
  img_storage_types.forEach( ({storage_type, type}) => {

    describe(`${storage_type} storage type`, () => {
      let server;

      before((done) => {
        createImgServerAsync(config)
          .then((srv) => {
            server = srv;
            done();
          })
          .catch((err) => {
            logger.error(err);
          });
      });

      after((done) => {
        server.close(() => {
          logger.debug('Iso image server closed');
          if (storage_type === 'db') {
            db.schema.dropTableIfExists(IMG_TABLE_NAME)
              .then(() => done())
              .catch((e) => {
                logger.error(e.message);
              });
          }
          else {
            done();
          }
        });
        // wsServer.close(() => console.log('WS server closed!') );
      });

      let image_id;

      it(`POST /${storage_type}/iso_images/upload should store the image and respond with a new iso image id`, (done) => {
        chai.request(server)
          .post(`/${storage_type}/iso_images/upload`)
          .attach('iso_image', fs.readFileSync('tests/test_iso_image.png'), 'test_iso_image.png')
          .end((err, res) => {
            // there should be no errors
            should.not.exist(err);
            // there should be a 201 status code
            res.status.should.equal(201);
            // the response should be JSON
            res.type.should.equal("application/json");
            res.body.should.have.property("image_id");

            image_id = res.body.image_id;
            logger.debug(image_id);
            done();
          });
      });

      it(`GET /${storage_type}/iso_images/:image_id should respond with the iso image`, async (done) => {
        chai.request(server)
          .get(`/${storage_type}/iso_images/${image_id}`)
          .end((err, res) => {
            // there should be no errors
            should.not.exist(err);
            // there should be a 200 status code
            res.status.should.equal(200);
            // the response should be PNG
            res.type.should.equal(type);
            // res.body.status.should.have.property("image_url");
            done();
          });
      });

      it(`DELETE /${storage_type}/iso_images/delete/${image_id} should delete the iso image`, (done) => {
        chai.request(server)
          .delete(`/${storage_type}/iso_images/delete/${image_id}`)
          .end((err, res) => {
            // there should be no errors
            should.not.exist(err);
            // there should be a 202 status code
            res.status.should.equal(202);
            done();
          });
      });

      it(`GET /${storage_type}/iso_images/:image_id should respond with 404 as the image is deleted`, (done) => {
        chai.request(server)
          .get(`/${storage_type}/iso_images/${image_id}`)
          .end((err, res) => {
            // there should be a 200 status code
            res.status.should.equal(404);
            done();
          });
      });

    });

  });

});
