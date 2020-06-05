import * as _ from 'lodash';

import {processingSettingsChanged} from './Mutation';
import {EngineDataset} from '../../engine/model';


describe('processingSettingsChanged', () => {
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
      "databases": [0]
    },
    ds = {
      config: dsConfig,
      metadata: metadata,
    } as EngineDataset;

  it('Reprocessing needed when database list changed', () => {
    const update = {
      databaseIds: [...(ds.config as any).databases, 1],
      metadata: ds.metadata,
    };

    const { newDB } = processingSettingsChanged(ds, update);

    expect(newDB).toBe(true);
  });

  it('Drop reprocessing needed when instrument settings changed', async () => {
    const update = {
      molDBs: (ds.config as any).databases,
      metadata: _.defaultsDeep({ MS_Analysis: { Detector_Resolving_Power: { mz: 100 }}}, ds.metadata),
    };

    const { procSettingsUpd } = processingSettingsChanged(ds, update);

    expect(procSettingsUpd).toBe(true);
  });

  it('Reprocessing not needed when just metadata changed', () => {
    const update = {
      metadata: _.defaultsDeep({
        Sample_Preparation: { MALDI_Matrix: 'New matrix' },
        MS_Analysis: { ionisationSource: 'DESI' },
        Sample_Information: { Organism: 'New organism' },
      }, ds.metadata),
      name: 'New DS name'
    };

    const { newDB, procSettingsUpd } = processingSettingsChanged(ds, update);

    expect(newDB).toBe(false);
    expect(procSettingsUpd).toBe(false);
  });
});
