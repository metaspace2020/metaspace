import logging
from copy import deepcopy
from itertools import repeat
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from botocore.exceptions import ClientError
from pyspark import SparkContext  # pylint: disable=unused-import

from sm.engine.annotation.isocalc_wrapper import IsocalcWrapper  # pylint: disable=unused-import
from sm.engine.config import SMConfig
from sm.engine.storage import get_s3_client
from sm.engine.util import split_s3_path

logger = logging.getLogger('engine')


class CentroidsGenerator:
    """Generator of theoretical isotope peaks for all molecules in database."""

    def __init__(self, sc, isocalc):
        """
        Args:
            sc (SparkContext):
            isocalc (IsocalcWrapper):
        """
        self._sc = sc
        self._isocalc = isocalc
        self._sm_config = SMConfig.get_conf()
        self._parquet_chunks_n = 64
        self._iso_gen_part_n = 512

        if self._isocalc.analysis_version < 2:
            self._ion_centroids_path = '{}/{}/{}/{}'.format(
                self._sm_config['isotope_storage']['path'],
                self._isocalc.n_peaks,
                self._isocalc.sigma,
                self._isocalc.charge,
            )
        else:
            self._ion_centroids_path = '{}/v{}/{}/{}_{}/{}'.format(
                self._sm_config['isotope_storage']['path'],
                self._isocalc.analysis_version,
                self._isocalc.n_peaks,
                self._isocalc.instrument,
                self._isocalc.sigma,
                self._isocalc.charge,
            )
        self._parquet_file_names = ['centroids.parquet', 'formulas.parquet']
        self._centroids_stored_on_s3 = self._ion_centroids_path.startswith('s3a://')
        if self._centroids_stored_on_s3:
            self._local_ion_centroids_path = Path('/tmp')
        else:
            self._local_ion_centroids_path = Path(self._ion_centroids_path)
        Path(self._local_ion_centroids_path).mkdir(parents=True, exist_ok=True)

        self._s3 = get_s3_client()

    def _generate(self, formulas, index_start=0):
        """Generate isotopic peaks

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
                return zip(repeat(formula_i), range(0, len(mzs)), map(float, mzs), map(float, ints))
            return []

        formulas_df = pd.DataFrame(
            list(enumerate(formulas, index_start)), columns=['formula_i', 'formula']
        ).set_index('formula_i')
        centroids_rdd = self._sc.parallelize(
            formulas_df.reset_index().values, numSlices=self._iso_gen_part_n
        ).flatMap(calc_centroids)
        centroids_df = (
            pd.DataFrame(data=centroids_rdd.collect(), columns=['formula_i', 'peak_i', 'mz', 'int'])
            .sort_values(by='mz')
            .set_index('formula_i')
        )

        # to exclude all formulas that failed
        formulas_df = formulas_df.loc[centroids_df.index.unique()]
        return FormulaCentroids(formulas_df, centroids_df)

    def generate_if_not_exist(self, formulas):
        """Generate missing centroids and return them

        Args
        ---
        formulas: list

        Returns
        ---
            FormulaCentroids
        """
        assert formulas

        all_formula_centroids = self._restore()

        if all_formula_centroids is None:
            all_formula_centroids = self._generate(formulas)
        else:
            saved_formulas = all_formula_centroids.formulas_df.formula.unique()
            new_formulas = list(set(formulas) - set(saved_formulas))
            if new_formulas:
                logger.info(f'Number of missing formulas: {len(new_formulas)}')
                index_start = all_formula_centroids.formulas_df.index.max() + 1
                new_formula_centroids = self._generate(new_formulas, index_start)
                all_formula_centroids += new_formula_centroids

        self._save(all_formula_centroids)

        return all_formula_centroids.subset(formulas)

    def _saved(self):
        """Check if ion centroids saved to parquet"""
        if self._centroids_stored_on_s3:
            bucket, key = split_s3_path(self._ion_centroids_path)
            try:
                for fn in self._parquet_file_names:
                    self._s3.head_object(Bucket=bucket, Key=f'{key}/{fn}')
            except ClientError:
                return False
            else:
                return True
        else:
            return all(
                (Path(self._ion_centroids_path) / fn).exists() for fn in self._parquet_file_names
            )

    def _download_from_s3(self):
        bucket, key = split_s3_path(self._ion_centroids_path)
        for fn in self._parquet_file_names:
            self._s3.download_file(
                Bucket=bucket, Key=f'{key}/{fn}', Filename=str(self._local_ion_centroids_path / fn)
            )

    def _upload_to_s3(self):
        bucket, key = split_s3_path(self._ion_centroids_path)
        for fn in self._parquet_file_names:
            self._s3.upload_file(
                Filename=str(self._local_ion_centroids_path / fn), Bucket=bucket, Key=f'{key}/{fn}'
            )

    def _restore(self):
        logger.info(f'Restoring peaks from {self._ion_centroids_path}')
        formula_centroids = None
        if self._saved():
            if self._centroids_stored_on_s3:
                self._download_from_s3()

            formulas_df = (
                pq.read_table(self._local_ion_centroids_path / 'formulas.parquet')
                .to_pandas()
                .set_index('formula_i')
            )
            centroids_df = (
                pq.read_table(self._local_ion_centroids_path / 'centroids.parquet')
                .to_pandas()
                .set_index('formula_i')
            )
            formula_centroids = FormulaCentroids(formulas_df, centroids_df)
        return formula_centroids

    def _save(self, formula_centroids):
        """Save isotopic peaks"""
        logger.info(f'Saving peaks to {self._ion_centroids_path}')
        assert formula_centroids.formulas_df.index.name == 'formula_i'

        centroids_table = pa.Table.from_pandas(formula_centroids.centroids_df().reset_index())
        pq.write_table(centroids_table, self._local_ion_centroids_path / 'centroids.parquet')
        formulas_table = pa.Table.from_pandas(formula_centroids.formulas_df.reset_index())
        pq.write_table(formulas_table, self._local_ion_centroids_path / 'formulas.parquet')

        if self._centroids_stored_on_s3:
            self._upload_to_s3()


class FormulaCentroids:
    """Theoretical isotope peaks for formulas

    Args
    ----------
    formulas_df : pandas.DataFrame
    centroids_df : pandas.DataFrame
    """

    def __init__(self, formulas_df, centroids_df):
        u_index_formulas = set(formulas_df.index.unique())
        u_index_centroids = set(centroids_df.index.unique())
        index_intersection = u_index_formulas.intersection(u_index_centroids)
        index_union = u_index_formulas.union(u_index_centroids)
        if len(index_union) > len(index_intersection):
            mismatch_row_n = len(index_union) - len(index_intersection)
            logger.warning(
                f'Index mismatch between formulas and centroids dataframes. '
                f'Ignoring {mismatch_row_n} rows'
            )

        self.formulas_df = formulas_df[formulas_df.index.isin(index_intersection)].sort_values(
            by='formula'
        )
        self._centroids_df = centroids_df[centroids_df.index.isin(index_intersection)].sort_values(
            by='mz'
        )

    def centroids_df(self, fixed_size_centroids=False):
        """
        Args
        -----
        fixed_size_centroids: bool
            When True, centroids with mz=0 are preserved

        Return
        -----
            pandas.DataFrame
        """
        if fixed_size_centroids:
            return self._centroids_df
        return self._centroids_df[self._centroids_df.mz > 0]

    def __add__(self, other):
        """Is also used for += operation by Python automatically

        Args
        -----
        other: FormulaCentroids
        """
        assert isinstance(other, FormulaCentroids)
        assert pd.merge(self.formulas_df, other.formulas_df, on='formula').empty

        index_offset = self.formulas_df.index.max() - other.formulas_df.index.min() + 1
        other_formulas_df = other.formulas_df.copy()
        other_formulas_df.index = other_formulas_df.index + index_offset
        other_centroids_df = other.centroids_df().copy()
        other_centroids_df.index = other_centroids_df.index + index_offset

        formulas_df = pd.concat([self.formulas_df, other_formulas_df])
        centroids_df = pd.concat([self._centroids_df, other_centroids_df])
        formulas_df.index.name = (
            centroids_df.index.name
        ) = 'formula_i'  # fix: occasionally pandas looses index name
        return FormulaCentroids(formulas_df, centroids_df)

    def copy(self):
        return FormulaCentroids(
            formulas_df=self.formulas_df.copy(), centroids_df=self._centroids_df.copy()
        )

    def subset(self, formulas):
        formulas = set(formulas)
        miss_formulas = formulas - set(self.formulas_df.formula.values)
        if miss_formulas:
            # Missing formulas requested
            # Also happens when CentroidsGenerator._generate failed to compute formula centroids
            logger.warning(
                f'{len(miss_formulas)} missing formulas ignored: {list(miss_formulas)[:10]}...'
            )

        valid_formulas = formulas - miss_formulas
        subset_formulas_df = self.formulas_df[self.formulas_df.formula.isin(valid_formulas)]
        subset_centroids_df = self._centroids_df[
            self._centroids_df.index.isin(subset_formulas_df.index)
        ]
        return FormulaCentroids(formulas_df=subset_formulas_df, centroids_df=subset_centroids_df)
