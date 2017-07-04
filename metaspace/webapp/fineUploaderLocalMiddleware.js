const config = require('./conf.js'),
      concat = require('concat-files'),
      fs = require('fs'),
      express = require('express'),
      mkdirp = require('mkdirp'),
      multer = require('multer'),
      bodyParser = require('body-parser');

function directory(req) {
  return `${config.UPLOAD_DESTINATION}/${req.body.uuid}`;
}

function filename(req, i) {
  return `${req.body.qqfilename}.${i !== undefined ? i : req.body.qqpartindex}`;
}

function combineChunks(req, res) {
  let filenames = [];
  for (let i = 0; i < req.body.qqtotalparts; i++)
    filenames.push(directory(req) + "/" + filename(req, i));
  console.log('combine', filenames);
  concat(filenames,
         directory(req) + "/" + req.body.qqfilename,
         function(err) {
           if (err)
             res.json({'error': 'failed to combine chunks'});
           else {
             for (let fn of filenames)
               fs.unlink(fn, console.log);
             res.send(200);
           }
         });
}

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = directory(req);
    mkdirp(dir, function(err) {
      if (err)
        cb(err, dir);
      else
        cb(null, dir);
    });
  },
  filename: function (req, file, cb) {
    cb(null, filename(req));
  }
});

const upload = multer({ storage }).single('qqfile');

function fineUploaderLocalMiddleware(options) {
  var router = express.Router();
  router.use(bodyParser.urlencoded({ extended: true }));
  router.use(bodyParser.json());

  router.post('/', function (req, res) {
    upload(req, res, function (err) {
      console.log('upload', req.body);
      if (err) {
        console.log(err);
        // TODO specify error
        res.json({success: false});
      } else {
        res.json({success: true});
      }
    })
  });

  router.post('/success', combineChunks);

  return router;
}

module.exports = fineUploaderLocalMiddleware;
