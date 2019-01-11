import logging
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from itertools import product, repeat
from pyspark.sql import SparkSession
import pandas as pd
import numpy as np

from sm.engine.util import SMConfig, split_s3_path
from sm.engine.isocalc_wrapper import IsocalcWrapper

logger = logging.getLogger('engine')


class IonCentroidsGenerator(object):
    """ Generator of theoretical isotope peaks for all molecules in database

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
        self.s3 = boto3.client('s3', self._sm_config['aws']['aws_region'],
                               aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                               aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'])

    def _generate(self, isocalc, formulas, adducts):
        """ Generate isotopic peaks

        Args
        ---
        isocalc: IsocalcWrapper
            Cannot be a class field as Spark doesn't allow to pass 'self' to functions
        formulas: list
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
                               enumerate(sorted(product(formulas, adducts)))],
                              columns=['ion_i', 'formula', 'adduct']).set_index('ion_i')

        ion_centroids_rdd = (self._sc.parallelize(ion_df.reset_index().values,
                                                  numSlices=self._iso_gen_part_n)
                             .flatMap(calc_centroids))
        centroids_df = (pd.DataFrame(data=ion_centroids_rdd.collect(),
                                     columns=['ion_i', 'peak_i', 'mz', 'int'])
                         .sort_values(by='mz')
                         .set_index('ion_i'))

        # to exclude all formula-adduct combinations that failed
        ions_df = ion_df.loc[centroids_df.index.unique()]
        return IonCentroids(ions_df, centroids_df)

    def generate_if_not_exist(self, isocalc, formulas, adducts):
        """ Generate missing centroids and return them

        Args
        ---
        isocalc: IsocalcWrapper
            Cannot be a class field as Spark doesn't allow to pass 'self' to functions
        formulas: list
        adducts: list

        Returns
        ---
        : IonCentroids
        """
        ion_centroids = self.restore()
        if ion_centroids is None:
            ion_centroids = self._generate(isocalc, formulas, adducts)
        else:
            saved_adducts = ion_centroids.ions_df.adduct.unique()
            missing_adducts = list(set(adducts) - set(saved_adducts))

            if len(missing_adducts) > 0:
                logger.info(f'Missing adducts: {missing_adducts}')
                missing_ion_centroids = self._generate(isocalc, formulas, missing_adducts)
                ion_centroids += missing_ion_centroids

        self.save(ion_centroids)
        return ion_centroids

    def _saved(self):
        """ Check if ion centroids saved to parquet
        """
        if self._ion_centroids_path.startswith('s3a://'):
            bucket, key = split_s3_path(self._ion_centroids_path)
            try:
                self.s3.head_object(Bucket=bucket, Key=key + '/ions/_SUCCESS')
            except ClientError:
                return False
            else:
                return True
        else:
            return (Path(self._ion_centroids_path + '/ions/_SUCCESS').exists() &
                    Path(self._ion_centroids_path + '/centroids/_SUCCESS').exists())

    def restore(self):
        logger.info('Restoring peaks')
        if self._saved():
            ions_df = self._spark_session.read.parquet(
                self._ion_centroids_path + '/ions').toPandas().set_index('ion_i')
            centroids_df = self._spark_session.read.parquet(
                self._ion_centroids_path + '/centroids').toPandas().set_index('ion_i')
            return IonCentroids(ions_df, centroids_df)

    def save(self, ion_centroids):
        """ Save isotopic peaks
        """
        logger.info('Saving peaks')
        centr_spark_df = self._spark_session.createDataFrame(ion_centroids.centroids_df.reset_index())
        centr_spark_df.write.parquet(self._ion_centroids_path + '/centroids', mode='overwrite')
        ion_spark_df = self._spark_session.createDataFrame(ion_centroids.ions_df.reset_index())
        ion_spark_df.write.parquet(self._ion_centroids_path + '/ions', mode='overwrite')


class IonCentroids(object):
    """ Theoretical isotope peaks for molecules-adduct combinations

    Args
    ----------
    ions_df : pandas.DataFrame
    centroids_df : pandas.DataFrame
    """
    def __init__(self, ions_df, centroids_df):
        u_index_ions = ions_df.index.unique().sort_values()
        u_index_centroids = centroids_df.index.unique().sort_values()
        assert np.all(u_index_ions == u_index_centroids), (u_index_ions, u_index_centroids)

        self.ions_df = ions_df
        self.centroids_df = centroids_df

    def __add__(self, other):
        """ It will also be used for += operation by Python automatically
        """
        assert type(other) == IonCentroids
        assert pd.merge(self.ions_df, other.ions_df, on=['formula', 'adduct']).empty
        assert self.ions_df.index.min() == other.ions_df.index.min() == 0

        other = other.copy()
        index_offset = self.ions_df.index.max() + 1
        other.ions_df.index = other.ions_df.index + index_offset
        other.centroids_df.index = other.centroids_df.index + index_offset

        ions_df = pd.concat([self.ions_df, other.ions_df])
        centroids_df = pd.concat([self.centroids_df, other.centroids_df])
        return IonCentroids(ions_df=ions_df, centroids_df=centroids_df)

    def copy(self):
        return IonCentroids(ions_df=self.ions_df.copy(),
                            centroids_df=self.centroids_df.copy())

    def centroids_subset(self, ions):
        """ Restore isotopic peaks dataframe only for the 'ions'

        Args
        ---
        ions: list of tuples

        Returns
        ---
        : pandas.DataFrame
        """
        ion_map = self.ions_df.reset_index().set_index(['formula', 'adduct']).ion_i
        ion_ids = ion_map.loc[ions].values
        return self.centroids_df.loc[ion_ids].sort_values(by='mz')

    def ions_subset(self, adducts):
        """ Return ions for specified 'adducts'

        Args
        ---
        adducts: list of tuples

        Returns
        ---
        : list of tuples
        """
        filtered_ion_df = (self.ions_df[self.ions_df.adduct.isin(adducts)]
                           .sort_values(by=['formula', 'adduct']))
        return [(r.formula, r.adduct) for r in filtered_ion_df.itertuples(index=False)]
