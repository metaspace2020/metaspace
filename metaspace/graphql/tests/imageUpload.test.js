/**
 * Created by intsco on 5/9/17.
 * @jest-environment node
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  should = chai.should(),
  chaiHttp = require('chai-http'),
  fs = require('fs');

const {logger, pg} = require('../utils.js'),
  {createImgServerAsync, IMG_TABLE_NAME} = require('../imageUpload');

chai.use(chaiHttp);

// let server;

describe('imageUploadTest with fs and db backends', () => {
  const configSets = [
    {backend: 'db'},
    {backend: 'fs'}
  ];

  configSets.forEach( (cs) => {

    describe(`${cs.backend} backend`, () => {
      let server,
        image_id;

      beforeAll((done) => {
        let config = require('config');
        config.img_upload.backend = cs.backend;
        createImgServerAsync(config)
          .then((srv) => {
            server = srv;
            done();
          })
          .catch((err) => {
            logger.error(err);
          });
      });

      afterAll((done) => {
        server.close(() => {
          logger.debug('Iso image server closed');
          if (cs === 'db') {
            pg.schema.dropTableIfExists(IMG_TABLE_NAME)
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

      it(`POST /iso_images/upload should store the image and respond with a new iso image id`, (done) => {
        chai.request(server)
          .post('/iso_images/upload')
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

      it('GET /iso_images/:id should respond with the iso image', (done) => {
        chai.request(server)
          .get(`/iso_images/${image_id}`)
          .end((err, res) => {
            // there should be no errors
            should.not.exist(err);
            // there should be a 200 status code
            res.status.should.equal(200);
            // the response should be PNG
            res.type.should.equal("image/png");
            // res.body.status.should.have.property("image_url");
            done();
          });
      });
      it('DELETE /iso_images/delete/:id should delete the iso image', (done) => {
        chai.request(server)
          .delete(`/iso_images/delete/${image_id}`)
          .end((err, res) => {
            // there should be no errors
            should.not.exist(err);
            // there should be a 202 status code
            res.status.should.equal(202);
            done();
          });
      });

      it('GET /iso_images/:id should respond with 404 as the image is deleted', (done) => {
        chai.request(server)
          .get(`/iso_images/${image_id}`)
          .end((err, res) => {
            // there should be a 200 status code
            res.status.should.equal(404);
            done();
          });
      });

    });

  });

});
