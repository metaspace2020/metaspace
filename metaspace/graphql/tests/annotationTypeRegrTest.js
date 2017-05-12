/**
 * Created by intsco on 5/10/17.
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  expect = chai.expect;

const server = require('../server'),
  config = require('config'),
  {graphqlQuery, stripUrls} = require('./utils');

describe('GraphQL integration: Annotation type', () => {
  it('allAnnotations should return correct array', (done) => {
    const query = `{
      allAnnotations(
        filter: {
          datasetName: "untreated_test",
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
        "name": "untreated_test"
      },
      "sumFormula": "C8H20NO6P",
      "possibleCompounds": [
        {
          "name": "Glycerophosphocholine",
          "imageURL": "/mol-images/HMDB/HMDB00086.svg",
          "information": [
            {
              "database": "HMDB",
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
        throw err;
      });
  });
  
  // TODO: a test for isotopeImages
  
  //TODO: a test for peakChartData
});