import argparse
from os.path import join
from pprint import pprint
import numpy as np

from fabric.api import local
from fabric.context_managers import warn_only

from sm.engine.es_export import ESExporter
from sm.engine.sm_daemons import SMDaemonManager
from sm.engine.db import DB
from sm.engine.mol_db import MolDBServiceWrapper
from sm.engine.png_generator import ImageStoreServiceWrapper
from sm.engine.util import proj_root, SMConfig, create_ds_from_files, init_loggers

SEARCH_RES_SELECT = ("select m.sf, m.adduct, m.stats "
                     "from iso_image_metrics m "
                     "join job j on j.id = m.job_id "
                     "join dataset ds on ds.id = j.ds_id "
                     "where m.db_id = %s AND ds.name = %s "
                     "ORDER BY sf, adduct ")


class SciTester(object):

    def __init__(self, sm_config_path):
        self.sm_config_path = sm_config_path
        self.sm_config = SMConfig.get_conf()
        self.db = DB(self.sm_config['db'])

        self.ds_id = '2000-01-01-00_00_00'
        self.base_search_res_path = join(proj_root(), 'tests/reports', 'spheroid_untreated_search_res.csv')
        self.ds_name = 'sci_test_spheroid_untreated'
        self.data_dir_path = join(self.sm_config['fs']['base_path'], self.ds_name)
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
            return {(r[0], r[1]):  prep_metric_arrays(r[2:]) for r in rows}

    def fetch_search_res(self):
        mol_db_service = MolDBServiceWrapper(self.sm_config['services']['mol_db'])
        mol_db_id = mol_db_service.find_db_by_name_version('HMDB-v2.5')[0]['id']
        rows = self.db.select(SEARCH_RES_SELECT, params=(mol_db_id, self.ds_name))
        return {(r[0], r[1]): self.metr_dict_to_array(r[2]) for r in rows}

    def save_sci_test_report(self):
        with open(self.base_search_res_path, 'w') as f:
            f.write('\t'.join(['sf', 'adduct'] + self.metrics) + '\n')
            for (sf, adduct), metrics in sorted(self.fetch_search_res().items()):
                f.write('\t'.join([sf, adduct] + metrics.astype(str).tolist()) + '\n')

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
        return (self._missed_formulas(old_search_res, search_res) or
                self._false_discovery(old_search_res, search_res) or
                self._metrics_diff(old_search_res, search_res))

    def _create_img_store_mock(self):

        class ImageStoreMock(object):
            def post_image(self, *args):
                return None

            def delete_image_by_id(self, *args):
                return None

        return ImageStoreMock()

    def run_search(self, mock_img_store=False):
        if mock_img_store:
            img_store = self._create_img_store_mock()
        else:
            img_store = ImageStoreServiceWrapper(self.sm_config['services']['img_service_url'])
        manager = SMDaemonManager(db=self.db, es=ESExporter(self.db),
                                 img_store=img_store)

        ds = create_ds_from_files(self.ds_id, self.ds_name, self.input_path)
        from sm.engine.search_job import SearchJob
        manager.annotate(ds, search_job_factory=SearchJob, del_first=True)

    def clear_data_dirs(self):
        with warn_only():
            local('rm -rf {}'.format(self.data_dir_path))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scientific tests runner')
    parser.add_argument('-r', '--run', action='store_true', help='compare current search results with previous')
    parser.add_argument('-s', '--save', action='store_true', help='store current search results')
    parser.add_argument('--config', dest='sm_config_path',
                        default=join(proj_root(), 'conf/config.json'),
                        help='path to sm config file')
    parser.add_argument('--mock-img-store', action='store_true', help='whether to mock the Image Store Service')
    args = parser.parse_args()

    SMConfig.set_path(args.sm_config_path)
    init_loggers(SMConfig.get_conf()['logs'])

    sci_tester = SciTester(args.sm_config_path)

    if args.run:
        run_search_successful = False
        search_results_different = False
        try:
            sci_tester.run_search(args.mock_img_store)
            run_search_successful = True
            search_results_different = sci_tester.search_results_are_different()
        except Exception as e:
            if not run_search_successful:
                raise Exception('Search was not successful!') from e
            elif search_results_different:
                raise Exception('Search was successful but the results are different!') from e
        finally:
            sci_tester.clear_data_dirs()

    elif args.save:
        if 'y' == input('You are going to replace the reference values. Are you sure? (y/n): '):
            sci_tester.save_sci_test_report()
    else:
        parser.print_help()
