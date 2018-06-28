process.env.NODE_ENV = 'test';

const {UserError} = require('graphql-errors'),
  config = require('config');

const {reprocessingNeeded} = require('../dsMutation'),
  {addProcessingConfig} = require('../utils');

const metadata = {
  "MS_Analysis": {
    "Analyzer": "FTICR",
    "Polarity": "Positive",
    "Ionisation_Source": "MALDI",
    "Detector_Resolving_Power": {
      "mz": 400,
      "Resolving_Power": 140000
    }
  },
  "Submitted_By": {
    "Submitter": {
      "Email": "user@example.com",
      "Surname": "Surname",
      "First_Name": "Name"
    },
    "Institution": "Genentech",
    "Principal_Investigator": {
      "Email": "pi@example.com",
      "Surname": "Surname",
      "First_Name": "Name"
    }
  },
  "Sample_Information": {
    "Organism": "Mus musculus (mouse)",
    "Condition": "Dosed vs. vehicle",
    "Organism_Part": "EMT6 Tumors",
    "Sample_Growth_Conditions": "NA"
  },
  "Sample_Preparation": {
    "MALDI_Matrix": "2,5-dihydroxybenzoic acid (DHB)",
    "Tissue_Modification": "N/A",
    "Sample_Stabilisation": "Fresh frozen",
    "MALDI_Matrix_Application": "TM sprayer"
  },
  "Additional_Information": {
    "Publication_DOI": "NA",
    "Expected_Molecules_Freetext": "tryptophan pathway",
    "Sample_Preparation_Freetext": "NA",
    "Additional_Information_Freetext": "NA"
  }
},
  dsConfig = {
    "image_generation": {
      "q": 99,
      "do_preprocessing": false,
      "nlevels": 30,
      "ppm": 3
    },
    "isotope_generation": {
      "adducts": ["+H", "+Na", "+K"],
      "charge": {
        "polarity": "+",
        "n_charges": 1
      },
      "isocalc_sigma": 0.000619,
      "isocalc_pts_per_mz": 8078
    },
    "databases": config.defaults.moldb_names
  },
  ds = {
    config: dsConfig,
    metadata: metadata,
    molDBs: config.defaults.moldb_names
  };

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('Reprocessing needed when database list changed', () => {
  const updDS = clone(ds);
  updDS.molDBs.push('ChEBI');
  addProcessingConfig(updDS);

  try {
    reprocessingNeeded(ds, updDS);
    throw(new Error());
  }
  catch (e) {
    expect(e.message).not.toBe('');
    const msg = JSON.parse(e.message);
    expect(msg['type']).toBe('submit_needed');
  }
});

test('Drop reprocessing needed when instrument settings changed', () => {
  const updDS = clone(ds);
  updDS.metadata.MS_Analysis.Detector_Resolving_Power.mz = 100;
  addProcessingConfig(updDS);

  try {
    reprocessingNeeded(ds, updDS);
    throw(new Error());
  }
  catch (e) {
    expect(e.message).not.toBe('');
    const msg = JSON.parse(e.message);
    expect(msg['type']).toBe('drop_submit_needed');
  }
});

test('Reprocessing not needed when just metadata changed', () => {
  const updDS = clone(ds);
  updDS.metadata.Sample_Preparation.MALDI_Matrix = 'New matrix';
  updDS.metadata.MS_Analysis.ionisationSource = 'DESI';
  updDS.metadata.Sample_Information.Organism = 'New organism';
  updDS.name = 'New DS name';
  addProcessingConfig(ds, updDS);

  reprocessingNeeded(ds, updDS);
});
