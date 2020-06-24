/**
 * Created by intsco on 1/10/17.
 */
import * as express from 'express';
import * as http from 'http';
import * as Knex from 'knex';
import * as multer from 'multer';
import * as path from 'path';
import * as cors from 'cors';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as companion from '@uppy/companion';
import * as bodyParser from "body-parser";
import * as genUuid from "uuid";
const getPixels = require('get-pixels');
import logger from '../../utils/logger';
import config, {Config, ImageCategory} from '../../utils/config';
import fineUploaderS3Middleware from './fineUploaderS3Middleware';
import fineUploaderLocalMiddleware from './fineUploaderLocalMiddleware';

export const IMG_TABLE_NAME = 'image';

type NDArray = any;

const defaultDBConfig = () => {
  const {host, database, user, password} = config.db;
  return {
    host, database, user, password,
    max: 10, // client pool size
    idleTimeoutMillis: 30000
  };
};

export const initDBConnection = (config = defaultDBConfig) => {
  return Knex({
    client: 'pg',
    connection: config(),
    searchPath: ['engine', 'public'],
    // @ts-ignore
    asyncStackTraces: true,
  });
};

function imageProviderDBBackend(knex: Knex) {
  /**
   @param {object} knex - knex database handler
   **/
  return async (app: express.Application, category: ImageCategory, mimeType: string, basePath: string, categoryPath: string) => {
    /**
     @param {string} category - field name / database table name
     @param {string} mimeType - e.g. 'image/png' or 'image/jpeg'
     @param {string} basePath - base URL path to the backend, e.g. '/db/'
     @param {string} categoryPath - URL path to the backend serving the given category of images, e.g. '/iso_images/'
     **/
    let storage = multer.memoryStorage();
    let upload = multer({storage: storage});
    let pixelsToBinary = (pixels: NDArray) => {
      // assuming pixels are stored as rgba
      const result = Buffer.allocUnsafe(pixels.data.length / 4);
      for (let i = 0; i < pixels.data.length; i += 4) {
        result.writeUInt8(pixels.data[i], i / 4);
      }
      return result;
    };

    const imgTableExists = await knex.schema.hasTable(IMG_TABLE_NAME);
    if (!imgTableExists) {
      await knex.schema.createTable(IMG_TABLE_NAME, function (table) {
        table.text('id').primary();
        table.text('category');
        table.binary('data');
      });
    }
    let uri = path.join(basePath, categoryPath, ":image_id");
    app.get(uri,
      async function (req, res) {
        try {
          const row = await knex.select(knex.raw('data')).from(IMG_TABLE_NAME).where('id', '=', req.params.image_id).first();
          if (row === undefined) {
            throw Error(`Image with id=${req.params.image_id} does not exist`);
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

        getPixels(req.file.buffer, mimeType, async function (err?: Error, pixels?: NDArray) {
          if (err) {
            logger.error(err.message);
            res.status(500).send('Failed to parse image');
          }
          else {
            try {
              let row = {'id': imgID, 'category': category, 'data': pixelsToBinary(pixels)};
              const m = await knex.insert(row).into(IMG_TABLE_NAME);
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
          const m = await knex.del().from(IMG_TABLE_NAME).where('id', '=', req.params.image_id);
          logger.debug(`${m}`);
          res.status(202).end();
        } catch (e) {
          logger.error(e.message);
        }
      });
    logger.debug(`Accepting DELETE on ${uri}`);
  }
}

function imageProviderFSBackend(storageRootDir: string) {
  /**
   @param {string} storageRootDir - path to a folder where images will be stored, e.g '/opt/data/'
   **/
  return async (app: express.Application, category: ImageCategory, mimeType: string, basePath: string, categoryPath: string) => {
    let storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          let subdir = crypto.randomBytes(2).toString('hex').slice(1),  // 3 letter sub-folder name
            dest = path.join(storageRootDir, categoryPath, subdir);
          await fs.ensureDir(dest);
          cb(null, dest);
        }
        catch (e) {
          logger.error(e);
          cb(e, '');
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
    app.use(express.static(storageRootDir, {
      setHeaders: (res) => {
        res.type(mimeType);
      }
    }));
    logger.debug(`Accepting GET on ${uri}`);

    uri = path.join(basePath, categoryPath, 'upload');
    app.post(uri, upload.single(category),
      function (req, res, next) {
        let imageID = path.basename(req.file.destination) + req.file.filename;
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

export async function createStorageServerApp(config: Config, knex: Knex) {
  try {
    const app = express();
    app.use(cors());

    const backendFactories = {
      'fs': imageProviderFSBackend(config.img_upload.iso_img_fs_path),
      'db': imageProviderDBBackend(knex)
    };

    for (const category of Object.keys(config.img_upload.categories) as ImageCategory[]) {
      logger.debug(`Image category: ${category}`);
      const catSettings = config.img_upload.categories[category];
      for (const storageType of catSettings.storage_types) {
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
    throw e;
  }
}

export async function createStorageServerAsync(config: Config) {
  const knex = initDBConnection();
  const app = await createStorageServerApp(config, knex);

  const httpServer = http.createServer(app);
  await new Promise((resolve, reject) => {
    httpServer.listen(config.img_storage_port).on('listening', resolve).on('error', reject);
  });

  if (config.upload.destination === 's3') {
    app.use('/dataset_upload', fineUploaderS3Middleware());
  } else {
    app.use('/dataset_upload', fineUploaderLocalMiddleware());
  }

  const providerOptions =
    config.aws ? {
      s3: {
        getKey: (req: express.Request, filename: string, metadata: object) =>  {
          return `${config.upload.moldbPrefix}/${genUuid()}/${filename}`
        },
        key: config.aws.aws_access_key_id,
        secret: config.aws.aws_secret_access_key,
        bucket: config.upload.bucket,
        region: config.aws.aws_region,
        useAccelerateEndpoint: false,  // default: false,
        expires: 300,  // default: 300 (5 minutes)
        acl: 'private',  // default: public-read
      }
    } : {}

  const options = {
    providerOptions,
    server: {
      host: `localhost:${config.img_storage_port}`,
      protocol: 'http',
      path: '/database_upload',
    },
    filePath: '/tmp',
    debug: true,
  };
  app.use('/database_upload', bodyParser.json(), companion.app(options));
  companion.socket(httpServer, options);

  logger.info(`Storage server is listening on ${config.img_storage_port} port...`);
  return httpServer;
}
