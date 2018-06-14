/**
 * Created by intsco on 5/18/17.
 */
process.env.NODE_ENV = 'test';

const {generateProcessingConfig} = require('../utils');

describe('Generate proper config given metadata', () => {
  it('should return config with multiple molecular databases', (done) => {
    let metadata = {
      'Submitted_By': {
        'Submitter': {
          'First_Name': 'Vitaly', 'Surname': 'Kovalev', 'Email': 'kovalev@embl.de'
        },
        'Principal_Investigator': {
          'First_Name': '', 'Surname': '', 'Email': ''
        },
        'Institution': 'EMBL'
      },
      'MS_Analysis': {
        'Polarity': 'Positive',
        'Ionisation_Source': 'MALDI',
        'Detector_Resolving_Power': {
          'Resolving_Power': 80000, 'mz': 700
        },
        'Analyzer': 'FTICR'
      }};
    
    let config = generateProcessingConfig({metadata: metadata, molDBs: ['HMDB-v2.5', 'HMDB-v4']});
    let expected = {
      'databases': [{'name': 'HMDB-v2.5'}, {'name': 'HMDB-v4'}],
      'image_generation': {
        'do_preprocessing': false,
        'nlevels': 30,
        'ppm': 3.0,
        'q': 99
      },
      'isotope_generation': {
        'adducts': ['+H', '+Na', '+K'],
        'charge': {'n_charges': 1, 'polarity': '+'},
        'isocalc_pts_per_mz': 8078,
        'isocalc_sigma': 0.000619
      }
    };
    
    expect(config).toMatchObject(expected);
  
    done();
  });
  
  it('should return config with a single molecular database', (done) => {
    let metadata = {
      'Submitted_By': {
        'Submitter': {
          'First_Name': 'Vitaly', 'Surname': 'Kovalev', 'Email': 'kovalev@embl.de'
        },
        'Principal_Investigator': {
          'First_Name': '', 'Surname': '', 'Email': ''
        },
        'Institution': 'EMBL'
      },
      'MS_Analysis': {
        'Polarity': 'Positive',
        'Ionisation_Source': 'MALDI',
        'Detector_Resolving_Power': {
          'Resolving_Power': 80000, 'mz': 700
        },
        'Analyzer': 'FTICR'
      }};
    
    let config = generateProcessingConfig({metadata: metadata, molDBs: ['HMDB-v4']});
    let expected = {
      'databases': [{'name': 'HMDB-v4'}],
      'image_generation': {
        'do_preprocessing': false,
        'nlevels': 30,
        'ppm': 3.0,
        'q': 99
      },
      'isotope_generation': {
        'adducts': ['+H', '+Na', '+K'],
        'charge': {'n_charges': 1, 'polarity': '+'},
        'isocalc_pts_per_mz': 8078,
        'isocalc_sigma': 0.000619
      }
    };
    
    expect(config).toMatchObject(expected);
    
    done();
  });

  // it('should return config with custom adducts', (done) => {
  //   let meta = {
  //     'Submitted_By': {
  //       'Submitter': {
  //         'First_Name': 'Vitaly', 'Surname': 'Kovalev', 'Email': 'kovalev@embl.de'
  //       },
  //       'Principal_Investigator': {
  //         'First_Name': '', 'Surname': '', 'Email': ''
  //       },
  //       'Institution': 'EMBL'
  //     },
  //     'MS_Analysis': {
  //       'Polarity': 'Positive',
  //       'Ionisation_Source': 'MALDI',
  //       'Detector_Resolving_Power': {
  //         'Resolving_Power': 80000, 'mz': 700
  //       },
  //       'Analyzer': 'FTICR'
  //     }};
  //
  //   let config = generateProcessingConfig(meta);
  //   let expected = {
  //     'databases': [{'name': 'HMDB'}],
  //     'image_generation': {
  //       'do_preprocessing': false,
  //       'nlevels': 30,
  //       'ppm': 3.0,
  //       'q': 99
  //     },
  //     'isotope_generation': {
  //       'adducts': ['+H', '+H-H2O'],
  //       'charge': {'n_charges': 1, 'polarity': '+'},
  //       'isocalc_pts_per_mz': 8078,
  //       'isocalc_sigma': 0.000619
  //     }
  //   };
  //
  //   expect(config).toMatchObject(expected);
  //
  //   done();
  // })
});