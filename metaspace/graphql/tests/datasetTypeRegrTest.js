/**
 * Created by intsco on 5/10/17.
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  expect = chai.expect,
  jsondiffpatch = require('jsondiffpatch');

const config = require('config'),
  {graphqlQuery} = require('./testingUtils'),
  {createHttpServerAsync} = require('../server');

describe('GraphQL integration: Dataset type', () => {
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

  it('allDatasets with name filter should return correct document', (done) => {
    const query = `{
      allDatasets(filter: {name: "sci_test_spheroid_untreated"}) {
        id,
        name,
        institution,
        submitter { name, surname, email },
        principalInvestigator { name, surname, email },
        polarity,
        ionisationSource,
        analyzer { type, resolvingPower(mz:200) },
        organism,
        organismPart,
        condition,
        maldiMatrix,
        status
      }
    }`;
  
    const expected = [{
      'id': '2000-01-01-00_00_00',
      'name': 'sci_test_spheroid_untreated',
      'institution': 'EMBL',
      'submitter': {
        'name': 'Name',
        'surname': 'Surname',
        'email': 'name@embl.de'
      },
      'principalInvestigator': {
        'name': '',
        'surname': '',
        'email': ''
      },
      'polarity': 'POSITIVE',
      'ionisationSource': 'MALDI',
      'analyzer': {
        'type': 'FTICR',
        'resolvingPower': 280000
      },
      'organism': 'Homo_sapiens_(Human)',
      'organismPart': 'Colon',
      'condition': 'Imortalised_Cell_Line',
      'maldiMatrix': '2,5-dihydroxybenzoic_acid_(DHB)',
      'status': 'FINISHED'
    }];
    
    return graphqlQuery(query)
      .then((resp) => {
        expect(resp.statusCode).to.equal(200);
        expect(resp.body.data.allDatasets).to.have.deep.equal(expected);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('allDatasets with name filter should return correct config and metadata', (done) => {
    const query = `{
      allDatasets(filter: {name: "sci_test_spheroid_untreated"}) {
        configJson
        metadataJson
      }
    }`;

    const expectedConfig = {"image_generation":{"q":99,"do_preprocessing":false,"nlevels":30,"ppm":3},"isotope_generation":{"adducts":["+H","+K","+Na"],"charge":{"polarity":"+","n_charges":1},"isocalc_sigma":0.000619,"isocalc_pts_per_mz":8078},"databases":[{"name": "HMDB-v2.5"}]},
      expectedMetadata = {"Submitted_By":{"Submitter":{"First_Name":"Name","Surname":"Surname","Email":"name@embl.de"},"Principal_Investigator":{"First_Name":"","Surname":"","Email":""},"Institution":"EMBL"},"metaspace_options":{"Metabolite_Database": ["HMDB-v2.5"],"Dataset_Name":"untreated_test"},"Sample_Information":{"Organism":"Homo_sapiens_(Human)","Organism_Part":"Colon","Condition":"Imortalised_Cell_Line","Sample_Growth_Conditions":"Culture_3D"},"Additional_Information":{"Sample_Description_Freetext":"","Expected_Molecules_Freetext":"","Additional_Information_Freetext":"","Publication_DOI":"","Sample_Preparation_Freetext":""},"MS_Analysis":{"Polarity":"Positive","Ionisation_Source":"MALDI","Detector_Resolving_Power":{"Resolving_Power":80000,"mz":700},"Analyzer":"FTICR"},"Sample_Preparation":{"MALDI_Matrix":"2,5-dihydroxybenzoic_acid_(DHB)","MALDI_Matrix_Application":"Spray_Robot","Sample_Stabilisation":"Fresh_Frozen","Tissue_Modification":"none"}};

    return graphqlQuery(query)
      .then((resp) => {
        expect(resp.statusCode).to.equal(200);
        let doc = resp.body.data.allDatasets[0];
        expect(JSON.parse(doc.configJson)).to.have.deep.equal(expectedConfig);
        expect(JSON.parse(doc.metadataJson)).to.have.deep.equal(expectedMetadata);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

});