/**
 * Created by intsco on 5/9/17.
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  should = chai.should(),
  chaiHttp = require('chai-http'),
  fs = require('fs');
chai.use(chaiHttp);

const server = require('../server');

// describe('routes : iso_images', () => {
//
//   beforeEach((done) => {});
//
//   afterEach((done) => {});
//
// });

let image_id;

describe('POST /iso_images/upload', () => {
  it('should store the image and respond with a new iso image url', (done) => {
    chai.request(server)
      .post('/iso_images/upload')
      .attach('iso_image', fs.readFileSync('tests/test_iso_image.png'), 'test_iso_image.png')
      .end((err, res) => {
        // there should be no errors
        should.not.exist(err);
        // there should be a 200 status code
        res.status.should.equal(201);
        // the response should be JSON
        res.type.should.equal("application/json");
        res.body.should.have.property("image_url");
        
        image_id = res.body.image_url.split("/").slice(-1).pop();
        console.log(image_id);
        done();
      });
  });
});

describe('GET /iso_images/:id', () => {
  it('should respond with the iso image', (done) => {
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
});

describe('DELETE /iso_images/delete/:id', () => {
  it('should delete the iso image', (done) => {
    chai.request(server)
      .delete(`/iso_images/delete/${image_id}`)
      .end((err, res) => {
        // there should be no errors
        should.not.exist(err);
        // there should be a 200 status code
        res.status.should.equal(200);
        done();
      });
  });
});

describe('GET /iso_images/:id', () => {
  it('should respond with 404 as the image is deleted', (done) => {
    chai.request(server)
      .get(`/iso_images/${image_id}`)
      .end((err, res) => {
        // there should be a 200 status code
        res.status.should.equal(404);
        done();
      });
  });
});
