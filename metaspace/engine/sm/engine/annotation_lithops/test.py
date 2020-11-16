from lithops.storage import Storage

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.dataset import Dataset
from sm.engine.db import DB
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.util import SMConfig, init_loggers
from sm.engine.utils.perf_profile import perf_profile, NullProfiler

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

config = SMConfig.get_conf(True)
executor = Executor(config['lithops'], NullProfiler())
storage = executor.storage

#%%
SMConfig.get_conf(True)
job = LocalAnnotationJob(
    '/home/lachlan/Documents/datasets/Untreated_3_434.imzML',
    '/home/lachlan/Documents/datasets/Untreated_3_434.ibd',
    [22],
    ds_config,
)
pipe = job.pipe
# job.pipe.clean(True)
job.run(save=False, debug_validate=False)


#%%


#%%
config = SMConfig.get_conf(True)
ds_id = '2020-08-04_12h38m00s'
with perf_profile(DB(), 'annotate_lithops', ds_id) as perf:
    executor = Executor(config['lithops'], perf)
    job = ServerAnnotationJob(
        executor, ImageStoreServiceWrapper(), Dataset.load(DB(), '2020-08-04_12h38m00s'), perf
    )
    job.run()


#%%


#%%
from lithops import function_executor

lithops_config = SMConfig.get_conf()['lithops']


def allocate_gbs(n):
    bs = []
    for i in range(n):
        b = bytearray(1024 * 1024 * 1024)
        for i in range(0, len(b), 4096):
            b[i] = 1  # Touch the memory to ensure it's actually allocated
        bs.append(b)


# executor = function_executor(config=lithops_config, runtime_memory=128)

fs = executor.map(allocate_gbs, [(10,) for i in range(3)], runtime_memory=32768)
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

from lithops import function_executor

lithops_config = SMConfig.get_conf(True)['lithops']
# lithops_config['ibm_cos']['password'] = "foo'"
executor = function_executor(config=lithops_config, type='standalone')


def return_storage_config(storage):
    return storage.storage_config


fs = executor.call_async(return_storage_config, ())
executor.get_result([fs])


#%%
