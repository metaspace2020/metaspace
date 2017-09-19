/**
 * Created by intsco on 1/10/17.
 */
const express = require('express'),
  http = require("http"),
  multer = require('multer'),
  path = require('path'),
  crypto = require('crypto'),
  fs = require('fs'),
  Promise = require('promise');

const {logger, pg} = require('./utils.js');

function imageProviderDBBackend(app, config) {
  let storage = multer.memoryStorage();
  let upload = multer({ storage: storage });

  pg.schema.createTableIfNotExists('iso_image', function (table) {
    table.text('id');
    table.binary('data');
  }).then(() => {
    app.get(path.join(config.img_upload.img_base_path, ":img_id"),
      function (req, res) {
        pg.select(pg.raw('data'))
          .from('iso_image')
          .where('id', '=', req.params.img_id)
          .first()
          .then((row) => {
            if (row === undefined)
              throw ({message: `Image with id=${image_id} does not exist`});
            let img_buf = row.data;
            res.type('image/png');
            res.end(img_buf, 'binary');
          })
          .catch((e) => {
            logger.error(e.message);
            res.status(404).send('Not found');
          });
      });

    app.post(path.join(config.img_upload.img_base_path, 'upload'), upload.single('iso_image'),
      function (req, res, next) {
        logger.debug(req.file.originalname);
        let img_id = crypto.randomBytes(16).toString('hex');

        let img_buf = req.file.buffer;
        pg.insert({'id': img_id, 'data': img_buf})
          .into('iso_image')
          .then((m) => {
            logger.debug(`${m}`);
            res.status(201).json({ image_id: img_id });
          })
          .catch((e) => {
            logger.error(e.message);
            res.status(500).send('Failed to store image');
          });
      });

    app.delete(path.join(config.img_upload.img_base_path, 'delete', ":img_id"),
      function (req, res, next) {
        pg.del().from('iso_image')
          .where('id', '=', req.params.img_id)
          .catch((e) => {
            logger.error(e.message);
          })
          .then((m) => {
            logger.debug(`${m}`);
            res.status(202).end();
          })
      });
    });
}

function imageProviderFSBackend(app, config) {
  let storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, path.join(config.img_upload.iso_img_fs_path, config.img_upload.img_base_path))
    }
  });
  let upload = multer({ storage });

  app.use(express.static(config.img_upload.iso_img_fs_path));

  app.post(path.join(config.img_upload.img_base_path, 'upload'), upload.single('iso_image'),
    function (req, res, next) {
      logger.debug(req.file.originalname);
      let image_id = req.file.filename;
      res.status(201).json({ image_id });
    });

  app.delete(path.join(config.img_upload.img_base_path, 'delete', ":img_id"),
    function (req, res, next) {
      const img_path = path.join(config.img_upload.iso_img_fs_path, config.img_upload.img_base_path, req.params.img_id);
      fs.unlink(img_path, function (err) {
        if (err)
          logger.warn(`${err} (image id = ${req.params.img_id})`);
      });
      res.status(202).json();
    });
}

function createIsoImgServerAsync(config) {
  const app = express();

  express.static.mime.default_type = "image/png";
  if (config.img_upload.backend === "fs") {
    imageProviderFSBackend(app, config);
  }
  else if (config.img_upload.backend === "db") {
    imageProviderDBBackend(app, config);
  }
  else {
    logger.error(`Unknown image upload backend: ${config.img_upload.backend}`)
  }

  let httpServer = http.createServer(app);
  httpServer.listen(config.iso_img_port, (err) => {
    if (err) {
      logger.error('Could not start iso image server', err)
    }
    logger.info(`Iso image server is listening on ${config.iso_img_port} port...`)
  });
  return Promise.resolve(httpServer);
}

module.exports = createIsoImgServerAsync;
