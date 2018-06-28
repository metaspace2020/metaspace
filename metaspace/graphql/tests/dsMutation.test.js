const {UserError} = require('graphql-errors'),
  config = require('config');

const {reprocessingNeeded} = require('../dsMutation');

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
  "metaspace_options": {
    "Dataset_Name": "dataset name",
    "Metabolite_Database": config.defaults.moldb_names
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
      "adducts": ["+H", "+K", "+Na"],
      "charge": {
        "polarity": "+",
        "n_charges": 1
      },
      "isocalc_sigma": 0.000619,
      "isocalc_pts_per_mz": 8078
    },
    "databases": config.defaults.moldb_names.map(function(moldb_name) {return {name: moldb_name}})
  },
  ds = {
    config: dsConfig,
    metadata: metadata
  };

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('Reprocessing needed when database list changed', () => {
  const newMetadata = clone(metadata);
  newMetadata.metaspace_options.Metabolite_Database += ['ChEBI'];

  try {
    reprocessingNeeded(ds, newMetadata);
    throw(new Error());
  }
  catch (e) {
    expect(e.message).not.toBe(undefined);
    const msg = JSON.parse(e.message);
    expect(msg['type']).toBe('submit_needed');
  }

});

test('Drop reprocessing needed when instrument settings changed', () => {
  const newMetadata = clone(metadata);
  newMetadata.MS_Analysis.Detector_Resolving_Power.mz = 100;

  try {
    reprocessingNeeded(ds, newMetadata);
    throw(new Error());
  }
  catch (e) {
    expect(e.message).not.toBe(undefined);
    const msg = JSON.parse(e.message);
    expect(msg['type']).toBe('drop_submit_needed');
  }

});

test('Reprocessing not needed when just metadata changed', () => {
  const newMetadata = clone(metadata);
  newMetadata.metaspace_options.Dataset_Name = 'New dataset name';
  newMetadata.Sample_Preparation.MALDI_Matrix = 'New matrix';
  newMetadata.MS_Analysis.ionisationSource = 'DESI';
  newMetadata.Sample_Information.Organism = 'New organism';

  reprocessingNeeded(ds, newMetadata);
});