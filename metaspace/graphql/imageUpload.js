/**
 * Created by intsco on 1/10/17.
 */
const config = require('./config'),
  path = require('path'),
  fs = require('fs');

const express = require('express'),
  multer = require('multer'),
  moment = require('moment');

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(config.img_upload.iso_img_fs_path, config.img_upload.img_base_path))
  }
});
let upload = multer({ storage });

function addIsoImageProvider(app, base_uri) {
  app.use(express.static(base_uri));
  
  app.post(path.join(base_uri, 'upload'), upload.single('iso_image'), function (req, res, next) {
    console.log(moment().format());
    console.log(req.file);
    let image_url = `http://${req.headers.host}${config.img_upload.img_base_path}${req.file.filename}`;
    res.status(201).json({ image_url });
  });
  
  app.delete(path.join(base_uri, 'delete', ":img_id"), function (req, res, next) {
    const img_path = path.join(config.img_upload.iso_img_fs_path, config.img_upload.img_base_path, req.params.img_id);
    fs.unlink(img_path, function (err) {
      if (err)
        console.info(`${moment().format()} Error ${err} while deleting image with id = ${req.params.img_id}`);
      else
        console.log(`${moment().format()} Image with id = ${req.params.img_id} deleted`);
    });
    res.status(200).json();
  });
}

module.exports = addIsoImageProvider;
