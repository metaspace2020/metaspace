from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.util import SMConfig, init_loggers

init_loggers(SMConfig.get_conf(True)['logs'])

from sm.engine.ds_config import DSConfig
from sm.engine.annotation_lithops.annotation_job import LocalAnnotationJob, ServerAnnotationJob
from sm.engine.annotation_lithops.io import load_cobj, load_cobjs

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

#%%
SMConfig.get_conf(True)
job = LocalAnnotationJob(
    '/home/lachlan/Documents/datasets/Untreated_3_434.imzML',
    '/home/lachlan/Documents/datasets/Untreated_3_434.ibd',
    [6],
    ds_config,
)
storage = job.storage
pipe = job.pipe
# job.pipe.clean(True)
job.run(save=True, debug_validate=True)


#%%


#%%
SMConfig.get_conf(True)
job = ServerAnnotationJob(ImageStoreServiceWrapper(), Dataset.load(DB(), '2020-08-04_12h38m00s'))

#%%
job.run()

#%%


#%%
from lithops import function_executor

lithops_config = SMConfig.get_conf()['lithops']


def allocate_500mb():
    b = bytearray(500 * 1024 * 1024)
    for i in range(len(b)):
        b[i] = 1  # Touch the memory to ensure it's actually allocated


executor = function_executor(config=lithops_config, runtime_memory=128)

fs = executor.call_async(allocate_500mb, (), runtime_memory=1024)
executor.get_result(fs)

#%%
from time import sleep


def myfunc(i):
    sleep(5)
    if i == 1:
        raise Exception('oops')


executor = function_executor(config=lithops_config, workers=15)

fs = executor.map(myfunc, range(10))
executor.get_result(fs)

fs = executor.map(myfunc, range(10))
executor.get_result(fs)  # This never returns because invocations 2 & 3 are never started

#%%
