import argparse
from functools import partial
from os.path import join
import os
import sys
from pathlib import Path
from pprint import pprint

import numpy as np

from sm.engine.annotation_lithops.annotation_job import ServerAnnotationJob
from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_spark.annotation_job import AnnotationJob
from sm.engine.db import DB
from sm.engine.image_store import ImageStoreServiceWrapper
from sm.engine.util import proj_root, create_ds_from_files, bootstrap_and_run
from sm.engine.utils.perf_profile import NullProfiler

SEARCH_RES_SELECT = (
    "SELECT m.formula, m.adduct, m.stats "
    "FROM annotation m "
    "JOIN job j ON j.id = m.job_id "
    "WHERE j.ds_id = %s "
    "ORDER BY formula, adduct "
)


class SciTester:
    def __init__(self, sm_config):
        self.sm_config = sm_config
        self.db = DB()

        self.ds_id = '2000-01-01_00h00m01s'
        self.base_search_res_path = join(
            proj_root(), 'tests/reports', 'spheroid_untreated_search_res.csv'
        )
        self.ds_name = 'sci_test_spheroid_untreated'
        self.ds_data_path = join(self.sm_config['fs']['spark_data_path'], self.ds_name)
        self.input_path = join(proj_root(), 'tests/data/untreated')
        self.ds_config_path = join(self.input_path, 'config.json')
        self.metrics = ['chaos', 'spatial', 'spectral']

    def metr_dict_to_array(self, metr_d):
        metric_array = np.array([metr_d[m] for m in self.metrics])
        return np.hstack([metric_array, metric_array.prod()])

    def read_base_search_res(self):
        def prep_metric_arrays(a):
            return np.array(a, dtype=float)

        with open(self.base_search_res_path) as f:
            rows = map(lambda line: line.strip('\n').split('\t'), f.readlines()[1:])
            return {(r[0], r[1]): prep_metric_arrays(r[2:]) for r in rows}

    def fetch_search_res(self):
        rows = self.db.select(SEARCH_RES_SELECT, params=(self.ds_id,))
        return {(r[0], r[1]): self.metr_dict_to_array(r[2]) for r in rows}

    def save_sci_test_report(self):
        with open(self.base_search_res_path, 'w') as f:
            f.write('\t'.join(['formula', 'adduct'] + self.metrics) + '\n')
            for (formula, adduct), metrics in sorted(self.fetch_search_res().items()):
                f.write('\t'.join([formula, adduct] + metrics.astype(str).tolist()) + '\n')

        print('Successfully saved sample dataset search report')

    @staticmethod
    def print_metric_hist(metric_arr, bins=10):
        metric_freq, metric_interv = np.histogram(metric_arr, bins=np.linspace(-1, 1, 21))
        metric_interv = [round(x, 2) for x in metric_interv]
        pprint(list(zip(zip(metric_interv[:-1], metric_interv[1:]), metric_freq)))

    def report_metric_differences(self, metrics_array):
        metrics_array = np.array(metrics_array)
        print("\nCHAOS HISTOGRAM")
        self.print_metric_hist(metrics_array[:, 0])
        print("\nIMG_CORR HISTOGRAM")
        self.print_metric_hist(metrics_array[:, 1])
        print("\nPAT_MATCH HISTOGRAM")
        self.print_metric_hist(metrics_array[:, 2])
        print("\nMSM HISTOGRAM")
        self.print_metric_hist(metrics_array[:, 3])

    def _missed_formulas(self, old, new):
        missed_sf_adduct = set(old.keys()) - set(new.keys())
        print('MISSED FORMULAS: {:.1f}%'.format(len(missed_sf_adduct) / len(old) * 100))
        if missed_sf_adduct:
            missed_sf_base_metrics = np.array([old[k] for k in missed_sf_adduct])
            self.report_metric_differences(missed_sf_base_metrics)
        return bool(missed_sf_adduct)

    def _false_discovery(self, old, new):
        new_sf_adduct = set(new.keys()) - set(old.keys())
        print('\nFALSE DISCOVERY: {:.1f}%'.format(len(new_sf_adduct) / len(old) * 100))

        if new_sf_adduct:
            for sf_adduct in new_sf_adduct:
                metrics = new[sf_adduct]
                print('{} metrics = {}'.format(sf_adduct, metrics))
        return bool(new_sf_adduct)

    def _metrics_diff(self, old, new):
        print('\nDIFFERENCE IN METRICS:')
        metric_diffs = []
        for b_sf_add, b_metr in old.items():
            if b_sf_add in new.keys():
                metr = new[b_sf_add]
                diff = b_metr - metr
                if np.any(np.abs(diff) > 1e-6):
                    metric_diffs.append(diff)
                    print('{} metrics diff = {}'.format(b_sf_add, diff))

        if metric_diffs:
            self.report_metric_differences(metric_diffs)
        return bool(metric_diffs)

    def search_results_are_different(self):
        old_search_res = self.read_base_search_res()
        search_res = self.fetch_search_res()
        return (
            self._missed_formulas(old_search_res, search_res)
            or self._false_discovery(old_search_res, search_res)
            or self._metrics_diff(old_search_res, search_res)
        )

    def _create_img_store_mock(self):
        class ImageStoreMock:
            def post_image(self, *args):
                return None

            def delete_image_by_id(self, *args):
                return None

        return ImageStoreMock()

    def run_search(self, mock_img_store=False, lithops=False):
        if mock_img_store:
            img_store = self._create_img_store_mock()
        else:
            img_store = ImageStoreServiceWrapper(self.sm_config['services']['img_service_url'])

        os.environ['PYSPARK_PYTHON'] = sys.executable

        ds = create_ds_from_files(self.ds_id, self.ds_name, self.input_path)
        self.db.alter('DELETE FROM job WHERE ds_id=%s', params=(ds.id,))
        ds.save(self.db, allow_insert=True)
        perf = NullProfiler()
        if lithops:
            executor = Executor(self.sm_config['lithops'], perf)
            ServerAnnotationJob(executor, img_store, ds, perf, self.sm_config, use_cache=False).run(
                debug_validate=True
            )
        else:
            AnnotationJob(img_store, ds, perf).run()

    def clear_data_dirs(self):
        path = Path(self.ds_data_path)
        if path.exists():
            path.rmdir()


def run(sm_config, *, mock_img_store, lithops):
    sci_tester = SciTester(sm_config)
    run_search_successful = False
    search_results_different = False
    try:
        sci_tester.run_search(mock_img_store, lithops)
        run_search_successful = True
        search_results_different = sci_tester.search_results_are_different()
    except Exception as e:
        if not run_search_successful:
            raise Exception('Search was not successful!') from e
        elif search_results_different:
            raise Exception('Search was successful but the results are different!') from e
    finally:
        sci_tester.clear_data_dirs()


def save(sm_config, *args):
    if 'y' == input('You are going to replace the reference values. Are you sure? (y/n): '):
        SciTester(sm_config).save_sci_test_report()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scientific tests runner')
    parser.add_argument(
        '-r', '--run', action='store_true', help='compare current search results with previous'
    )
    parser.add_argument('-s', '--save', action='store_true', help='store current search results')
    parser.add_argument(
        '--config',
        dest='sm_config_path',
        default=join(proj_root(), 'conf/config.json'),
        help='path to sm config file',
    )
    parser.add_argument(
        '--mock-img-store', action='store_true', help='whether to mock the Image Store Service'
    )
    parser.add_argument(
        '--lithops', action='store_true', help='whether to use the Lithops executor'
    )
    args = parser.parse_args()

    if args.run:
        bootstrap_and_run(
            args.sm_config_path,
            partial(run, mock_img_store=args.mock_img_store, lithops=args.lithops),
        )
    elif args.save:
        bootstrap_and_run(args.sm_config_path, save)
    else:
        parser.print_help()
