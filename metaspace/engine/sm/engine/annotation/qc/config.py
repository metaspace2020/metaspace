from copy import deepcopy
from typing import Any, Dict

DEFAULT_SAMPLE_SIZE = 300
NZ_PIXEL_LIMIT = 2000000
PIXEL_LIMIT = 4500000

DEFAULT_CHECKS: Dict[str, Dict[str, Any]] = {
    'peak_count': {'mode': 'shadow', 'warn_below': 50, 'fail_below': 10, 'high_tail': None},
    'declared_peak_count': {'mode': 'shadow', 'warn_below': 50, 'fail_below': 10},
    'empty_spectra': {'mode': 'shadow', 'max_fraction': 0.01},
    'profile_term': {'mode': 'shadow'},
    'zero_fraction': {'mode': 'shadow', 'warn_above': 0.05, 'fail_above': 0.20},
    'profile_likeness': {
        'mode': 'shadow',
        'fail_above': None,
        'gap_width_fraction': 0.5,
        'min_run_side': 3,
        'window_log_width': 0.02,
        'weights': {'a': 0.4, 'b': 0.25, 'c': 0.25, 'd': 0.1},
    },
    'mz_order': {'mode': 'shadow', 'duplicate_fraction_fail': None},
    'saturation': {'mode': 'shadow', 'fail_above': None},
    'intensity_transform': {'mode': 'shadow'},
    'array_validity': {'mode': 'shadow'},
    'sample_values': {'mode': 'shadow'},
    'low_occupancy': {
        'mode': 'shadow',
        'min_pixels': 3,
        'fail_above': None,
        'bin_ppm': None,
        'max_bins': 5_000_000,
    },
    'spatial_coherence': {
        'mode': 'shadow',
        'n_bins': 200,
        'min_pixels': 20,
        'moran_min': 0.1,
        'max_dense_cells': 20_000_000,
        'fail_above': None,
    },
    'noise_combined': {'mode': 'shadow', 'fail_above': None},
    'near_floor': {'mode': 'shadow', 'floor_multiple': 3.0, 'floor_percentile': 5},
    'tic': {
        'mode': 'shadow',
        'mask_fraction': 0.1,
        'hot_mad_k': 3.5,
        'cv_fail_above': None,
        'hot_fraction_fail_above': None,
    },
    'layout_dense_size': {
        'mode': 'shadow',
        'max_pixels': PIXEL_LIMIT,
        'max_spectra': NZ_PIXEL_LIMIT,
        'low_fill_warn': 0.05,
    },
    'layout_coordinates': {'mode': 'shadow'},
    'metadata_form': {'mode': 'shadow'},
    'ontology': {'mode': 'shadow'},
    'ibd_uuid': {'mode': 'shadow'},
    'declared_layout': {'mode': 'shadow'},
}


def load_qc_config(sm_config: Dict[str, Any]) -> Dict[str, Any]:
    user = (sm_config or {}).get('pre_annotation_qc') or {}
    checks = deepcopy(DEFAULT_CHECKS)
    for name, overrides in (user.get('checks') or {}).items():
        checks.setdefault(name, {}).update(overrides)
    return {
        'enabled': bool(user.get('enabled', False)),
        'sample_size': int(user.get('sample_size', DEFAULT_SAMPLE_SIZE)),
        'checks': checks,
    }
