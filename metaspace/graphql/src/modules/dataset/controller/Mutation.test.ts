import config from '../../../utils/config';
import * as _ from 'lodash';

import {processingSettingsChanged} from './Mutation';
import {EngineDS} from '../../../utils/knexDb';

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
  } as EngineDS;

function clone(obj: any) {
  return JSON.parse(JSON.stringify(obj));
}

describe('processingSettingsChanged', () => {
  test('Reprocessing needed when database list changed', () => {
    const updDS = clone(ds);
    updDS.molDBs.push('ChEBI');

    const {newDB} = processingSettingsChanged(ds, updDS);

    expect(newDB).toBe(true);
  });

  test('Drop reprocessing needed when instrument settings changed', () => {
    const updDS = clone(ds);
    updDS.metadata.MS_Analysis.Detector_Resolving_Power.mz = 100;

    const {procSettingsUpd} = processingSettingsChanged(ds, updDS);

    expect(procSettingsUpd).toBe(true);
  });

  test('Reprocessing not needed when just metadata changed', () => {
    const updDS = {
      metadata: _.defaultsDeep({
        Sample_Preparation: { MALDI_Matrix: 'New matrix' },
        MS_Analysis: { ionisationSource: 'DESI' },
        Sample_Information: { Organism: 'New organism' },
      }, ds.metadata),
      name: 'New DS name'
    };

    const {newDB, procSettingsUpd} = processingSettingsChanged(ds, updDS);

    expect(newDB).toBe(false);
    expect(procSettingsUpd).toBe(false);
  });
});
