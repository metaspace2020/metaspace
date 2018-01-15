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
  getPixels = require('get-pixels'),
  Promise = require('promise');

const {logger, db} = require('./utils.js'),
  IMG_TABLE_NAME = 'image';

function imageProviderDBBackend(db) {
  /**
    @param {object} db - knex database handler
  **/
  return async function(app, fieldName, mimeType, basePath, categoryPath) {
    /**
       @param {string} fieldName - field name / database table name
       @param {string} mimeType - e.g. 'image/png' or 'image/jpeg'
       @param {string} basePath - base URL path to the backend, e.g. '/db/'
       @param {string} categoryPath - URL path to the backend serving the given category of images, e.g. '/iso_images/'
    **/
    let storage = multer.memoryStorage();
    let upload = multer({ storage: storage });
    let pixelsToBinary = (pixels) => {
      // assuming pixels are stored as rgba
      const result = Buffer.allocUnsafe(pixels.data.length / 4);
      for (let i = 0; i < pixels.data.length; i += 4) {
        result.writeUInt8(pixels.data[i], i / 4);
      }
      return result;
    };

    const imgTableExists = await db.schema.hasTable(IMG_TABLE_NAME);
    if (!imgTableExists) {
      await db.schema.createTable(IMG_TABLE_NAME, function (table) {
        table.text('id').primary();
        table.text('category');
        table.binary('data');
      });
    }

    app.get(path.join(basePath, categoryPath, ":img_id"),
      async function (req, res) {
        const row = await db.select(db.raw('data')).from(IMG_TABLE_NAME).where('id', '=', req.params.img_id).first();
        try {
          if (row === undefined) {
            throw ({message: `Image with id=${req.params.img_id} does not exist`});
          }
          const imgBuf = row.data;
          res.type('application/octet-stream');
          res.end(imgBuf, 'binary');
        } catch (e) {
          logger.error(e.message);
          res.status(404).send('Not found');
        }
      });

    app.post(path.join(basePath, categoryPath, 'upload'), upload.single(fieldName),
      function (req, res) {
        logger.debug(req.file.originalname);
        let imgID = crypto.randomBytes(16).toString('hex');

        getPixels(req.file.buffer, mimeType, async function(err, pixels) {
          if (err) {
            logger.error(err);
            res.status(500).send('Failed to parse image');
          }

          const m = await db.insert({'id': imgID, 'category': fieldName, 'data': pixelsToBinary(pixels)}).into(IMG_TABLE_NAME);
          try {
            logger.debug(`${m}`);
            res.status(201).json({ image_id: imgID });
          } catch (e) {
            logger.error(e.message);
            res.status(500).send('Failed to store image');
          }
        });
      });

    app.delete(path.join(basePath, categoryPath, 'delete', ":img_id"),
      async function (req, res) {
        try {
          const m = await db.del().from(IMG_TABLE_NAME).where('id', '=', req.params.img_id);
          logger.debug(`${m}`);
          res.status(202).end();
        } catch (e) {
          logger.error(e.message);
        }
      });
  }
}

function imageProviderFSBackend(storageRootDir) {
  /**
    @param {string} storageRootDir - path to a folder where images will be stored, e.g '/opt/data/'
  **/
  return (app, fieldName, mimeType, basePath, categoryPath) => {
    let storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, path.join(storageRootDir, categoryPath))
      }
    });
    let upload = multer({ storage });

    const options = {
      setHeaders: (res) => {
        res.type(mimeType);
      }
    };
    app.use(basePath, express.static(storageRootDir, options));

    app.post(path.join(basePath, categoryPath, 'upload'), upload.single(fieldName),
      function (req, res, next) {
        let image_id = req.file.filename;
        logger.debug(image_id, req.file.originalname);
        res.status(201).json({ image_id });
      });

    app.delete(path.join(basePath, categoryPath, 'delete', ":img_id"),
      function (req, res, next) {
        const imgPath = path.join(storageRootDir, categoryPath, req.params.img_id);
        fs.unlink(imgPath, function (err) {
          if (err)
            logger.warn(`${err} (image id = ${req.params.img_id})`);
        });
        res.status(202).json();
      });
  }
}

function createCategoryBackend(app, config, category, storage_type, backendFactory) {
  const {type, path} = config.img_upload.categories[category];
  return backendFactory(app, category, type, `/${storage_type}/`, path);
};

function createImgServerAsync(config) {
  const app = express();
  app.use(cors());

  const backendFactories = {
    'fs': imageProviderFSBackend(config.img_upload.iso_img_fs_path),
    'db': imageProviderDBBackend(db)
  };

  for (const storageType of config.img_upload.storage_types) {
    if (!(storageType in backendFactories)) {
      logger.error(`Unknown image upload backend: ${storageType}`);
    } else {
      Object.keys(config.img_upload.categories).reduce(async (accum, category) => {
        await accum;
        return createCategoryBackend(app, config, category, storageType, backendFactories[storageType]);
      }, Promise.resolve());
    }
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
