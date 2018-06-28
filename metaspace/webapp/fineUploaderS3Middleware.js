// minimal amount of code to support direct upload to S3
const config = require('./conf.js'),
      crypto = require('crypto'),
      express = require('express'),
      bodyParser = require('body-parser');

function signV2(req, res, next) {
  let hmac = crypto.createHmac('sha1', config.AWS_SECRET_ACCESS_KEY);
  if (req.body.headers) {
    res.json({signature: hmac.update(req.body.headers).digest('base64')});
  } else {
    const policy = new Buffer(JSON.stringify(req.body), 'utf-8').toString('base64'),
          signature = hmac.update(policy).digest('base64');
    res.json({policy, signature});
  }
}

function fineUploaderS3Middleware(options) {
  var router = express.Router()
    router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());
  router.post('/s3/sign', signV2);
  return router;
}

module.exports = fineUploaderS3Middleware;
