import os
import json
import boto3
import pandas as pd
from metaspace import sm_annotation_utils
def get_study_info(ds_ids, database='HMDB-v4', fdr=0.1, config=None):
    ## CONNECT TO METASPACE SERVICES
    if config==None:
        sm = sm_annotation_utils.SMInstance() # connect to the main metaspace service
    else:
        sm = sm_annotation_utils.SMInstance(config)
    db = sm._moldb_client.getDatabase(database) #connect to the molecular database service
    s3 = boto3.resource('s3')
    ## PULL DATASET INFORMATION
    info = {ds_id: {'files': {}, 'annotations': {}, 'metadata': {}} for ds_id in ds_ids}
    for ii, ds_id in enumerate(ds_ids):
        ds = sm.dataset(id=ds_id)
        me = json.loads(ds.metadata.json)
        path = ds.s3dir[6:] #strip s3a://
        bucket_name, ds_name = path.split('/', 1)
        bucket = s3.Bucket(bucket_name)
        files = {}
        for obj in bucket.objects.filter(Prefix=path.split('/')[1]):
            if obj.key.endswith('.imzML'):
                files['imzML'] = path + "/" + obj.key.split('/')[-1]
            if obj.key.endswith('.ibd'):
                files['ibd'] =   path + "/" + obj.key.split('/')[-1]
        opt_im = ds._gqclient.getRawOpticalImage(ds.id)['rawOpticalImage']
        files.update({'optical': {'image': ds._baseurl + opt_im['url'], 'transform': opt_im['transform']}})
        info[ds_id]['metadata'].update(me)
        info[ds_id]['files'].update(files)
    info = pd.concat([pd.io.json.json_normalize(info[ds_id]) for ds_id in ds_ids])
    info.index=ds_ids
    # PULL ANNOTATIONS
    annotations = []
    for ii, ds_id in enumerate(ds_ids):
        ds = sm.dataset(id=ds_id)
        for an in ds.annotations(fdr=fdr, database=database):
            nms = db.names(an[0])
            ids = db.ids(an[0])
            v = 1
            #im = ds.isotope_images(sf = an[0], adduct=an[1])[0] # get image for this molecule's principle peak
            #v = im[im>0].mean() # mean image intensity
            for n, i in zip(nms, ids):
                annotations.append((ds.name, n, i, an[0], an[1], v))
    annotations = pd.DataFrame.from_records([[a for a in an] for an in annotations]).pivot_table(index=[0], columns=[4,3,2,1], values=5).fillna(0).T
    return info, annotations

if __name__== "__main__":
    ## DATASET IDS
    # to find them:
    # annotation.metaspace2020.eu/annotations
    # filter -> datasets: select datasets
    # copy from url params "ds=...."
    #todo: argparse
    ds_ids = ["2017-07-18_10h12m54s"]
    file_path = "."
    info, annotations = get_study_info(ds_ids)
    ## Write to file
    info.to_csv(os.path.join(file_path, "info.tsv"), sep="\t")
    annotations.to_csv(os.path.join(file_path, "annotations.tsv"), sep="\t")
    # download_study(info)