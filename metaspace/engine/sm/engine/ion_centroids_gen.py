import logging
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from itertools import product, repeat
from pyspark.sql import SparkSession
import pandas as pd

from sm.engine.util import SMConfig, split_s3_path
from sm.engine.isocalc_wrapper import IsocalcWrapper

logger = logging.getLogger('engine')


class IonCentroidsGenerator(object):
    """ Generator of theoretical isotope peaks for all molecules in a database.

    Args
    ----------
    sc : pyspark.SparkContext
    moldb_name : str
    isocalc: IsocalcWrapper
    """
    def __init__(self, sc, moldb_name, isocalc):
        self._sc = sc
        self._moldb_name = moldb_name
        self._isocalc = isocalc
        self._sm_config = SMConfig.get_conf()
        self._parquet_chunks_n = 64
        self._iso_gen_part_n = 512

        self._spark_session = SparkSession(self._sc)
        self._ion_centroids_path = '{}/{}/{}/{}'.format(self._sm_config['isotope_storage']['path'],
                                                        self._moldb_name,
                                                        self._isocalc.sigma,
                                                        self._isocalc.charge)
        self.ion_df = None
        self.ion_centroids_df = None

    def exists(self):
        """ Check if ion centroids saved to parquet
        """
        if self._ion_centroids_path.startswith('s3a://'):
            cred_dict = dict(aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                             aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'])
            bucket, key = split_s3_path(self._ion_centroids_path)
            s3 = boto3.client('s3', **cred_dict)
            try:
                s3.head_object(Bucket=bucket, Key=key + '/ions/_SUCCESS')
            except ClientError:
                return False
            else:
                return True
        else:
            return Path(self._ion_centroids_path + '/ions/_SUCCESS').exists()

    def generate(self, isocalc, sfs, adducts):
        """ Generate isotopic peaks

        Args
        ---
        isocalc: IsocalcWrapper
            Cannot be a class field as Spark doesn't allow to pass 'self' to functions
        adducts: list
        """
        logger.info('Generating molecular isotopic peaks')

        def calc_centroids(args):
            ion_i, sf, adduct = args
            mzs, ints = isocalc.ion_centroids(sf, adduct)
            if mzs is not None:
                return zip(repeat(ion_i),
                           range(0, len(mzs)),
                           map(float, mzs),
                           map(float, ints))
            else:
                return []

        ion_df = pd.DataFrame([(i, sf, adduct) for i, (sf, adduct) in
                               enumerate(sorted(product(sfs, adducts)))],
                              columns=['ion_i', 'sf', 'adduct']).set_index('ion_i')

        ion_centroids_rdd = (self._sc.parallelize(ion_df.reset_index().values,
                                                  numSlices=self._iso_gen_part_n)
                             .flatMap(calc_centroids))
        self.ion_centroids_df = (pd.DataFrame(data=ion_centroids_rdd.collect(),
                                              columns=['ion_i', 'peak_i', 'mz', 'int'])
                                 .sort_values(by='mz')
                                 .set_index('ion_i'))

        self.ion_df = ion_df.loc[self.ion_centroids_df.index.unique()]

        # Use when pandas DataFrames get way too big
        # ion_centroids_df = self._spark_session.createDataFrame(data=ion_centroids_rdd,
        #                                                        schema=self.ion_centroids_df_fields)
        # self.ion_centroids_df = (ion_centroids_df
        #                          .sort(ion_centroids_df.mz.asc())
        #                          .coalesce(self._parquet_chunks_n))

    def save(self):
        """ Save isotopic peaks
        """
        logger.info('Saving peaks')

        centr_spark_df = self._spark_session.createDataFrame(self.ion_centroids_df.reset_index())
        centr_spark_df.write.parquet(self._ion_centroids_path + '/ion_centroids', mode='overwrite')
        ion_spark_df = self._spark_session.createDataFrame(self.ion_df.reset_index())
        ion_spark_df.write.parquet(self._ion_centroids_path + '/ions', mode='overwrite')

    def restore(self):
        logger.info('Restoring peaks')

        self.ion_df = self._spark_session.read.parquet(
            self._ion_centroids_path + '/ions').toPandas().set_index('ion_i')
        self.ion_centroids_df = self._spark_session.read.parquet(
            self._ion_centroids_path + '/ion_centroids').toPandas().set_index('ion_i')

    def sf_adduct_centroids_df(self):
        return self.ion_df.join(self.ion_centroids_df).set_index(['sf', 'adduct'])

    def centroids_subset(self, ions):
        """ Restore isotopic peaks dataframe only for the 'ions'

        Args
        ---
        ions: list of tuples

        Returns
        ---
        : pandas.DataFrame
        """
        assert self.ion_df is not None

        ion_map = self.ion_df.reset_index().set_index(['sf', 'adduct']).ion_i
        ion_ids = ion_map.loc[ions].values
        return self.ion_centroids_df.loc[ion_ids].sort_values(by='mz')

    def generate_if_not_exist(self, isocalc, sfs, adducts):
        if not self.exists():
            self.generate(isocalc=isocalc, sfs=sfs, adducts=adducts)
            self.save()
        else:
            self.restore()

    def ions(self, adducts):
        return (self.ion_df[self.ion_df.adduct.isin(adducts)]
                .sort_values(by=['sf', 'adduct'])
                .to_records(index=False))
