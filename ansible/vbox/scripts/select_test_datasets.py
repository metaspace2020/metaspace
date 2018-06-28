# This script randomly selects up to 3 datasets for each combination of
# ion source, mass analyzer, and polarity, and downloads them to ./<dataset id>/<object key>/
#
# You must have ~/.aws/credentials that grants you rights for sm-engine-upload bucket.
# Some older datasets are located in other buckets, if you don't have rights for those,
# just filter them out after getting `meta` dataframe.
#
# Usage:
# $ cd sm-engine-ansible/vbox
# $ python scripts/select_test_datasets.py

from sm_annotation_utils.sm_annotation_utils import SMInstance
import boto3
from pathlib import Path

DEST_DIR = Path.cwd()
SEED = 42

s3 = boto3.resource('s3')

print("Downloading metadata...")
sm = SMInstance()
meta = sm.get_metadata()

dataset_ids = []
for key, g in meta.groupby(by=['MS_Analysis.Polarity', 'MS_Analysis.Analyzer', 'MS_Analysis.Ionisation_Source']):
    if key[1] not in ['FTICR', 'Orbitrap'] or key[2] not in ['DESI', 'MALDI']:
        continue
    dataset_ids.extend(list(g.sample(n=3, random_state=SEED).index))

print("Selected {} datasets for download".format(len(dataset_ids)))

for ds_id in dataset_ids:
    location = sm.dataset(id=ds_id).s3dir
    bucket, key = location[6:].split('/', 1)
    bucket = s3.Bucket(bucket)
    objects = bucket.objects.filter(Prefix=key)
    print("Downloading {}".format(key))
    for obj in objects:
        ext = obj.key.rsplit('.', 1)[-1].lower()
        if ext not in ['imzml', 'ibd', 'json']:
            continue
        print('\t', obj.key)
        path = DEST_DIR / ds_id / key.replace('/', '-') / obj.key.rsplit('/', 1)[-1]
        print(path)
        if not path.parent.exists():
            path.parent.mkdir(parents=True, exist_ok=True) 
        if not path.exists():
            bucket.download_file(obj.key, str(path))
