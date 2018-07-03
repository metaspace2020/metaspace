"""
Easy access to datasets by downloading them from S3.
Works best on Amazon EC2 (eu-west-1 region).

Requirements:
 - cpyMSpec, cpyImagingMSpec>=0.3.0, metaspace
 - installed boto3, .aws/credentials file
 - installed ims-cpp conda package (conda install -c lomereiter ims-cpp)
"""

from cpyImagingMSpec import ImzbReader, convert_imzml_to_imzb
from cpyMSpec import InstrumentModel, isotopePattern

import boto3
import numpy as np
import json
from tempfile import gettempdir

import os

_s3 = boto3.resource('s3')

def _download(sm_instance, ds_id, tmp_dir, max_size):
    fn_pref = ds_id
    download_dir = tmp_dir
    location = sm_instance.dataset(id=ds_id).s3dir
    bucket, key = location[6:].split('/', 1)
    bucket = _s3.Bucket(bucket)
    imzml_fn = imzb_fn = None
    objects = bucket.objects.filter(Prefix=key)
    for obj in objects:
        if obj.key.endswith('ibd') and obj.size > max_size:
            raise Exception("skipped downloading {}: IBD file is too big".format(ds_name))
    for obj in objects:
        if obj.key.endswith('ibd') or obj.key.lower().endswith('imzml'):
            extension = obj.key.rsplit('.', 1)[-1]
            dest_fn = os.path.join(download_dir, fn_pref + "." + extension)
            if extension.lower() == 'imzml':
                imzml_fn = dest_fn
            if not os.path.exists(dest_fn):
                bucket.download_file(obj.key, dest_fn)
    if imzml_fn is not None:
        imzb_fn = imzml_fn[:-5] + "imzb"
        if not os.path.exists(imzb_fn):
            convert_imzml_to_imzb(imzml_fn, imzb_fn)
    return imzml_fn, imzb_fn

class LocalDataset(object):
    """
    Class for convenient local analysis of sm-engine datasets.

    Automatically performs following operations:
    * downloads files from S3 to the local directory;
    * creates a m/z-sorted copy for quick m/z-image access;
    * reads instrument and polarity metadata for isotope pattern generation;
    * runs DBSCAN clustering algorithm on centroid m/z values.
    """

    def __init__(self, sm_instance, ds_name=None, ds_id=None, tmp_dir=gettempdir(), max_size=100e9):
        ds_id = ds_id or sm_instance.dataset(name=ds_name).id
        ds_name = ds_name or sm_instance.dataset(id=ds_id).name
        self.imzml_fn, self.imzb_fn = _download(sm_instance, ds_id, tmp_dir, max_size)
        self.imzb = ImzbReader(self.imzb_fn)
        img = self.imzb.get_mz_image(0, 0)

        # strip empty rows/columns from the image
        self._first_col = min(np.where(img.sum(axis=0) > -img.shape[0])[0])
        self._first_row = min(np.where(img.sum(axis=1) > -img.shape[1])[0])

        self._bins = None
        self._meta = json.loads(sm_instance.dataset(id=ds_id).metadata.json)
        rp = self._meta['MS_Analysis']['Detector_Resolving_Power']
        analyzer = self.analyzer.lower()
        if 'orbitrap' in analyzer:
            analyzer = 'orbitrap'
        self._instrument = InstrumentModel(analyzer,
                                           float(rp['Resolving_Power']), float(rp['mz']))
        self._sm = sm_instance
        self._name = ds_name
        self._id = ds_id

    @property
    def name(self):
        return self._name

    @property
    def analyzer(self):
        return self._meta['MS_Analysis']['Analyzer']

    @property
    def polarity(self):
        return self._meta['MS_Analysis']['Polarity']

    @property
    def instrument_model(self):
        return self._instrument

    def isotopePattern(self, sum_formula, adduct, charge=None):
        if charge is None:
            charge = -1 if self.polarity == 'Negative' else +1
        p = isotopePattern(sum_formula + adduct)
        p.addCharge(charge)
        return p

    def centroids(self, sum_formula, adduct, charge=None):
        """
        Computes isotope pattern centroids.
        If charge is not provided, it's taken according to the polarity.
        """
        p = self.isotopePattern(sum_formula, adduct, charge)
        return p.centroids(self._instrument)

    @property
    def mz_clusters(self):
        """
        List of detected centroid clusters.
        Calculated on first access (might take several seconds on big datasets)

        FIXME: works well on Orbitrap data, not so much on FTICR
        """
        if self._bins is None:
            self._bins = self.imzb.dbscan(eps=lambda mz: mz * 2e-6)
        return self._bins

    def mz_image(self, mz, ppm):
        """
        Array of total per-pixel intensities within
        [mz * (1 - ppm * 1e-6), mz * (1 + ppm * 1e-6)] interval
        """
        img = self.imzb.get_mz_image(mz, ppm).T
        img[img < 0] = 0
        return img[self._first_col:, self._first_row:]

    def annotations(self, fdr=0.1):
        """
        Set of (sum formula, adduct) pairs with asked FDR level.
        """
        return set(self._sm.dataset(id=self._id).annotations(fdr=fdr))

    def estimate_mz_shift(self, true_mz):
        """
        Estimates m/z shift based on distance to the center of the closest m/z cluster.
        """
        def closest_bin(mz):
            l = self.mz_clusters['median'].values.searchsorted(mz)
            if l == 0:
                return 0
            if l == len(self.mz_clusters):
                return l - 1
            prev, next = self.mz_clusters['median'].values[l-1:l+1]
            if abs(prev - mz) < abs(next - mz):
                return l - 1
            else:
                return l
        l = closest_bin(true_mz)
        shift = self.mz_clusters.iloc[l]['median'] - true_mz
        return shift

    def destroy(self):
        """
        Removes all files from local disk (they stay safe on S3)
        """
        for fn in [self.imzml_fn, self.imzml_fn[:-5] + "ibd",
                   self.imzb_fn, self.imzb_fn + ".idx"]:
            if os.path.exists(fn):
                os.unlink(fn)
