"""
Script for generating dataset config files based on chosen instrument profiles
"""
import argparse
from difflib import SequenceMatcher as seqm
import numpy as np


ds_config_templ = {
    "inputs": {
        "database": "HMDB"
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
    },
    "molecules_num": 'null'
}


instruments = {
    'FT-ICR': {
        'Solarix': ['100K', '250K', '500K']
    },
    'Orbitrap': {
        'QExactive (Plus)': ['70K', '140K', '280K']
    }
}


resolv_power_params = {
    '70K': {
        'fwhm': 0.00285714285,
        'sigma': 0.006728,
        'pts_per_mz': 1750
    }
}


def get_best_match(input, options):
    if len(options) == 1:
        return options[0]
    match_opt_ind = np.argmax([seqm(str(input), str(opt)).ratio() for opt in options])
    return options[match_opt_ind]


if __name__ == "__main__":
    instr_type = raw_input('Instrument type ({}): '.format('/'.join(instruments.keys())))
    instr_type = get_best_match(instr_type, instruments.keys())
    print 'Chosen instrument type "{}"'.format(instr_type)

    instr_model = raw_input('Instrument type ({}): '.format('/'.join(instruments[instr_type].keys())))
    instr_type = get_best_match(instr_model, instruments[instr_type])
    print 'Chosen instrument model "{}"'.format(instr_model)

    res_power_opts = map(str, instruments[instr_type][instr_model])
    resolv_power = raw_input('Resolving power @200: ({}): '.format('/'.join(res_power_opts)))
    resolv_power = get_best_match(resolv_power, instruments[instr_type][instr_model])
    print 'Chosen resolving power @200 "{}"'.format(resolv_power)

    ds_config_templ['isotope_generation']['isocalc_sigma'] = resolv_power_params[resolv_power]['sigma']
    ds_config_templ['isotope_generation']['isocalc_pts_per_mz'] = resolv_power_params[resolv_power]['pts_per_mz']

    from pprint import pprint
    pprint(ds_config_templ)
