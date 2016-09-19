"""
Script for generating dataset config files based on chosen instrument and its settings
"""
from difflib import SequenceMatcher as SeqM
import numpy as np
import json
from pprint import pprint, pformat


ds_config = {
    "database": {
        "name": "HMDB"
    },
    "isotope_generation": {
        "adducts": ["+H", "+Na", "+K"],
        "charge": {
            "polarity": "+",
            "n_charges": 1
        },
        "isocalc_sigma": 0.01,
        "isocalc_pts_per_mz": 10000
    },
    "image_generation": {
        "ppm": 2.0,
        "nlevels": 30,
        "q": 99,
        "do_preprocessing": False
    }
}


instruments = {
    'FT-ICR': {
        'Solarix': ['100K', '250K', '500K']
    },
    'Orbitrap': {
        'QExactive (Plus)': ['70K', '140K', '280K']
    }
}


instrument_modes = {
    'neg': ['-H', '+Cl'],
    'pos': ['+H', '+Na', '+K']
}


mol_dbs = [
    'HMDB',
    'ChEBI'
]


resol_power_params = { # Resolving Power defined at m/z 200. Compromise values based on the average resolving power @m/z 500 of Orbitrap and FTICR instruments. #todo replace this with full instrument model
    '70K': {'sigma': 0.00247585727028, 'fwhm': 0.00583019832869, 'pts_per_mz': 2019},
    '100K': {'sigma': 0.0017331000892, 'fwhm': 0.00408113883008, 'pts_per_mz': 2885},
    '140K': {'sigma': 0.00123792863514, 'fwhm': 0.00291509916435, 'pts_per_mz': 4039},
    '200K': {'sigma': 0.000866550044598, 'fwhm': 0.00204056941504, 'pts_per_mz': 5770},
    '250K': {'sigma': 0.000693240035678, 'fwhm': 0.00163245553203, 'pts_per_mz': 7212},
    '280K': {'sigma': 0.00061896431757, 'fwhm': 0.00145754958217, 'pts_per_mz': 8078},
    '500K': {'sigma': 0.000346620017839, 'fwhm': 0.000816227766017, 'pts_per_mz': 14425},
    '750K': {'sigma': 0.000231080011893, 'fwhm': 0.000544151844011, 'pts_per_mz': 21637},
    '1000K': {'sigma': 0.00017331000892, 'fwhm': 0.000408113883008, 'pts_per_mz': 28850},
}


def get_best_match(input, options):
    if len(options) == 1:
        return options[0]
    match_opt_ind = np.argmax([SeqM(None, str(input), str(opt)).ratio() for opt in options])
    return options[match_opt_ind]


if __name__ == "__main__":
    instr_type = raw_input('Instrument type ({}): '.format('/'.join(instruments.keys())))
    instr_type = get_best_match(instr_type, instruments.keys())
    print 'Chosen instrument type "{}"'.format(instr_type)

    instr_model = raw_input('Instrument type ({}): '.format('/'.join(instruments[instr_type].keys())))
    instr_model = get_best_match(instr_model, instruments[instr_type].keys())
    print 'Chosen instrument model "{}"'.format(instr_model)

    resolv_power = raw_input('Resolving power @200: ({}): '.format('/'.join(instruments[instr_type][instr_model])))
    resolv_power = get_best_match(resolv_power, instruments[instr_type][instr_model])
    print 'Chosen resolving power @200 "{}"'.format(resolv_power)

    instr_mode = raw_input('Instrument mode ({}): '.format('/'.join(instrument_modes.keys())))
    instr_mode = get_best_match(instr_mode, instrument_modes.keys())
    print 'Chosen instrument mode "{}"'.format(instr_mode)
    print 'Adducts to be used "{}"'.format(instrument_modes[instr_mode])

    ppm = raw_input('ppm number (integer): ')
    print 'Chosen ppm number "{}"'.format(ppm)

    mol_db = raw_input('Molecule database to search through ({}): '.format('/'.join(mol_dbs)))
    mol_db = get_best_match(mol_db, mol_dbs)
    print 'Chosen molecule database "{}"'.format(mol_db)

    ds_config['isotope_generation']['adducts'] = instrument_modes[instr_mode]
    ds_config['isotope_generation']['charge']['polarity'] = '+' if instr_mode == 'pos' else '-'
    ds_config['isotope_generation']['isocalc_sigma'] = round(resol_power_params[resolv_power]['sigma'], 6)
    ds_config['isotope_generation']['isocalc_pts_per_mz'] = resol_power_params[resolv_power]['pts_per_mz']
    ds_config['image_generation']['ppm'] = int(ppm)
    ds_config['database']['name'] = mol_db

    print json.dumps(ds_config, indent=4)

    save = raw_input('Save to "config.json" file (Y/n)?: ')
    if save == 'Y':
        with open('config.json', 'w') as fp:
            fp.write(json.dumps(ds_config, indent=4))
        print 'Saved the dataset config to "config.json" file'
