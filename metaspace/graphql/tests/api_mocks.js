const express = require('express'),
      cors = require('cors'),
      url = require('url'),
      config = require('config');

function molecularImageServer(port) {
  let app = express();
  app.get('/mol-images/:database/:id.svg', function (req, res) {
    res.header("Content-Type", "image/svg+xml");
    res.send('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" ' +
             'width="100" height="100"><g>' +
             '<rect fill="#fff" stroke="#000" stroke-width="2" ' +
             'x="5" y="5" width="90" height="90"/></g></svg>');
  });
  app.listen(port);
  return app;
}

function molecularDatabaseService(port) {
  const result = {
    data: {
      mz_grid: {min_mz: 419.9, max_mz: 423.1},
      theor: {
        centroid_mzs: [420, 421, 422, 423],
        mzs: [419.9, 420, 420.1, 420.9, 421, 421.1,
              421.9, 422, 422.1, 422.9, 423, 423.1],
        ints: [0, 100, 0, 0, 10, 0, 0, 1, 0, 0, 0.1, 0]
      }
    },
    meta: {
      message: 'OK',
      code: 200
    }
  };

  const databases = {
    data: [{name: config.defaults.moldb_name}],
    meta: { message: 'OK', code: 200 }
  };

  let app = express();
  app.get('/v1/isotopic_pattern/:sf_adduct/:instrument/:rp/:at_mz/:polarity',
          function (req, res) { res.json(result); });
  app.get('/v1/databases', function (req, res) { res.json(databases); });
  app.listen(port);
  return app;
}

function engineRestService(port) {
  let app = express();
  app.use(cors());

  app.post('/datasets/add', function (req, res) {
    res.send('success') ;
  });

  app.post('/datasets/:id/update', function (req, res) {
    res.send('success');
  });

  app.post('/datasets/:id/delete', function (req, res) {
    res.send('success');
  });

  app.listen(port);
  return app;
}

function mockServices() {
  molecularDatabaseService(5000);
  molecularImageServer(5100);
  engineRestService(5123);
}

mockServices();
