/**
 * Created by intsco on 1/10/17.
 */
const express = require('express'),
  multer = require('multer'),
  path = require('path'),
  fs = require('fs'),
  crypto = require('crypto');

const config = require('config'),
  {logger, pg} = require('./utils.js');

let storage = multer.memoryStorage();
let upload = multer({ storage: storage });

function addIsoImageProvider(app) {
  express.static.mime.default_type = "image/png";

  app.get(path.join(config.img_upload.img_base_path, ":img_id"),
    function (req, res) {
      pg.select(pg.raw('data'))
        .from('iso_image')
        .where('id', '=', req.params.img_id)
        .first()
        .then((row) => {
          let img_buf = row.data;
          res.type('image/png');
          res.end(img_buf, 'binary');
        })
        .catch((e) => {
          logger.error(e.message);
          res.send('Not found');
        });
    });
  
  app.post(path.join(config.img_upload.img_base_path, 'upload'), upload.single('iso_image'),
    function (req, res, next) {
      logger.debug(req.file);
      let img_id = crypto.randomBytes(16).toString('hex');

      let img_buf = req.file.buffer;
      pg.insert({'id': img_id, 'data': img_buf})
        .into('iso_image')
        .then((m) => {
          logger.debug(m);
          res.status(201).json({ image_id: img_id });
        })
        .catch((e) => {
          logger.error(e.message);
          res.status(500).json('Failed to store image');
        });
    });
  
  app.delete(path.join(config.img_upload.img_base_path, 'delete', ":img_id"), function (req, res, next) {
    const img_path = path.join(config.img_upload.iso_img_fs_path, config.img_upload.img_base_path, req.params.img_id);
    fs.unlink(img_path, function (err) {
      if (err)
        logger.warn(`${err} (image id = ${req.params.img_id})`);
    });
    res.status(200).json();
  });
}

module.exports = addIsoImageProvider;
