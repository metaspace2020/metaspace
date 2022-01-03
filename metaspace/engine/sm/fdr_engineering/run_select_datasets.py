"""
Step 1: Select a representative sample of datasets & save to datasets.csv

This script selects random datasets from METASPACE to use for training, trying to balance maximizing
variety of things like submitter, sample type, instrument type, polarity, etc. while also staying
relatively representative of the proportion of datasets submitted to METASPACE.

This script needs work before it can be run again: The "ml_scoring/ds_ann_counts.csv" file
is needed if you want to filter out datasets that have too few annotations, however the SQL query
to generate this file has been lost to time. It's probably easier to either rewrite it using
the SMInstance API, or remove the too-few-annotations filter.

"""

import re

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

# pylint: disable=no-name-in-module
from Levenshtein import distance
from metaspace.sm_annotation_utils import SMInstance


#%% Functions for cleaning up metadata fields


def normalize_analyzer(analyzer):
    analyzer = (analyzer or '').lower()
    if any(phrase in analyzer for phrase in ['orbitrap', 'exactive', 'exploris', 'hf-x', 'uhmr']):
        return 'Orbitrap'
    if any(phrase in analyzer for phrase in ['fticr', 'ft-icr', 'ftms', 'ft-ms']):
        return 'FTICR'
    if any(phrase in analyzer for phrase in ['tof', 'mrt', 'exploris', 'synapt', 'xevo']):
        return 'TOF'
    return analyzer


def normalize_source(source):
    source = (source or '').lower()
    if any(phrase in source for phrase in ['maldi']):
        return 'MALDI'
    if any(phrase in source for phrase in ['sims', 'gcib']):
        return 'SIMS'
    if any(phrase in source for phrase in ['ir-maldesi', 'laesi', 'ldi', 'lesa']):
        # Some of these contain "ESI" but are pretty distinctive so shouldn't be lumped in with DESI
        return 'Other'
    if any(phrase in source for phrase in ['esi']):
        return 'ESI'
    return 'Other'


def normalize_resolving_power(ms_analysis):
    analyzer = normalize_analyzer(ms_analysis['Analyzer'])
    resolving_power = ms_analysis['Detector_Resolving_Power']['Resolving_Power']
    mz = ms_analysis['Detector_Resolving_Power']['mz']

    if analyzer == 'FTICR':
        return resolving_power * mz / 200.0
    elif analyzer == 'Orbitrap':
        return resolving_power * (mz / 200.0) ** 0.5
    else:
        return resolving_power


SOLVENT_MAPPING = {
    'tfa': 'TFA',
    'formic acid': 'FA',
    'acetone': 'Acetone',
    'dmf': 'DMF',
    'methanol': 'MeOH',
    'ethanol': 'EtOH',
    'toluene': 'Toluene',
    'acetonitrile': 'ACN',
}
SOLVENT_MAPPING.update({v.lower(): v for v in SOLVENT_MAPPING.values()})
SOLVENT_RE = re.compile('|'.join(SOLVENT_MAPPING.keys()))


def normalize_solvent(solvent):
    if not solvent:
        return 'Other'
    m = SOLVENT_RE.search(solvent.lower())
    if m:
        return SOLVENT_MAPPING[m[0]]
    return 'Other'


MATRIX_MAPPING = {
    # There are lots more matrixes, but these were the top 10 at time of writing
    '2,5-dihydroxybenzoic acid': 'DHB',
    '1,5-diaminonaphthalene': 'DAN',
    '9-aminoacridine': '9AA',
    'alpha-cyano-4-hydroxycinnamic acid': 'CHCA',
    'n-(1-naphthyl)ethylenediamine dihydrochloride': 'NEDC',
    'α-cyano-4-hydroxycinnamic acid': 'HCCA',
    '1,8-bis(dimethylamino)naphthalene': 'DMAN',
    '2,5-dihydroxyacetophenone': 'DHAP',
    'dha': 'DHAP',  # People use both DHA and DHAP for 2,5-dihydroxyacetophenone. Settle on DHAP
    'Norharmane': 'Norharmane',
    # 'None': 'None',
}
MATRIX_MAPPING.update({v.lower(): v for v in MATRIX_MAPPING.values()})
MATRIX_RE = re.compile('|'.join(re.sub('[()]', '\\$0', k) for k in MATRIX_MAPPING.keys()))


def normalize_matrix(matrix):
    if not matrix:
        return 'Other'
    m = MATRIX_RE.search(matrix.lower())
    if m:
        return MATRIX_MAPPING[m[0]]
    return 'Other'


#%%

sm = SMInstance()  # Call sm.save_login() to save a credentials file to access private DSs
all_datasets = sm.datasets(status='FINISHED')

all_ds_df = pd.DataFrame(
    {
        'ds_id': ds.id,
        'name': ds.name,
        'group': ds.group['shortName'] if ds.group else 'None',
        'submitter': ds.submitter['name'],
        # pylint: disable=protected-access
        'is_public': ds._info['isPublic'],
        'polarity': ds.metadata['MS_Analysis']['Polarity'],
        'source': normalize_source(ds.metadata['MS_Analysis']['Ionisation_Source']),
        'raw_source': ds.metadata['MS_Analysis']['Ionisation_Source'],
        'analyzer': normalize_analyzer(ds.metadata['MS_Analysis']['Analyzer']),
        'raw_analyzer': ds.metadata['MS_Analysis']['Analyzer'],
        'matrix': normalize_matrix(ds.metadata['Sample_Preparation']['MALDI_Matrix']),
        'raw_matrix': ds.metadata['Sample_Preparation']['MALDI_Matrix'],
        'solvent': normalize_solvent(ds.metadata['Sample_Preparation'].get('Solvent')),
        'raw_solvent': ds.metadata['Sample_Preparation'].get('Solvent'),
        'rp': normalize_resolving_power(ds.metadata['MS_Analysis']),
    }
    for ds in all_datasets
    if ds
)

# The "20 labs" project shouldn't be included with EMBL as it gets unusual priority due to its
# diversity within the group
ext_datasets = [ds.id for ds in sm.datasets(project='62d1990a-a4ff-11eb-96db-abcc9848804b')]
all_ds_df.loc[all_ds_df.ds_id.isin(ext_datasets), 'group'] = 'None'

# ds_ann_counts.csv is an SQL export of how many annotations each dataset has at each FDR%
# as it's pretty slow to get this from the API. It's full of sensitive data though, so it'd probably
# be better to rewrite this and get the stats from the API instead.
all_ds_df = all_ds_df.merge(pd.read_csv('ml_scoring/ds_ann_counts.csv'), on='ds_id')

# Find datasets that have very similar names (e.g. SlideA, SlideB, SlideC, etc) so that they can
# have their weights proportionately decreased. If someone uploads 20 very similar datasets, they
# should each only have 1/20th of a chance to be selected compared to a unique dataset.
all_ds_df['batch_grouping'] = all_ds_df.ds_id
last_grouping, last_name, last_submitter = '', '', ''
for row in (
    all_ds_df.sort_values(
        'name',
        key=lambda s: s.str.replace(r'\d', '').str.replace('(sample|slide)[A-Z]', '\\1', case=True),
    )
    .sort_values('submitter', kind='stable')
    .itertuples()
):
    name = re.sub(r'\d', '', row.name)
    if row.submitter == last_submitter and distance(name, last_name) < 1:
        all_ds_df.loc[row[0], 'batch_grouping'] = last_grouping
    else:
        last_grouping = row.ds_id
    last_name = name
    last_submitter = row.submitter

# Exclude unwanted datasets
ds_mask = (
    # Primary criteria: Datasets should be public OR submitted by EMBL
    (all_ds_df.is_public | (all_ds_df.group == '♡EMBL♡'))
    # Exclude datasets that are obviously test submissions or re-uploads for some other
    # bioinformatic project
    & (all_ds_df.name != 'Example file')
    & ~(all_ds_df.name.str.startswith('Dataset '))
    & ~(all_ds_df.name.str.endswith('_recal'))
    & ~(all_ds_df.name.str.contains('test', case=False))
    # Exclude test datasets uploaded by METASPACE developers
    & ~all_ds_df.submitter.isin(
        [
            'Lachlan Stuart',
            'Lachlan Nicholas Stuart',
            'Christopher Rath',
            'Andreas Eisenbarth',
            'Vitaly Kovalev',
            'Renat Nigmetzianov',
            'Vitaly Kovalev (admin)',
        ]
    )
    # Exclude datasets with a blank/deleted submitter
    & ~all_ds_df.submitter.isna()
    # Exclude datasets with fewer than 10 HMDB annotations @ FDR 10%
    & (all_ds_df.hmdb_10 > 10)
)

#%% Add derived columns
norm_ds_df = all_ds_df.copy()

norm_ds_df['matrix_solvent'] = np.where(
    norm_ds_df.source == 'MALDI',
    norm_ds_df.matrix.replace({'Other': 'Other Matrix'}),
    norm_ds_df.solvent.replace({'Other': 'Other Solvent'}),
)
norm_ds_df['rp_range'] = np.select(
    [norm_ds_df.rp <= 80000, norm_ds_df.rp <= 200000], ['low', 'medium'], 'high'
)
norm_ds_df['batch_weight'] = (1 / norm_ds_df.batch_grouping.value_counts())[
    norm_ds_df.batch_grouping
].values

ds_df = norm_ds_df[ds_mask]

print(f'{len(ds_df)} / {len(norm_ds_df)}')

#%%  Try to select a diverse but relatively representative sample of datasets
def get_stratified_sample(ds_df, count):
    weights = ds_df.batch_weight.copy()
    # For (col, count), take the top `count` values of `col` and compact the rest into an "Other"
    # category.  These are applied to the weights in order and the order has a big impact.
    # If a particular column isn't being proportionately represented in the results, try moving it
    # up or down in the list.
    cols = [
        # ('matrix_solvent', 7),
        ('polarity', 2),
        ('source', 2),
        ('analyzer', 2),
        ('rp_range', 3),
        ('submitter', 50),
        ('group', 20),
    ]
    for col, pop in cols:
        group_weights = weights.groupby(ds_df[col]).sum() ** 0.5
        group_weights = group_weights.sort_values(ascending=False)
        group_weights /= group_weights.sum()
        other = group_weights.index.isin([*group_weights.index[pop:], 'Other'])
        adjustment = pd.Series(
            np.where(other, 1 / max(group_weights[other].sum(), 0.001), 1 / group_weights),
            index=group_weights.index,
        )

        weights *= adjustment[ds_df[col].values].values

    # Slightly prefer newer datasets, as they're more representative of future datasets
    newness = np.maximum(ds_df.ds_id.str.slice(0, 4).astype(int) - 2013, 0)
    weights *= newness

    ds_df = ds_df.assign(weight=weights)
    return ds_df.sample(count, weights=ds_df.weight).sort_values(['group', 'ds_id'])


random_sample = get_stratified_sample(ds_df, 500)
random_subsample = get_stratified_sample(random_sample, 100)
random_subsubsample = get_stratified_sample(random_subsample, 50)
random_sample['include_in_recal'] = random_sample.index.isin(random_subsample.index)
random_sample['include_in_pilot'] = random_sample.index.isin(random_subsubsample.index)
random_sample.to_csv('ml_scoring/datasets.csv', index=False)
#%%  Make a link to view the datasets online
print('https://metaspace2020.eu/datasets?ds=' + ','.join(random_subsubsample.ds_id))
#%% Plot distributions of datasets before/after sampling
cols = [
    ('group', 8),
    ('analyzer', 3),
    ('source', 3),
    ('polarity', 2),
    ('matrix_solvent', 8),
]

matplotlib.rc('font', size=8)
plt.close('all')
fig, axs = plt.subplots(4, len(cols), figsize=(12, 10))
for (col, pop), (ax1, ax2, ax3, ax4) in zip(cols, axs.T):
    avc = norm_ds_df[col].value_counts()
    vc = ds_df[col].value_counts()
    svc = random_sample[col].value_counts()
    pvc = random_sample[random_sample.include_in_pilot][col].value_counts()
    aligned = (
        pd.concat(
            [
                avc.to_frame('avc').T,
                vc.to_frame('vc').T,
                svc.to_frame('svc').T,
                pvc.to_frame('pvc').T,
            ]
        )
        .fillna(0)
        .T.sort_values('svc', ascending=False)
        .T
    )
    palette = dict(zip(aligned.columns, sns.color_palette(n_colors=len(aligned.columns))))
    colors = [palette[val] for val in aligned.columns]
    labels = [*aligned.columns[:pop]] + [None for i in range(pop, len(aligned.columns))]
    ax1.set_title(col.replace('matrix_solvent', 'matrix (MALDI) / solvent (non-MALDI)'))
    ax1.pie(aligned.loc['avc'], labels=labels, colors=colors, startangle=90, counterclock=False)
    ax2.pie(aligned.loc['vc'], labels=labels, colors=colors, startangle=90, counterclock=False)
    ax3.pie(aligned.loc['svc'], labels=labels, colors=colors, startangle=90, counterclock=False)
    ax4.pie(aligned.loc['pvc'], labels=labels, colors=colors, startangle=90, counterclock=False)

fig.suptitle('All-METASPACE Distribution', size=12)
axs[1, 2].set_title(
    'Available EMBL/Public datasets with >10 HMDB anns at <=10% FDR', y=1.1, size=12
)
axs[2, 2].set_title('Stratified sample (500 datasets)', y=1.1, size=12)
axs[3, 2].set_title('Stratified sample (50 datasets pilot)', y=1.1, size=12)
plt.tight_layout()
fig.savefig('ml_scoring/sample.png')
plt.show()
