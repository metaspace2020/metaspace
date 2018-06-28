/**
 * Created by intsco on 5/10/17.
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  expect = chai.expect;

const  config = require('config'),
  logger = require('../utils').logger,
  {graphqlQuery, stripUrls} = require('./testingUtils'),
  {createHttpServerAsync} = require('../server');

describe('GraphQL integration: Annotation type', () => {
  let server;

  before((done) => {
    createHttpServerAsync(config).then((srv) => {
      server = srv;
      done();
    });
  });

  after((done) => {
    server.close(() => {
      logger.debug('HTTP Server closed');
      done();
    });
  });

  it('allAnnotations should return correct array', (done) => {
    const query = `{
      allAnnotations(
        filter: {
          database: "HMDB-v2.5",
          datasetName: "sci_test_spheroid_untreated",
          sumFormula: "C8H20NO6P",
          adduct: "+K"
        }
      ) {
        dataset {
          name
        },
        sumFormula,
        possibleCompounds {
           name,
           imageURL,
           information {
             database,
             url
           }
        },
        sumFormula,
        adduct,
        mz,
        fdrLevel,
        msmScore,
        rhoSpatial,
        rhoSpectral,
        rhoChaos
      }
    }`;
    
    const expected = {
      "dataset": {
        "name": "sci_test_spheroid_untreated"
      },
      "sumFormula": "C8H20NO6P",
      "possibleCompounds": [
        {
          "name": "Glycerophosphocholine",
          "imageURL": "/mol-images/HMDB/HMDB00086.svg",
          "information": [
            {
              "database": "HMDB-v2.5",
              "url": "/metabolites/HMDB00086"
            }
          ]
        }
      ],
      "adduct": "+K",
      "mz": 296.066,
      "fdrLevel": 0.05,
      "msmScore": 0.962633,
      "rhoSpatial": 0.967501,
      "rhoSpectral": 0.995748,
      "rhoChaos": 0.999216
    };
    
    return graphqlQuery(query)
      .then((resp) => {
        expect(resp.statusCode).to.equal(200);
        let annot = stripUrls(resp.body.data.allAnnotations[0]);
        expect(annot).to.have.deep.equal(expected);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });
  
  // TODO: a test for isotopeImages
  
  //TODO: a test for peakChartData
});