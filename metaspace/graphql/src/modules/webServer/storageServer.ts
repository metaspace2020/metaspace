/**
 * Created by intsco on 1/10/17.
 */
import * as express from 'express'
import * as http from 'http'
import * as multer from 'multer'
import * as path from 'path'
import * as cors from 'cors'
import * as crypto from 'crypto'
import * as fs from 'fs-extra'
import logger from '../../utils/logger'
import { Config, ImageCategory } from '../../utils/config'
import datasetUploadMiddleware from './datasetUploadMiddleware'
import databaseUploadMiddleware from './databaseUploadMiddleware'
import uploadMiddleware from './uploadMiddleware'
import opticalImageUploadMiddleware from './opticalImageUploadMiddleware'

function imageProviderFSBackend(storageRootDir: string) {
  /**
   @param {string} storageRootDir - path to a folder where images will be stored, e.g '/opt/data/'
   **/
  return (
    app: express.Application,
    category: ImageCategory,
    mimeType: string,
    basePath: string,
    categoryPath: string
  ) => {
    const storage = multer.diskStorage({
      destination: async(req, file, cb) => {
        try {
          const subdir = crypto.randomBytes(2).toString('hex').slice(1) // 3 letter sub-folder name
          const dest = path.join(storageRootDir, categoryPath, subdir)
          await fs.ensureDir(dest)
          cb(null, dest)
        } catch (e) {
          logger.error(e)
          cb(e, '')
        }
      },
      filename: (req, file, cb) => {
        const fname = crypto.randomBytes(15).toString('hex').slice(1) // 29 letter file name
        cb(null, fname)
      },
    })
    const upload = multer({ storage })

    let uri = path.join(basePath, categoryPath, ':image_id')
    app.get(uri,
      function(req, res, next) {
        const subdir = req.params.image_id.slice(0, 3)
        const fname = req.params.image_id.slice(3)
        req.url = path.join(categoryPath, subdir, fname)
        next()
      })
    app.use(express.static(storageRootDir, {
      immutable: true,
      maxAge: '30 days',
      setHeaders: (res) => {
        res.type(mimeType)
      },
    }))
    logger.debug(`Accepting GET on ${uri}`)

    uri = path.join(basePath, categoryPath, 'upload')
    app.post(uri, upload.single(category),
      function(req, res) {
        const imageID = path.basename(req.file.destination) + req.file.filename
        res.status(201).json({ image_id: imageID })
      })
    logger.debug(`Accepting POST on ${uri}`)

    uri = path.join(basePath, categoryPath, 'delete', ':image_id')
    app.delete(uri,
      async(req, res) => {
        try {
          const subdir = req.params.image_id.slice(0, 3)
          const fname = req.params.image_id.slice(3)
          const imgPath = path.join(storageRootDir, categoryPath, subdir, fname)
          await fs.unlink(imgPath)
          res.status(202).json()
        } catch (e) {
          logger.warn(`${e} (image id = ${req.params.image_id})`)
          res.status(404).json()
        }
      })
    logger.debug(`Accepting DELETE on ${uri}`)
  }
}

export function createStorageServerApp(config: Config) {
  try {
    const app = express()
    app.use(cors({
      allowedHeaders: 'Content-Type, uuid, uuidSignature',
    }))

    const backendFactories = {
      fs: imageProviderFSBackend(config.img_upload.iso_img_fs_path),
    }

    for (const category of Object.keys(config.img_upload.categories) as ImageCategory[]) {
      logger.debug(`Image category: ${category}`)
      const catSettings = config.img_upload.categories[category]
      for (const storageType of catSettings.storage_types) {
        const { type: mimeType, path: categoryPath } = catSettings
        logger.debug(`Storage type: ${storageType}. MIME type: ${mimeType}. Path: ${categoryPath}`)
        const backend = backendFactories[storageType]
        backend(app, category, mimeType, `/${storageType}/`, categoryPath)
      }
    }

    return app
  } catch (e) {
    logger.error(`${e.stack}`)
    throw e
  }
}

export async function createStorageServerAsync(config: Config) {
  const app = createStorageServerApp(config)

  const httpServer = http.createServer(app)
  await new Promise((resolve, reject) => {
    httpServer.listen(config.img_storage_port).on('listening', resolve).on('error', reject)
  })

  app.use('/dataset_upload', datasetUploadMiddleware(httpServer))
  app.use('/database_upload', databaseUploadMiddleware(httpServer))
  app.use('/raw_opt_upload', opticalImageUploadMiddleware(httpServer))
  app.use('/optical_image_upload',
    uploadMiddleware('/optical_image_upload', config.upload.optical_images_prefix, httpServer))

  logger.info(`Storage server is listening on ${config.img_storage_port} port...`)
  return httpServer
}
