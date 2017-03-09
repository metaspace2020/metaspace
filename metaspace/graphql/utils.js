/*
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *                         LEGACY                        *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 *
 * FIXME: the proper way is to completely ditch config.json
 * and use only meta.json as the input to the engine.
 */

const RESOL_POWER_PARAMS = {
    '70K': {sigma: 0.00247585727028, fwhm: 0.00583019832869, pts_per_mz: 2019},
    '100K': {sigma: 0.0017331000892, fwhm: 0.00408113883008, pts_per_mz: 2885},
    '140K': {sigma: 0.00123792863514, fwhm: 0.00291509916435, pts_per_mz: 4039},
    '200K': {sigma: 0.000866550044598, fwhm: 0.00204056941504, pts_per_mz: 5770},
    '250K': {sigma: 0.000693240035678, fwhm: 0.00163245553203, pts_per_mz: 7212},
    '280K': {sigma: 0.00061896431757, fwhm: 0.00145754958217, pts_per_mz: 8078},
    '500K': {sigma: 0.000346620017839, fwhm: 0.000816227766017, pts_per_mz: 14425},
    '750K': {sigma: 0.000231080011893, fwhm: 0.000544151844011, pts_per_mz: 21637},
    '1000K': {sigma: 0.00017331000892, fwhm: 0.000408113883008, pts_per_mz: 28850},
};

function generateProcessingConfig(meta_json) {
  const polarity_dict = {'Positive': '+', 'Negative': '-'},
        polarity = polarity_dict[meta_json['MS_Analysis']['Polarity']],
        instrument = meta_json['MS_Analysis']['Analyzer'],
        rp = meta_json['MS_Analysis']['Detector_Resolving_Power'],
        rp_mz = parseFloat(rp['mz']),
        rp_resolution = parseFloat(rp['Resolving_Power']);

  let rp200, params;

  if (instrument == 'FTICR')
    rp200 = rp_resolution * rp_mz / 200.0;
  else if (instrument == 'Orbitrap')
    rp200 = rp_resolution * Math.pow(rp_mz / 200.0,  0.5);
  else
    rp200 = rp_resolution;

  if (rp200 < 85000)       params = RESOL_POWER_PARAMS['70K'];
  else if (rp200 < 120000) params = RESOL_POWER_PARAMS['100K'];
  else if (rp200 < 195000) params = RESOL_POWER_PARAMS['140K'];
  else if (rp200 < 265000) params = RESOL_POWER_PARAMS['250K'];
  else if (rp200 < 390000) params = RESOL_POWER_PARAMS['280K'];
  else if (rp200 < 625000) params = RESOL_POWER_PARAMS['500K'];
  else if (rp200 < 875000) params = RESOL_POWER_PARAMS['750K'];
  else params = RESOL_POWER_PARAMS['1000K'];

  return {
    "databases": [{
      "name": meta_json['metaspace_options']['Metabolite_Database']
    }],
    "isotope_generation": {
      "adducts": {'+': ['+H', '+K', '+Na'], '-': ['-H', '+Cl']}[polarity],
      "charge": {
        "polarity": polarity,
        "n_charges": 1
      },
      "isocalc_sigma": Number(params['sigma'].toFixed(6)),
      "isocalc_pts_per_mz": params['pts_per_mz']
    },
    "image_generation": {
      "ppm": 3.0,
      "nlevels": 30,
      "q": 99,
      "do_preprocessing": false
    }
  };
}

module.exports = {
  generateProcessingConfig
};
