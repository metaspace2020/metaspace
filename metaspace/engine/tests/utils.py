from copy import deepcopy
from dataclasses import asdict
from datetime import datetime

import pandas as pd

from sm.engine import molecular_db
from sm.engine.annotation.diagnostics import FdrDiagnosticBundle
from sm.engine.annotation.formula_validator import Metrics
from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB
from sm.engine.molecular_db import MolecularDB

TEST_METADATA = {
    "Data_Type": "Imaging MS",
    "MS_Analysis": {
        "Polarity": "Positive",
        "Ionisation_Source": "MALDI",
        "Detector_Resolving_Power": {"Resolving_Power": 80000, "mz": 700},
        "Analyzer": "FTICR",
        "Pixel_Size": {"Xaxis": 100, "Yaxis": 100},
    },
}

TEST_DS_CONFIG = {
    "image_generation": {"n_levels": 30, "ppm": 3, "min_px": 1, "compute_unused_metrics": False},
    "analysis_version": 1,
    "isotope_generation": {
        "adducts": ["+H", "+Na", "+K", "[M]+"],
        "charge": 1,
        "isocalc_sigma": 0.000619,
        "instrument": "FTICR",
        "n_peaks": 4,
        "neutral_losses": [],
        "chem_mods": [],
    },
    "fdr": {"decoy_sample_size": 20, "scoring_model": None},
    "database_ids": [0],
}


def create_test_molecular_db(
    name='HMDB',
    version='v4',
    group_id=None,
    created_dt=None,
    archived=False,
    **kwargs,
) -> MolecularDB:
    if not created_dt:
        created_dt = datetime.utcnow()

    (moldb_id,) = DB().insert_return(
        'INSERT INTO molecular_db (name, version, created_dt, group_id, archived) '
        'VALUES (%s, %s, %s, %s, %s) RETURNING id',
        rows=[(name, version, created_dt, group_id, archived)],
    )
    return molecular_db.find_by_id(moldb_id)


def create_test_ds(
    id='2000-01-01',
    name='ds_name',
    input_path='input_path',
    upload_dt=None,
    metadata=None,
    config=None,
    status=DatasetStatus.FINISHED,
    es=None,
):
    upload_dt = upload_dt or datetime.now()

    ds = Dataset(
        id=id,
        name=name,
        input_path=input_path,
        upload_dt=upload_dt or datetime.now(),
        metadata=metadata or deepcopy(TEST_METADATA),
        config=config or deepcopy(TEST_DS_CONFIG),
        status=status or DatasetStatus.QUEUED,
    )
    ds.save(DB(), es=es, allow_insert=True)
    return ds


def create_test_fdr_diagnostics_bundle() -> FdrDiagnosticBundle:
    return FdrDiagnosticBundle(
        decoy_sample_size=2,
        decoy_map_df=pd.DataFrame(
            {
                'formula': ['H2O', 'H2O', 'H2SO4', 'H2SO4'],
                'tm': ['+H', '+H', '+Na', '+Na'],
                'dm': ['+U', '+Pb', '+U', '+Pb'],
            }
        ),
        formula_map_df=pd.DataFrame(
            {
                'formula': ['H2O', 'H2O', 'H2O', 'H2O', 'H2SO4', 'H2SO4', 'H2SO4', 'H2SO4'],
                'modifier': ['+H', '+Na', '+U', '+Pb', '+H', '+Na', '+U', '+Pb'],
                'formula_i': [8, 9, 10, 11, 12, 11, 10, 9],
            }
        ),
        metrics_df=pd.DataFrame(
            [asdict(Metrics()) for i in [8, 9, 10]],
            index=pd.Index([8, 9, 10], name='formula_i'),
        ),
    )
