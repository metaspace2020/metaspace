"""
Step 3: Download the results, or load them from disk. Convert them to flat "metrics_df" format
"""

import logging
from pathlib import Path

from metaspace.sm_annotation_utils import SMInstance

from sm.fdr_engineering.train_model import (
    get_ranking_data,
    get_many_fdr_diagnostics_remote,
    download_fdr_diagnostics,
    load_fdr_diagnostics_from_files,
)

logger = logging.getLogger(__name__)
DST_SUFFIX = '_v1_ref_dbs'

data_dir = Path('local/ml_scoring').resolve()  # the "local" subdirectory is .gitignored
data_dir.parent.mkdir(parents=True, exist_ok=True)
dataset_ids_file = data_dir / 'control_ds_ids.txt'
dataset_ids = [ds_id.strip() for ds_id in dataset_ids_file.open().readlines()]
dst_dataset_ids = [ds_id + DST_SUFFIX for ds_id in dataset_ids]
sm = SMInstance(config_path=str(Path.home() / '.metaspace.staging'))

#%% Download the data from a METASPACE server and convert it to a flat metrics file
downloaded_data_file = data_dir / 'metrics_df.parquet'

# ds_diags is an iterable to save temp memory
ds_diags = get_many_fdr_diagnostics_remote(sm, dst_dataset_ids)
metrics_df = get_ranking_data(ds_diags, filter_bad_rankings=True)
metrics_df.to_parquet(downloaded_data_file)

#%% Download the data from a METASPACE server and save it as unconverted diagnostics files

dest_dir = data_dir / 'fdr_diagnostics' / DST_SUFFIX[1:]
download_fdr_diagnostics(sm, dst_dataset_ids, dest_dir)

#%% Convert downloaded files to metrics_df format
for db_name in ['CoreMetabolome-v3', 'HMDB-v4', 'SwissLipids-2018-02-02']:
    src_dir = data_dir / 'fdr_diagnostics' / DST_SUFFIX[1:] / db_name
    dst_file = data_dir / 'fdr_diagnostics' / f'{DST_SUFFIX[1:]}_{db_name}_metrics_df.parquet'
    ds_diags = load_fdr_diagnostics_from_files(src_dir)
    metrics_df = get_ranking_data(ds_diags, filter_bad_rankings=True)
    metrics_df.to_parquet(dst_file)
