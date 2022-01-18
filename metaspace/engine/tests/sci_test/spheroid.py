import argparse
from datetime import datetime
from os.path import join
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlretrieve

import numpy as np
import pandas as pd
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from sm.engine import image_storage, molecular_db
from sm.engine.annotation.scoring_model import (
    upload_catboost_scoring_model,
    save_scoring_model_to_db,
)
from sm.engine.annotation_lithops.annotation_job import ServerAnnotationJob
from sm.engine.annotation_lithops.executor import Executor
import sm.engine.annotation_lithops.executor as lithops_executor
from sm.engine.annotation_spark.annotation_job import AnnotationJob
from sm.engine.db import DB
from sm.engine.errors import SMError
from sm.engine.tests.db_sql_schema import DB_SQL_SCHEMA
from sm.engine.util import GlobalInit
from sm.engine.config import proj_root, SMConfig
from sm.engine.utils.create_ds_from_files import create_ds_from_files
from sm.engine.utils.perf_profile import NullProfiler

MOL_DBS = {
    'hmdb': {
        'name': 'HMDB',
        'version': 'v4',
        'url': 'https://sm-engine.s3-eu-west-1.amazonaws.com/tests/hmdb_4.tsv',
    },
    'cm3': {
        'name': 'CoreMetabolome',
        'version': 'v3',
        'url': 'https://s3-eu-west-1.amazonaws.com/sm-mol-db/db_files_2021/core_metabolome/core_metabolome_v3.csv',
    },
}


class SciTester:
    def __init__(self, sm_config, analysis_version, database):
        reports_path = Path(proj_root()) / 'tests/reports'
        timestamp = datetime.now().replace(microsecond=0).isoformat().replace(':', '-')
        suffix = f'{database}-v{analysis_version}'

        self.sm_config = sm_config
        self.db = DB()

        self.ds_id = '2000-01-01_00h00m01s'
        self.ref_results_path = reports_path / f'spheroid-{suffix}.csv'
        self.output_results_path = reports_path / f'test-{suffix}-{timestamp}.csv'

        self.ds_name = 'sci_test_spheroid_untreated'
        self.ds_data_path = join(self.sm_config['fs']['spark_data_path'], self.ds_name)
        self.moldb = MOL_DBS[database]
        self.analysis_version = analysis_version
        self.input_path = join(proj_root(), 'tests/data/untreated')
        self.ds_config_path = join(self.input_path, 'config.json')
        self.metrics = ['chaos', 'spatial', 'spectral', 'mz_err_abs', 'mz_err_rel', 'msm', 'fdr']

        self.comparison_df = None

    def fetch_search_res_df(self):
        query = (
            "SELECT m.formula, m.adduct, m.msm, m.fdr, m.stats "
            "FROM annotation m "
            "JOIN job j ON j.id = m.job_id "
            "WHERE j.ds_id = %s "
            "ORDER BY formula, adduct "
        )

        rows = self.db.select_with_fields(query, params=(self.ds_id,))
        return pd.DataFrame(
            [
                {
                    'formula': r['formula'],
                    'adduct': r['adduct'],
                    'msm': r['msm'],
                    'fdr': r['fdr'],
                    **r['stats'],
                }
                for r in rows
            ]
        )

    def save_reference_results(self):
        results_df = self.fetch_search_res_df()

        cols = ['formula', 'adduct', *self.metrics]
        results_df[cols].to_csv(self.ref_results_path, index=False)

        print(f'Successfully saved reference search results to {self.ref_results_path}')

    def save_comparison_results(self):
        self.comparison_df.to_csv(self.output_results_path, index=False)

    @staticmethod
    def print_metric_hist(metric_vals):
        if 0.2 < np.max(metric_vals) - np.min(metric_vals) <= 3.0:
            # For metrics in the range -1.0 to 1.0, aligned bins of 0.1 are easier to read
            min_edge = np.floor(np.min(metric_vals) * 10) / 10
            max_edge = np.ceil(np.max(metric_vals) * 10) / 10
            n_bins = int(np.round((max_edge - min_edge) * 10))
        else:
            # Otherwise use unaligned bins
            min_edge = np.min(metric_vals)
            max_edge = np.max(metric_vals)
            n_bins = 10
        bins = np.linspace(min_edge, max_edge, n_bins + 1)
        metric_freq, metric_interv = np.histogram(metric_vals, bins=bins)

        for lo, hi, freq in zip(metric_interv[:-1], metric_interv[1:], metric_freq):
            print(f'{lo:f}-{hi:f}: {freq}')

    def print_differences(self):
        df = self.comparison_df
        missing_df = df[df.matching == 'ref_only']
        unexpected_df = df[df.matching == 'new_only']
        common_df = df[df.matching == '']
        n_ref = df.matching.isin({'ref_only', ''}).count()
        n_new = df.matching.isin({'new_only', ''}).count()

        print(f'MISSED FORMULAS: {len(missing_df)} ({len(missing_df) * 100 / n_ref:.1f}%)')
        print(f'FALSE DISCOVERY: {len(unexpected_df)} ({len(unexpected_df) * 100 / n_new:.1f}%)')

        differing_metrics = [
            metric for metric in self.metrics if common_df[f'{metric}_differs'].any()
        ]
        if differing_metrics:
            for metric in differing_metrics:
                print(f'{metric}_new - {metric}_ref histogram: ')
                self.print_metric_hist(common_df[f'{metric}_new'] - common_df[f'{metric}_ref'])
                print()
        else:
            print('All metrics equal in common annotations')

    def fdr_differs(self, fdr_ref, fdr_new):
        if self.analysis_version == 1:
            # FDRs are quantized - allow them to jump up/down one level
            levels = [0.0501, 0.1001, 0.2001, 0.5001]
            ref_level = next((i for i, level in enumerate(levels) if fdr_ref < level), len(levels))
            new_level = next((i for i, level in enumerate(levels) if fdr_new < level), len(levels))
            return abs(ref_level - new_level) > 1
        else:
            # Allow +/- 10% difference
            return abs(fdr_ref - fdr_new) > fdr_ref * 0.1

    def make_comparison_df(self):
        ref_results = pd.read_csv(self.ref_results_path)
        new_results = self.fetch_search_res_df()

        df = ref_results.merge(
            new_results,
            on=['formula', 'adduct'],
            how='outer',
            suffixes=('_ref', '_new'),
            indicator='matching',
        )
        df['matching'] = df.matching.cat.rename_categories(
            {'left_only': 'ref_only', 'right_only': 'new_only', 'both': ''}
        )

        # Interleave columns for easy side-by-side comparison
        cols = ['formula', 'adduct', 'matching']
        for col in self.metrics:
            cols.append(f'{col}_ref')
            cols.append(f'{col}_new')
        df = df[cols]

        # Add "differs" fields indicating whether the values have changed enough to be considered
        # different from the originals.
        for col in self.metrics:
            if col == 'fdr':
                df[f'fdr_differs'] = [
                    self.fdr_differs(row.fdr_ref, row.fdr_new)
                    for row in df[['fdr_ref', 'fdr_new']].itertuples()
                ]
            else:
                df[f'{col}_differs'] = ~np.isclose(df[f'{col}_ref'], df[f'{col}_new'])

        self.comparison_df = df

    def search_results_are_different(self):
        annotations_mismatch = (self.comparison_df.matching != '').any()
        metrics_differ = any(
            self.comparison_df[f'{metric}_differs'].any() for metric in self.metrics
        )
        return annotations_mismatch or metrics_differ

    @classmethod
    def _patch_image_storage(cls):
        class ImageStorageMock:
            ISO = image_storage.ISO

            def __init__(self, *args, **kwargs):
                pass

            def post_image(self, *args, **kwargs):
                pass

        from sm.engine.annotation_spark import search_results

        search_results.ImageStorage = ImageStorageMock

    def run_search(self, store_images=False, use_lithops=False):
        if not store_images:
            self._patch_image_storage()

        moldb_id = molecular_db.find_by_name_version(self.moldb['name'], self.moldb['version']).id

        os.environ['PYSPARK_PYTHON'] = sys.executable

        ds = create_ds_from_files(self.ds_id, self.ds_name, self.input_path)
        ds.config['analysis_version'] = self.analysis_version
        ds.config['fdr']['scoring_model'] = 'v3_default' if self.analysis_version > 1 else None
        ds.config['database_ids'] = [moldb_id]

        self.db.alter('DELETE FROM job WHERE ds_id=%s', params=(ds.id,))
        ds.save(self.db, allow_insert=True)
        perf = NullProfiler()
        if use_lithops:
            # Override the runtime to force it to run without docker.
            lithops_executor.RUNTIME_DOCKER_IMAGE = 'python'

            executor = Executor(self.sm_config['lithops'], perf)
            job = ServerAnnotationJob(
                executor,
                ds,
                perf,
                self.sm_config,
                store_images=store_images,
            )
            job.run(debug_validate=True)
        else:
            AnnotationJob(ds, perf).run()

        self.make_comparison_df()

    def clear_data_dirs(self):
        path = Path(self.ds_data_path)
        if path.exists():
            path.rmdir()


def run(
    sm_config,
    analysis_version,
    database,
    store_images,
    use_lithops,
    save_reference,
    save_comparison,
):
    sci_tester = SciTester(sm_config, analysis_version, database)
    run_search_successful = False
    search_results_different = False
    try:
        sci_tester.run_search(store_images, use_lithops)
        sci_tester.print_differences()
        run_search_successful = True
        if save_reference:
            sci_tester.save_reference_results()

        search_results_different = sci_tester.search_results_are_different()
        assert not search_results_different

        if save_comparison:
            sci_tester.save_comparison_results()

    except Exception as e:
        if not run_search_successful:
            raise Exception('Search was not successful!') from e
        elif search_results_different:
            sci_tester.save_comparison_results()
            raise Exception('Search was successful but the results are different!') from e
        else:
            raise
    finally:
        sci_tester.clear_data_dirs()


def ensure_db_exists(sm_config):
    db_config = sm_config['db']
    try:
        with psycopg2.connect(**db_config):
            pass
    except psycopg2.OperationalError as ex:
        if 'does not exist' in str(ex):
            db_name = db_config['database']
            db_owner = db_config['user']

            print(f'Creating database {db_name}')
            # Connect to postgres database so that the configured DB can be created
            with psycopg2.connect(**{**db_config, 'database': 'postgres'}) as conn:
                conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
                with conn.cursor() as curs:
                    curs.execute(f'CREATE DATABASE {db_name} OWNER {db_owner}')


def ensure_db_populated(sm_config, analysis_version, database):
    db = DB()
    # Install DB schema if needed
    query = "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dataset'"
    tables_exist = db.select_one(query)[0] >= 1
    if not tables_exist:
        print('Installing DB schema')
        db.alter(DB_SQL_SCHEMA)

    # Import HMDB if needed
    moldb = MOL_DBS[database]
    try:
        molecular_db.find_by_name_version(moldb['name'], moldb['version'])
    except SMError:
        print(f'Importing {database}')
        with TemporaryDirectory() as tmp:
            urlretrieve(moldb['url'], f'{tmp}/moldb.tsv')
            molecular_db.create(moldb['name'], moldb['version'], f'{tmp}/moldb.tsv')

    if analysis_version > 1:
        if len(db.select("SELECT name FROM scoring_model WHERE name = 'v3_default'")) == 0:
            print("Importing v3_default scoring model")
            params = upload_catboost_scoring_model(
                model=Path(proj_root())
                / '../scoring-models/v3_default/model-2022-01-05T13-45-26.947188-416b1311.cbm',
                bucket=sm_config['lithops']['lithops']['storage_bucket'],
                prefix=f'test_scoring_models/v3_default',
                is_public=False,
            )
            save_scoring_model_to_db(name='v3_default', type_='catboost', params=params)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Scientific tests runner\n'
        'Example: python tests/sci_test/spheroid.py'
        'or: python tests/sci_test/spheroid.py --lithops --analysis-version 3'
    )
    parser.add_argument(
        '--save', action='store_true', help='save comparison report even on success'
    )
    parser.add_argument('--save-ref', action='store_true', help='update reference results')
    parser.add_argument(
        '--config',
        dest='sm_config_path',
        default=join(proj_root(), 'conf/scitest_config.json'),
        help='path to sm config file',
    )
    parser.add_argument(
        '--store-images',
        action='store_true',
        help='whether to store ion images. (Default: don\'t store)',
    )
    parser.add_argument(
        '--lithops',
        action='store_true',
        help='whether to use the Lithops executor. (Default: use Spark executor)',
    )
    parser.add_argument(
        '--analysis-version', type=int, default=1, help='which pipeline analysis_version to use'
    )
    parser.add_argument(
        '--database',
        default='hmdb',
        help='which database to use (hmdb or cm3)',
        choices=MOL_DBS.keys(),
    )
    args = parser.parse_args()

    if args.save_ref:
        sure = input('This will overwrite the reference values. Are you sure? [Y/n]: ').lower()
        if sure not in ('y', ''):
            print('Aborting')
            exit(1)

    # Need to ensure test DB exists before GlobalInit is called
    SMConfig.set_path(args.sm_config_path)
    ensure_db_exists(SMConfig.get_conf())

    with GlobalInit(config_path=args.sm_config_path) as sm_config:
        ensure_db_populated(sm_config, args.analysis_version, args.database)

        run(
            sm_config=sm_config,
            analysis_version=args.analysis_version,
            database=args.database,
            store_images=args.store_images,
            use_lithops=args.lithops,
            save_reference=args.save_ref,
            save_comparison=args.save,
        )
