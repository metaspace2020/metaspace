from copy import deepcopy
from datetime import datetime

from sm.engine.dataset import Dataset, DatasetStatus
from sm.engine.db import DB
from sm.engine import molecular_db
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
    "image_generation": {"n_levels": 30, "ppm": 3, "min_px": 1},
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
    "fdr": {"decoy_sample_size": 20},
    "database_ids": [0],
}


def create_test_molecular_db(
    name='HMDB', version='v4', group_id=None, created_dt=None, archived=False, **kwargs,
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
