/**
 * Created by intsco on 1/10/17.
 */
const express = require('express'),
  http = require('http'),
  multer = require('multer'),
  path = require('path'),
  cors = require('cors'),
  crypto = require('crypto'),
  fs = require('fs-extra'),
  getPixels = require('get-pixels'),
  Promise = require('promise');

const {logger, db} = require('./utils.js'),
  IMG_TABLE_NAME = 'image';

function imageProviderDBBackend(db) {
  /**
   @param {object} db - knex database handler
   **/
  return async (app, category, mimeType, basePath, categoryPath) => {
    /**
     @param {string} category - field name / database table name
     @param {string} mimeType - e.g. 'image/png' or 'image/jpeg'
     @param {string} basePath - base URL path to the backend, e.g. '/db/'
     @param {string} categoryPath - URL path to the backend serving the given category of images, e.g. '/iso_images/'
     **/
    let storage = multer.memoryStorage();
    let upload = multer({storage: storage});
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
    let uri = path.join(basePath, categoryPath, ":image_id");
    app.get(uri,
      async function (req, res) {
        try {
          const row = await db.select(db.raw('data')).from(IMG_TABLE_NAME).where('id', '=', req.params.image_id).first();
          if (row === undefined) {
            throw ({message: `Image with id=${req.params.image_id} does not exist`});
          }
          const imgBuf = row.data;
          res.type('application/octet-stream');
          res.end(imgBuf, 'binary');
        } catch (e) {
          logger.error(e.message);
          res.status(404).send('Not found');
        }
      });
    logger.debug(`Accepting GET on ${uri}`);

    uri = path.join(basePath, categoryPath, 'upload');
    app.post(uri, upload.single(category),
      function (req, res) {
        logger.debug(req.file.originalname);
        let imgID = crypto.randomBytes(16).toString('hex');

        getPixels(req.file.buffer, mimeType, async function (err, pixels) {
          if (err) {
            logger.error(err.message);
            res.status(500).send('Failed to parse image');
          }
          else {
            try {
              let row = {'id': imgID, 'category': category, 'data': pixelsToBinary(pixels)};
              const m = await db.insert(row).into(IMG_TABLE_NAME);
              logger.debug(`${m}`);
              res.status(201).json({image_id: imgID});
            } catch (e) {
              logger.error(e.message);
              res.status(500).send('Failed to store image');
            }
          }
        });
      });
    logger.debug(`Accepting POST on ${uri}`);

    uri = path.join(basePath, categoryPath, 'delete', ':image_id');
    app.delete(uri,
      async function (req, res) {
        try {
          const m = await db.del().from(IMG_TABLE_NAME).where('id', '=', req.params.image_id);
          logger.debug(`${m}`);
          res.status(202).end();
        } catch (e) {
          logger.error(e.message);
        }
      });
    logger.debug(`Accepting DELETE on ${uri}`);
  }
}

function imageProviderFSBackend(storageRootDir) {
  /**
   @param {string} storageRootDir - path to a folder where images will be stored, e.g '/opt/data/'
   **/
  return async (app, category, mimeType, basePath, categoryPath) => {
    let storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          let subdir = crypto.randomBytes(2).toString('hex').slice(1),  // 3 letter sub-folder name
            dest = path.join(storageRootDir, categoryPath, subdir);
          await fs.ensureDir(dest);
          cb(null, dest);
        }
        catch (e) {
          logger.warn(e);
        }
      },
      filename: (req, file, cb) => {
        let fname = crypto.randomBytes(15).toString('hex').slice(1);  // 29 letter file name
        cb(null, fname);
      }
    });
    let upload = multer({storage});

    let uri = path.join(basePath, categoryPath, ':image_id');
    app.get(uri,
      function (req, res, next) {
        let subdir = req.params.image_id.slice(0, 3),
          fname = req.params.image_id.slice(3);
        req.url = path.join(categoryPath, subdir, fname);
        next();
      });
    const options = {
      setHeaders: (res) => {
        res.type(mimeType);
      }
    };
    app.use(express.static(storageRootDir, options));
    logger.debug(`Accepting GET on ${uri}`);

    uri = path.join(basePath, categoryPath, 'upload');
    app.post(uri, upload.single(category),
      function (req, res, next) {
        let imageID = path.basename(req.file.destination) + req.file.filename;
        logger.debug(req.file);
        res.status(201).json({'image_id': imageID});
      });
    logger.debug(`Accepting POST on ${uri}`);

    uri = path.join(basePath, categoryPath, 'delete', ':image_id');
    app.delete(uri,
      async (req, res, next) => {
        try {
          let subdir = req.params.image_id.slice(0, 3),
            fname = req.params.image_id.slice(3);
          const imgPath = path.join(storageRootDir, categoryPath, subdir, fname);
          await fs.unlink(imgPath);
          res.status(202).json();
        }
        catch (e) {
          logger.warn(`${e} (image id = ${req.params.image_id})`);
          res.status(404).json()
        }
      });
    logger.debug(`Accepting DELETE on ${uri}`);
  }
}

async function setRouteHandlers(config) {
  try {
    const app = express();
    app.use(cors());

    const backendFactories = {
      'fs': imageProviderFSBackend(config.img_upload.iso_img_fs_path),
      'db': imageProviderDBBackend(db)
    };

    for (const category of Object.keys(config.img_upload.categories)) {
      logger.debug(`Image category: ${category}`);
      const catSettings = config.img_upload.categories[category];
      for (const storageType of catSettings['storage_types']) {
        const {type: mimeType, path: categoryPath} = catSettings;
        logger.debug(`Storage type: ${storageType}. MIME type: ${mimeType}. Path: ${categoryPath}`);
        const backend = backendFactories[storageType];
        await backend(app, category, mimeType, `/${storageType}/`, categoryPath);
      }
    }

    return app;
  }
  catch (e) {
    logger.error(`${e.stack}`);
  }
}

async function createImgServerAsync(config) {
  try {
    let app = await setRouteHandlers(config);

    let httpServer = http.createServer(app);
    httpServer.listen(config.img_storage_port, (err) => {
      if (err) {
        logger.error('Could not start iso image server', err);
      }
      logger.info(`Image server is listening on ${config.img_storage_port} port...`);
    });
    return httpServer;
  }
  catch (e) {
    logger.error(`${e.stack}`);
  }
  return Promise.resolve(httpServer);
}

module.exports = {createImgServerAsync, IMG_TABLE_NAME};
