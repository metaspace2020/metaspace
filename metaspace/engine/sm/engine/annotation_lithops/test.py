from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.util import SMConfig, init_loggers

init_loggers(SMConfig.get_conf(True)['logs'])

from sm.engine.ds_config import DSConfig
from sm.engine.annotation_lithops.annotation_job import LocalAnnotationJob, ServerAnnotationJob

ds_config: DSConfig = {
    "database_ids": [22],
    "analysis_version": 1,
    "isotope_generation": {
        "adducts": ["+H", "+Na", "+K"],
        "charge": 1,
        "isocalc_sigma": 0.001238,
        "instrument": "Orbitrap",
        "n_peaks": 4,
        "neutral_losses": ["-H2O"],
        "chem_mods": ["-CO2+CO"],
    },
    "fdr": {"decoy_sample_size": 20},
    "image_generation": {"ppm": 3, "n_levels": 30, "min_px": 1},
}


SMConfig.get_conf(True)
job = LocalAnnotationJob(
    '/home/lachlan/Documents/datasets/Untreated_3_434.imzML',
    '/home/lachlan/Documents/datasets/Untreated_3_434.ibd',
    [22],
    ds_config,
)
job.run()

#%%


#%%
SMConfig.get_conf(True)
job = ServerAnnotationJob(ImageStoreServiceWrapper(), Dataset.load(DB(), '2020-08-04_12h38m00s'))

#%%
job.run()

#%%
