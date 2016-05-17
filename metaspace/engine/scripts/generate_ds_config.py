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
    'HMDB'
    'ChEBI'
]


resol_power_params = {
    '70K': {
        'fwhm': 0.00285714285,
        'sigma': 0.006728,
        'pts_per_mz': 1750
    },
    '100K': {
        'fwhm': 0.002,
        'sigma': 0.0047096,
        'pts_per_mz': 2500
    },
    '140K': {
        'fwhm': 0.00142857142,
        'sigma': 0.003364,
        'pts_per_mz': 3500
    },
    '250K': {
        'fwhm': 0.0008,
        'sigma': 0.00188384,
        'pts_per_mz': 6250
    },
    '280K': {
        'fwhm': 0.00071428571,
        'sigma': 0.001682,
        'pts_per_mz': 7000
    },
    '500K': {
        'fwhm': 0.0004,
        'sigma': 0.00094192,
        'pts_per_mz': 12500
    }
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
