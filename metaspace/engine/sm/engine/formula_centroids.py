import logging
from pathlib import Path
import boto3
from botocore.exceptions import ClientError
from itertools import product, repeat
from pyspark.sql import SparkSession
import pandas as pd
import numpy as np
from copy import deepcopy

from sm.engine.util import SMConfig, split_s3_path
from sm.engine.isocalc_wrapper import IsocalcWrapper

logger = logging.getLogger('engine')


class CentroidsGenerator(object):
    """ Generator of theoretical isotope peaks for all molecules in database

    Args
    ----------
    sc : pyspark.SparkContext
    isocalc: IsocalcWrapper
    """

    def __init__(self, sc, isocalc):
        self._sc = sc
        self._isocalc = isocalc
        self._sm_config = SMConfig.get_conf()
        self._parquet_chunks_n = 64
        self._iso_gen_part_n = 512

        self._spark_session = SparkSession(self._sc)
        self._ion_centroids_path = '{}/{}/{}'.format(self._sm_config['isotope_storage']['path'],
                                                     self._isocalc.sigma,
                                                     self._isocalc.charge)
        self._s3 = boto3.client('s3', self._sm_config['aws']['aws_region'],
                                aws_access_key_id=self._sm_config['aws']['aws_access_key_id'],
                                aws_secret_access_key=self._sm_config['aws']['aws_secret_access_key'])

    def _generate(self, formulas, index_start=0):
        """ Generate isotopic peaks

        Args
        ---
        formulas: list
        """
        logger.info('Generating molecular isotopic peaks')

        isocalc = deepcopy(self._isocalc)

        def calc_centroids(args):
            formula_i, formula = args
            mzs, ints = isocalc.centroids(formula)
            if mzs is not None:
                return zip(repeat(formula_i),
                           range(0, len(mzs)),
                           map(float, mzs),
                           map(float, ints))
            else:
                return []

        formulas_df = pd.DataFrame([(i, formula) for i, formula in enumerate(formulas, index_start)],
                                   columns=['formula_i', 'formula']).set_index('formula_i')
        centroids_rdd = (self._sc.parallelize(formulas_df.reset_index().values,
                                              numSlices=self._iso_gen_part_n)
                         .flatMap(calc_centroids))
        centroids_df = (pd.DataFrame(data=centroids_rdd.collect(),
                                     columns=['formula_i', 'peak_i', 'mz', 'int'])
                        .sort_values(by='mz')
                        .set_index('formula_i'))

        # to exclude all formulas that failed
        formulas_df = formulas_df.loc[centroids_df.index.unique()]
        return FormulaCentroids(formulas_df, centroids_df)

    def generate_if_not_exist(self, formulas):
        """ Generate missing centroids and return them

        Args
        ---
        formulas: Iterable

        Returns
        ---
            FormulaCentroids
        """
        all_formula_centroids = self._restore()

        if all_formula_centroids is None:
            all_formula_centroids = self._generate(formulas)
        else:
            saved_formulas = all_formula_centroids.formulas_df.formula.unique()
            new_formulas = list(set(formulas) - set(saved_formulas))
            if len(new_formulas) > 0:
                logger.info(f'Number of missing formulas: {len(new_formulas)}')
                index_start = all_formula_centroids.formulas_df.index.max() + 1
                new_formula_centroids = self._generate(new_formulas, index_start)
                all_formula_centroids += new_formula_centroids

        self._save(all_formula_centroids)

        return all_formula_centroids.subset(formulas)

    def _saved(self):
        """ Check if ion centroids saved to parquet
        """
        if self._ion_centroids_path.startswith('s3a://'):
            bucket, key = split_s3_path(self._ion_centroids_path)
            try:
                self._s3.head_object(Bucket=bucket, Key=key + '/formulas/_SUCCESS')
            except ClientError:
                return False
            else:
                return True
        else:
            return (Path(self._ion_centroids_path + '/formulas/_SUCCESS').exists() &
                    Path(self._ion_centroids_path + '/centroids/_SUCCESS').exists())

    def _restore(self):
        logger.info('Restoring peaks')
        if self._saved():
            formulas_df = self._spark_session.read.parquet(
                self._ion_centroids_path + '/formulas').toPandas().set_index('formula_i')
            centroids_df = self._spark_session.read.parquet(
                self._ion_centroids_path + '/centroids').toPandas().set_index('formula_i')
            return FormulaCentroids(formulas_df, centroids_df)

    def _save(self, formula_centroids):
        """ Save isotopic peaks
        """
        logger.info('Saving peaks')
        assert formula_centroids.formulas_df.index.name == 'formula_i'

        centr_spark_df = self._spark_session.createDataFrame(formula_centroids.centroids_df.reset_index())
        centr_spark_df.write.parquet(self._ion_centroids_path + '/centroids', mode='overwrite')
        ion_spark_df = self._spark_session.createDataFrame(formula_centroids.formulas_df.reset_index())
        ion_spark_df.write.parquet(self._ion_centroids_path + '/formulas', mode='overwrite')


class FormulaCentroids(object):
    """ Theoretical isotope peaks for formulas

    Args
    ----------
    formulas_df : pandas.DataFrame
    centroids_df : pandas.DataFrame
    """
    def __init__(self, formulas_df, centroids_df):
        u_index_formulas = set(formulas_df.index.unique())
        u_index_centroids = set(centroids_df.index.unique())
        assert u_index_formulas == u_index_centroids, (u_index_formulas, u_index_centroids)

        self.formulas_df = formulas_df.sort_values(by='formula')
        self.centroids_df = centroids_df.sort_values(by='mz')

    def __add__(self, other):
        """ It will also be used for += operation by Python automatically
        """
        assert type(other) == FormulaCentroids
        assert pd.merge(self.formulas_df, other.formulas_df, on='formula').empty

        other = other.copy()
        index_offset = self.formulas_df.index.max() - other.formulas_df.index.min() + 1
        other.formulas_df.index = other.formulas_df.index + index_offset
        other.centroids_df.index = other.centroids_df.index + index_offset

        formulas_df = pd.concat([self.formulas_df, other.formulas_df])
        centroids_df = pd.concat([self.centroids_df, other.centroids_df])
        formulas_df.index.name = centroids_df.index.name = 'formula_i'  # fix: occasionally pandas looses index name
        return FormulaCentroids(formulas_df, centroids_df)

    def copy(self):
        return FormulaCentroids(formulas_df=self.formulas_df.copy(),
                                centroids_df=self.centroids_df.copy())

    def subset(self, formulas):
        formulas = set(formulas)
        miss_formulas = formulas - set(self.formulas_df.formula.values)
        if len(miss_formulas) > 0:
            # Missing formulas requested
            # Also happens when CentroidsGenerator._generate failed to compute formula centroids
            logger.warning(f'{len(miss_formulas)} missing formulas ignored: {list(miss_formulas)[:10]}...')

        valid_formulas = formulas - miss_formulas
        valid_formula_ids = self.formulas_df[self.formulas_df.formula.isin(valid_formulas)].index.values
        return FormulaCentroids(formulas_df=self.formulas_df.loc[valid_formula_ids],
                                centroids_df=self.centroids_df.loc[valid_formula_ids])

    def centroids_subset(self, formulas):
        """ Isotopic peaks for 'formulas'

        Args
        ---
        formulas: list of tuples

        Returns
        ---
        : pandas.DataFrame
        """
        return self.subset(formulas).centroids_df
