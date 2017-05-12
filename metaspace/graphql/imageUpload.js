/**
 * Created by intsco on 1/10/17.
 */
const express = require('express'),
  multer = require('multer'),
  path = require('path'),
  fs = require('fs');

const config = require('config'),
  logger = require('./utils.js').logger;

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(config.img_upload.iso_img_fs_path, config.img_upload.img_base_path))
  }
});
let upload = multer({ storage });

function addIsoImageProvider(app) {
  express.static.mime.default_type = "image/png";
  app.use(express.static(config.img_upload.iso_img_fs_path));
  
  app.post(path.join(config.img_upload.img_base_path, 'upload'), upload.single('iso_image'),
    function (req, res, next) {
      logger.debug(req.file);
      let image_url = `http://${config.img_upload.host}${config.img_upload.img_base_path}${req.file.filename}`;
      res.status(201).json({ image_url });
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
