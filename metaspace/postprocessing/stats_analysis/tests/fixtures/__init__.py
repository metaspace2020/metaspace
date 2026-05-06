"""Build a deterministic ``prep`` block + payload for runner tests."""
from typing import Dict, List


def make_prep_block() -> Dict:
    """Two conditions x 2 regions per condition under one label group.

    Sufficient n per arm so Wilcoxon / Welch can produce real p-values.
    """
    intensities = {
        'r-ctrl-1': {1: 100.0, 2:  5.0, 3: 50.0},
        'r-ctrl-2': {1:  90.0, 2:  6.0, 3: 48.0},
        'r-tum-1':  {1:  10.0, 2: 80.0, 3: 52.0},
        'r-tum-2':  {1:  12.0, 2: 78.0, 3: 49.0},
    }
    samples: List[Dict] = [
        {
            'regionKey': 'r-ctrl-1', 'sampleId': 's1', 'datasetId': 'ds-1',
            'labelGroupName': 'auto_1', 'condition': 'control',
            'biologicalReplicateId': 'mouse_1',
            'tic': sum(intensities['r-ctrl-1'].values()),
        },
        {
            'regionKey': 'r-ctrl-2', 'sampleId': 's2', 'datasetId': 'ds-1',
            'labelGroupName': 'auto_1', 'condition': 'control',
            'biologicalReplicateId': 'mouse_2',
            'tic': sum(intensities['r-ctrl-2'].values()),
        },
        {
            'regionKey': 'r-tum-1', 'sampleId': 's3', 'datasetId': 'ds-2',
            'labelGroupName': 'auto_1', 'condition': 'tumor',
            'biologicalReplicateId': 'mouse_3',
            'tic': sum(intensities['r-tum-1'].values()),
        },
        {
            'regionKey': 'r-tum-2', 'sampleId': 's4', 'datasetId': 'ds-2',
            'labelGroupName': 'auto_1', 'condition': 'tumor',
            'biologicalReplicateId': 'mouse_4',
            'tic': sum(intensities['r-tum-2'].values()),
        },
    ]
    filter_chain = [
        {'name': 'All annotated ions', 'count': 5, 'droppedFromPrev': 0},
        {'name': '+FDR <= 0.1',        'count': 3, 'droppedFromPrev': 2},
    ]
    all_ions = [
        {'ion_id': 1, 'fdr': 0.05, 'adduct': '+H',  'moldb_id': 9, 'moldb_name': 'HMDB'},
        {'ion_id': 2, 'fdr': 0.05, 'adduct': '+Na', 'moldb_id': 9, 'moldb_name': 'HMDB'},
        {'ion_id': 3, 'fdr': 0.20, 'adduct': '+H',  'moldb_id': 9, 'moldb_name': 'HMDB'},
        {'ion_id': 4, 'fdr': 0.30, 'adduct': '-H',  'moldb_id': 10, 'moldb_name': 'LipidMaps'},
        {'ion_id': 5, 'fdr': 0.50, 'adduct': '+K',  'moldb_id': 10, 'moldb_name': 'LipidMaps'},
    ]
    return {
        'samples': samples,
        'intensities': intensities,
        'ions_total': 3,
        'filterChain': filter_chain,
        'all_ions': all_ions,
    }


def build_payload(samples_def: List[Dict], n_ions: int = 3) -> Dict:
    """Build a payload from a list of region defs.

    Each entry in ``samples_def`` is::

        {
          'regionKey': str, 'sampleId': str, 'datasetId': str,
          'labelGroupName': str, 'condition': str,
          'biologicalReplicateId': Optional[str],
          'technicalReplicateId': Optional[str],
          'intensities': Dict[int, float],   # ion_id -> value
        }
    """
    intensities = {s['regionKey']: dict(s['intensities']) for s in samples_def}
    samples = []
    for s in samples_def:
        samples.append({
            'regionKey': s['regionKey'],
            'sampleId': s['sampleId'],
            'datasetId': s.get('datasetId', 'ds-1'),
            'labelGroupName': s.get('labelGroupName', 'auto_1'),
            'condition': s['condition'],
            'biologicalReplicateId': s.get('biologicalReplicateId'),
            'technicalReplicateId': s.get('technicalReplicateId'),
            'tic': sum(s['intensities'].values()),
        })
    all_ions = [
        {'ion_id': i, 'fdr': 0.05, 'adduct': '+H', 'moldb_id': 9, 'moldb_name': 'HMDB'}
        for i in range(1, n_ions + 1)
    ]
    return {
        'prep': {
            'samples': samples,
            'intensities': intensities,
            'ions_total': n_ions,
            'filterChain': [
                {'name': 'All annotated ions', 'count': n_ions, 'droppedFromPrev': 0},
            ],
            'all_ions': all_ions,
        },
        'label_groups': [{'name': 'auto_1', 'color': '#1f77b4'}],
        'filters': {},
        'datasets': [],
        'excluded_samples': [],
    }


def make_payload() -> Dict:
    return {
        'prep': make_prep_block(),
        'label_groups': [{'name': 'auto_1', 'color': '#1f77b4'}],
        'filters': {'fdr': 0.10},
        'datasets': [],
        'excluded_samples': [],
    }
