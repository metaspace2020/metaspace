/**
 * Created by intsco on 5/10/17.
 */
process.env.NODE_ENV = 'test';

const chai = require('chai'),
  expect = chai.expect,
  jsondiffpatch = require('jsondiffpatch');

const server = require('../server'),
  config = require('config'),
  {graphqlQuery} = require('./testingUtils');

describe('GraphQL integration: Dataset type', () => {
  it('datasetByName should return correct document', (done) => {
    const query = `{
      datasetByName(name: "untreated_test") {
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
        configJson,
        metadataJson,
        status
      }
    }`;
  
    const expected = {
      'id': '2017-05-10',
      'name': 'untreated_test',
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
      'configJson': '{"image_generation":{"q":99,"do_preprocessing":false,"nlevels":30,"ppm":3},"isotope_generation":{"adducts":["+H","+K","+Na"],"charge":{"polarity":"+","n_charges":1},"isocalc_sigma":0.000619,"isocalc_pts_per_mz":8078},"databases":[{"name":"HMDB"}]}',
      'metadataJson': '{"Submitted_By":{"Submitter":{"First_Name":"Name","Surname":"Surname","Email":"name@embl.de"},"Principal_Investigator":{"First_Name":"","Surname":"","Email":""},"Institution":"EMBL"},"metaspace_options":{"Metabolite_Database":"HMDB","Dataset_Name":"untreated_test"},"Sample_Information":{"Organism":"Homo_sapiens_(Human)","Organism_Part":"Colon","Condition":"Imortalised_Cell_Line","Sample_Growth_Conditions":"Culture_3D"},"Additional_Information":{"Sample_Description_Freetext":"","Expected_Molecules_Freetext":"","Additional_Information_Freetext":"","Publication_DOI":"","Sample_Preparation_Freetext":""},"MS_Analysis":{"Polarity":"Positive","Ionisation_Source":"MALDI","Detector_Resolving_Power":{"Resolving_Power":80000,"mz":700},"Analyzer":"FTICR"},"Sample_Preparation":{"MALDI_Matrix":"2,5-dihydroxybenzoic_acid_(DHB)","MALDI_Matrix_Application":"Spray_Robot","Sample_Stabilisation":"Fresh_Frozen","Tissue_Modification":"none"}}',
      'status': 'FINISHED'
    };
    
    return graphqlQuery(query)
      .then((resp) => {
        expect(resp.statusCode).to.equal(200);
        expect(resp.body.data.datasetByName).to.have.deep.equal(expected);
        done();
      })
      .catch((err) => {
        const delta = jsondiffpatch.diff(err.actual, err.expected),
          diff = jsondiffpatch.formatters.jsonpatch.format(delta);
        console.log(diff);
        throw err;
      });
  });
  
});