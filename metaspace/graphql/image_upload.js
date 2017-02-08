/**
 * Created by intsco on 1/10/17.
 */
const IMG_BASE_PATH = '/iso_images/',
  ISO_IMG_FS_PATH = '/opt/data/sm_data/public/';

const express = require('express'),
  multer = require('multer'),
  moment = require('moment');

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ISO_IMG_FS_PATH + 'iso_images')
  }
});
let upload = multer({ storage: storage });

function addIsoImageProvider(app, uri) {
  app.use(express.static(ISO_IMG_FS_PATH));
  
  app.post(uri, upload.single('iso_image'), function (req, res, next) {
    console.log(moment().format());
    console.log(req.file);
    let image_url = `http://${req.headers.host}${IMG_BASE_PATH}${req.file.filename}`;
    res.status(201).json({image_url: image_url});
  });
}

module.exports = addIsoImageProvider;