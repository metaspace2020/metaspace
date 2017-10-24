/**
 * Created by intsco on 1/10/17.
 */
const express = require('express'),
  http = require("http"),
  multer = require('multer'),
  path = require('path'),
  cors = require('cors'),
  crypto = require('crypto'),
  fs = require('fs'),
  Promise = require('promise');

const {logger, pg} = require('./utils.js'),
  IMG_TABLE_NAME = 'image';

function imageProviderDBBackend(pg) {
  return (app, fieldName, mimeType, basePath) => {
    /**
       @param {string} fieldName - field name / database table name
       @param {string} mimeType - e.g. 'image/png' or 'image/jpeg'
       @param {string} basePath - URL base path, e.g. '/iso_images/'
    **/
    let storage = multer.memoryStorage();
    let upload = multer({ storage: storage });

    pg.schema.createTableIfNotExists(IMG_TABLE_NAME, function (table) {
      table.text('id');
      table.text('category');
      table.binary('data');
    }).then(() => {
      app.get(path.join(basePath, ":img_id"),
        function (req, res) {
          pg.select(pg.raw('data'))
            .from(IMG_TABLE_NAME)
            .where('id', '=', req.params.img_id)
            .first()
            .then((row) => {
              if (row === undefined)
                throw ({message: `Image with id=${req.params.img_id} does not exist`});
              let img_buf = row.data;
              res.type(mimeType);
              res.end(img_buf, 'binary');
            })
            .catch((e) => {
              logger.error(e.message);
              res.status(404).send('Not found');
            });
        });

      app.post(path.join(basePath, 'upload'), upload.single(fieldName),
        function (req, res, next) {
          logger.debug(req.file.originalname);
          let imgID = crypto.randomBytes(16).toString('hex');

          pg.insert({'id': imgID, 'category': fieldName, 'data': req.file.buffer})
            .into(IMG_TABLE_NAME)
            .then((m) => {
              logger.debug(`${m}`);
              res.status(201).json({ image_id: imgID });
            })
            .catch((e) => {
              logger.error(e.message);
              res.status(500).send('Failed to store image');
            });
        });

      app.delete(path.join(basePath, 'delete', ":img_id"),
        function (req, res, next) {
          pg.del().from(IMG_TABLE_NAME)
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
}

function imageProviderFSBackend(storageRootDir) {
  return (app, fieldName, mimeType, basePath) => {
    let storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, path.join(storageRootDir, basePath))
      }
    });
    let upload = multer({ storage });

    const options = {
      setHeaders: (res) => {
        res.type(mimeType);
      }
    };
    app.use(express.static(storageRootDir, options));

    app.post(path.join(basePath, 'upload'), upload.single(fieldName),
      function (req, res, next) {
        let image_id = req.file.filename;
        logger.debug(image_id, req.file.originalname);
        res.status(201).json({ image_id });
      });

    app.delete(path.join(basePath, 'delete', ":img_id"),
      function (req, res, next) {
        const imgPath = path.join(storageRootDir, basePath, req.params.img_id);
        fs.unlink(imgPath, function (err) {
          if (err)
            logger.warn(`${err} (image id = ${req.params.img_id})`);
        });
        res.status(202).json();
      });
  }
}

function createImgServerAsync(config) {
  const app = express();
  app.use(cors());

  const backend = {
    'fs': imageProviderFSBackend(config.img_upload.iso_img_fs_path),
    'db': imageProviderDBBackend(pg)
  }[config.img_upload.backend];

  if (backend === undefined) {
    logger.error(`Unknown image upload backend: ${config.img_upload.backend}`);
  } else {
    Object.keys(config.img_upload.categories).forEach(category => {
      const {type, path} = config.img_upload.categories[category];
      backend(app, category, type, path);
    });
  }

  let httpServer = http.createServer(app);
  httpServer.listen(config.img_storage_port, (err) => {
    if (err) {
      logger.error('Could not start iso image server', err);
    }
    logger.info(`Image server is listening on ${config.img_storage_port} port...`);
  });
  return Promise.resolve(httpServer);
}

module.exports = {createImgServerAsync, IMG_TABLE_NAME};
