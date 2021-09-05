from sm.engine.config import SMConfig
from sm.engine.annotation_lithops.annotation_job import LocalAnnotationJob

ds_config = {
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

sm_config = {
    "lithops": {
        "lithops": {
            "storage_bucket": "metaspace-env-staging-temp",
            "storage": "ibm_cos",
            "mode": "serverless",
            "include_modules": ["engine/sm"],
            "data_cleaner": True,
            "data_limit": False,
            "workers": 100,
            "execution_timeout": 2400
        },
        "serverless": {
            "backend": "ibm_cf",
            "runtime_timeout": 1200,
            "runtime_memory": 2048
        },
        "standalone": {
            "backend": "ibm_vpc",
            "soft_dismantle_timeout": 30
        },
        "localhost": {
        },
        "ibm": {
            "iam_api_key": "lkvjorAXrXqpyv019uTQez_CElflghcDUFSEjCeDrGs7"
        },
        "ibm_cf": {
            "endpoint": "https://eu-de.functions.cloud.ibm.com",
            "namespace": "env-staging",
            "namespace_id": "aba593ae-d3b4-4785-8388-e819f38595e6",
            "runtime_timeout": 600
        },
        "code_engine": {
            "region": "eu-de",
            "kubecfg_path": "/home/finve/.bluemix/plugins/code-engine/metaspace-staging-ce-56d11f60-a685-4a3b-b053-ff3f5d8cf249.yaml",
            "runtime": ""
        },
        "ibm_vpc": {
            "endpoint": "https://eu-de.iaas.cloud.ibm.com",
            "instance_id": "02c7_01cfee48-1cfb-4c05-b6c2-51ab8826f363",
            "ip_address": "161.156.169.205",
            "ssh_key_filename": "/home/ubuntu/.ssh/ibm_cloud_vpc"
        },
        "ibm_cos": {
            "region": "eu-de",
            "access_key": "b445ebcc73114a7d949072184b271a5a",
            "secret_key": "c52b15e203a64ba6ed3e2abad814ea94f0a38af7c43c3797"
        },
        "sm_storage": {
            "imzml": ["metaspace-env-staging-imzml", "imzml"],
            "moldb": ["metaspace-env-staging-centroids", "moldb"],
            "centroids": ["metaspace-env-staging-centroids", "centroids"],
            "pipeline_cache": ["metaspace-env-staging-temp", "pipeline_cache"]
        }
    }
}

job = LocalAnnotationJob(
    '/home/finve/Documents/embl_code/datasets/untreated_3_334/Untreated_3_434.imzML',
    '/home/finve/Documents/embl_code/datasets/untreated_3_334/Untreated_3_434.ibd',
    ['/home/finve/Documents/embl_code/databases/hmdb_20k.tsv'],
    ds_config,
    sm_config=sm_config
)

# SMConfig.get_conf(True)

#pipe = job.pipe
#pipe.use_db_cache = False

# pipe.prepare_moldb(debug_validate=False)
# pipe.load_ds(use_cache=False)
# pipe.segment_centroids(use_cache=False)
# pipe.validate_segment_centroids()
# pipe.clean(True)

#job.pipe.use_db_cache = False
job.run(save=False, debug_validate=False, use_cache=False)

