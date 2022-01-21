"""
Step 4+: Analyze the results against the version 1 reference results that were run on Staging,


"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
from metaspace.sm_annotation_utils import SMInstance

#%%
data_dir = Path('local/ml_scoring').resolve()  # the "local" subdirectory is .gitignored
dataset_ids_file = data_dir / 'dataset_ids.txt'
dataset_ids = [ds_id.strip() for ds_id in dataset_ids_file.open().readlines()]
sm = SMInstance(config_path=str(Path.home() / '.metaspace.staging'))

#%%
def get_control_anns(sm, ds_ids):
    def load_data(ds_id):
        try:
            results_df = sm.dataset(id=f"{ds_id}_control").results(database=38)
            if not results_df.empty:
                return (
                    results_df.reset_index()
                    .assign(ds_id=ds_id)
                    .drop(columns=['ionFormula', 'ion', 'isotopeImages'])
                    .drop(columns=['colocCoeff', 'moleculeNames', 'moleculeIds'])
                    .rename(columns={'moc': 'rhoChaos', 'adduct': 'modifier'})
                )
        except Exception as e:
            print(f"Error loading data for {ds_id}")
            print(e)

    with ThreadPoolExecutor(4) as ex:
        return pd.concat(
            [df for df in ex.map(load_data, ds_ids) if df is not None], ignore_index=True
        )


control_df = get_control_anns(sm, dataset_ids)
print(f'{control_df.ds_id.nunique()} datasets found')

control_df.to_csv(data_dir / 'control_anns.csv', index=False)

#%%
control_df = pd.read_csv(data_dir / 'control_anns.csv')
control_ds_ids = control_df.ds_id.unique()
prod_df = pd.read_csv(data_dir / 'prod_impl.csv')
prod_df['ds_id'] = prod_df.ds_id.str.slice(0, 20)  # Remove suffix from DS IDs
prod_df = prod_df[prod_df.ds_id.isin(control_ds_ids)]  # Discard datasets not in the control set
prod_df = prod_df[prod_df.target == 1.0]  # Discard decoys - they're not useful for this comparison


#%% Merge control and catboost results, and count overlapping/non-overlapping annotations for each
# dataset

# Use a slightly higher FDR threshold, because the exact FDR values in the control pipeline often
# failed " <= 0.1" checks due to floating point imprecision
fdr_threshold = 0.10 + 0.000001

merge_cols = ['ds_id', 'formula', 'modifier']
merged_df = pd.merge(
    control_df[[*merge_cols, 'fdr']].rename(columns={'fdr': 'fdr_control'}),
    prod_df[[*merge_cols, 'pred_fdr']].rename(columns={'pred_fdr': 'fdr_catboost'}),
    on=['ds_id', 'formula', 'modifier'],
    how='outer',
).sort_values(merge_cols)

stats = []
for ds_id, grp in merged_df.groupby('ds_id'):
    in_control = grp.fdr_control <= fdr_threshold
    in_catboost = grp.fdr_catboost <= fdr_threshold
    stats.append(
        {
            'ds_id': ds_id,
            'common': (in_control & in_catboost).sum(),
            'control_only': (in_control & ~in_catboost).sum(),
            'new_only': (~in_control & in_catboost).sum(),
        }
    )

stats_df = pd.DataFrame(stats)
stats_df.to_csv(data_dir / 'control_vs_catboost_stats.csv', index=False)
