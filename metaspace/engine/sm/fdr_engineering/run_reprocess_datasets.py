"""
Step 2: Reprocess the selected datasets on the selected server & wait for them to finish.

The source server comes from the ~/.metaspace config file
The destination server comes from the ~/.metaspace.local config file
Example config file contents (remove indentation):

    host=https://staging.metaspace2020.eu
    api_key=0000  # Get an API key from your user profile on the server

The dataset IDs should be listed in local/ml_scoring/dataset_ids.txt (one ID per line)
On the destination server, the `DST_SUFFIX` suffix will only be appended to each dataset ID if your
account is an admin account!! If you're not an admin, random IDs will be generated, and you'll need
to fix the code here to keep track of them.
"""

import logging
from copy import deepcopy
from pathlib import Path
from typing import Any, Tuple

from metaspace.sm_annotation_utils import SMInstance

from sm.engine.ds_config import DSConfig
from sm.fdr_engineering.rerun_datasets import reprocess_dataset_remote, wait_for_datasets

# GlobalInit() Only needed for the "_local" functions
logger = logging.getLogger(__name__)
sm_src = SMInstance()
sm_dst = SMInstance(config_path=str(Path.home() / '.metaspace.local'))
DST_SUFFIX = '_ml_training'

core_metabolome_dst_id = next(
    db.id for db in sm_dst.databases() if db.name == 'CoreMetabolome' and db.version == 'v3'
)
data_dir = Path('local/ml_scoring').resolve()  # the "local" subdirectory is .gitignored
data_dir.parent.mkdir(parents=True, exist_ok=True)
dataset_ids_file = data_dir / 'dataset_ids.txt'
dataset_ids = [ds_id.strip() for ds_id in dataset_ids_file.open().readlines()]
dst_dataset_ids = [ds_id + DST_SUFFIX for ds_id in dataset_ids]

#%%
# # Test VPC
# from sm.engine.annotation_lithops.executor import Executor
# from sm.engine.config import SMConfig
#
# Executor(SMConfig.get_conf()['lithops']).call(lambda i: i, (0,), runtime_memory=32768)
print()
#%%
def update_metadata(metadata: Any, config: DSConfig) -> Tuple[Any, DSConfig]:
    """The purpose of this function is to reset every dataset's config to the desired values for
    training.
    Mainly this means enforcing the default values so that no unwanted noise is included, however
    it also importantly sets the 'compute_unused_metrics' flag and selects which database to use.
    """
    ds_config: DSConfig = deepcopy(config)
    ds_config['analysis_version'] = 1
    ds_config['isotope_generation']['chem_mods'] = []
    ds_config['isotope_generation']['neutral_losses'] = []
    if ds_config['isotope_generation']['charge'] > 0:
        ds_config['isotope_generation']['adducts'] = ['+H', '+Na', '+K']
    else:
        ds_config['isotope_generation']['adducts'] = ['-H', '+Cl']
    ds_config['database_ids'] = [core_metabolome_dst_id]
    ds_config['fdr']['decoy_sample_size'] = 20
    ds_config['image_generation']['ppm'] = 3
    ds_config['image_generation']['compute_unused_metrics'] = True

    ds_metadata = deepcopy(metadata)
    # Many datasets have values that now fail validation and cause errors.  This value doesn't
    # affect annotation, so it's easiest to just always overwrite it with valid values
    ds_metadata['MS_Analysis']['Pixel_Size'] = {
        'Xaxis': 100,
        'Yaxis': 100,
    }

    return ds_metadata, ds_config


#%% Process all datasets on the destination server

errors = []
for i, ds_id in enumerate(dataset_ids):
    print(f'Enqueuing dataset {i}/{len(dataset_ids)}: {ds_id}')
    try:
        reprocess_dataset_remote(
            sm_src,
            sm_dst,
            ds_id,
            ds_id + DST_SUFFIX,
            update_metadata,
            # skip_existing=False,
        )
    except Exception as e:
        errors.append((ds_id, e))
        logger.exception(f'Error processing dataset {ds_id}')
        if len(errors) > 5:
            print('Too many errors, aborting')
            break

    # If this generates "DATASET_BUSY" errors, try emptying the sm_lithops queue (assuming it's
    # not a production server) and resetting their status in the database with e.g.:
    # UPDATE public.dataset SET status='FINISHED' WHERE id LIKE '%_ml_training';

#%% Wait for datasets to finish
dst_dataset_ids, errors = wait_for_datasets(sm_dst, dst_dataset_ids, raise_on_error=False)
print(errors)
