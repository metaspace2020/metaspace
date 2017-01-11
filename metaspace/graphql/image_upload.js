/**
 * Created by intsco on 1/10/17.
 */
const multer = require('multer');

let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/opt/data/iso_images')
  }
});
let upload = multer({ storage: storage });

function addUploader(app, uri, n=2) {
  app.post(uri, upload.array('iso_images', n), function (req, res, next) {
    for (file of req.files) {
      console.log(file);
    }
    res.status(204).end();
  });
}

module.exports = addUploader;