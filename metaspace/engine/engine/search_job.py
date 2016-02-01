"""
.. module::
    :synopsis:

.. moduleauthor:: Vitaly Kovalev <intscorpio@gmail.com>
"""
from pyspark import SparkContext, SparkConf
from os.path import join, realpath, dirname
import json
from pprint import pformat

from engine.db import DB
from engine.dataset import Dataset
from engine.formulas import Formulas
from engine.search_results import SearchResults
from engine.formula_imager import sample_spectra, compute_sf_peak_images, compute_sf_images
from engine.formula_img_validator import filter_sf_images
from engine.theor_peaks_gen import TheorPeaksGenerator
from engine.imzml_txt_converter import ImzmlTxtConverter
from engine.work_dir import WorkDir
from engine.util import local_path, hdfs_path, proj_root, hdfs_prefix, cmd_check, cmd, SMConfig, logger


ds_id_sql = "SELECT id FROM dataset WHERE name = %s"
db_id_sql = "SELECT id FROM formula_db WHERE name = %s"
max_ds_id_sql = "SELECT COALESCE(MAX(id), -1) FROM dataset"


class SearchJob(object):
    """ Main class responsible for molecule search. Uses other modules of the engine.

    Args
    ----------
    ds_name : string
        A dataset short name
    """
    def __init__(self, ds_name):
        self.sm_config = SMConfig.get_conf()
        self.ds_name = ds_name
        self.ds_id = None
        self.job_id = None
        self.sc = None
        self.ds = None
        self.formulas = None
        self.ds_config = None
        self.work_dir = None

    def _read_config(self):
        with open(self.work_dir.ds_config_path) as f:
            self.ds_config = json.load(f)

    def _configure_spark(self):
        logger.info('Configuring Spark')
        sconf = SparkConf()
        for prop, value in self.sm_config['spark'].iteritems():
            if prop.startswith('spark.'):
                sconf.set(prop, value)

        self.sc = SparkContext(master=self.sm_config['spark']['master'], conf=sconf, appName='SM engine')
        if not self.sm_config['spark']['master'].startswith('local'):
            self.sc.addPyFile(join(local_path(proj_root()), 'engine.zip'))

    def _choose_ds_job_id(self):
        ds_id_row = self.db.select_one(ds_id_sql, self.ds_name)
        if ds_id_row:
            self.ds_id = ds_id_row[0]
        else:
            self.ds_id = self.db.select_one(max_ds_id_sql)[0] + 1
        # TODO: decide if we need both db_id and job_id
        self.job_id = self.ds_id

    def _init_db(self):
        logger.info('Connecting to the DB')
        self.db = DB(self.sm_config['db'])
        self.sf_db_id = self.db.select_one(db_id_sql, self.ds_config['inputs']['database'])[0]
        self._choose_ds_job_id()

    def run(self, input_path, clean=False):
        """ Entry point of the engine. Molecule search is completed in several steps:
         * Copying input data to the engine work dir
         * Conversion input data (imzML+ibd) to plain text format. One line - one spectrum data
         * Generation and saving to the database theoretical peaks for all formulas from the molecule database
         * Molecules search. The most compute intensive part. Spark is used to run it in distributed manner.
         * Saving results (isotope images and their metrics of quality for each putative molecule) to the database

        Args
        -------
        input_path : string
            Path to the dataset folder with .imzML, .ibd and config.json files
        clean : bool
            Clean all interim data files before starting molecule search
        """
        self.work_dir = WorkDir(self.ds_name, self.sm_config['fs']['data_dir'])
        if clean:
            self.work_dir.del_work_dir()
        self.work_dir.copy_input_data(input_path)
        self._read_config()
        logger.info('Dataset config:\n%s', pformat(self.ds_config))

        self._configure_spark()
        self._init_db()

        imzml_converter = ImzmlTxtConverter(self.ds_name, self.work_dir.imzml_path,
                                            self.work_dir.txt_path, self.work_dir.coord_path)
        imzml_converter.convert()
        self._copy_txt_to_hdfs(self.work_dir.txt_path, self.work_dir.txt_path)

        self.ds = Dataset(self.sc, self.work_dir.txt_path, self.work_dir.coord_path)

        theor_peaks_gen = TheorPeaksGenerator(self.sc, self.sm_config, self.ds_config)
        theor_peaks_gen.run()
        self.formulas = Formulas(self.ds_config, self.db)

        search_results = self._search()
        self._store_results(search_results)

        self.db.close()

    def _search(self):
        logger.info('Running molecule search')
        sf_sp_intens = sample_spectra(self.sc, self.ds, self.formulas)
        sf_peak_imgs = compute_sf_peak_images(self.ds, sf_sp_intens)
        sf_images = compute_sf_images(sf_peak_imgs)
        sf_iso_images_map, sf_metrics_map = filter_sf_images(self.sc, self.ds_config, self.ds, self.formulas, sf_images)

        return SearchResults(self.sf_db_id, self.ds_id, self.job_id,
                             sf_iso_images_map, sf_metrics_map,
                             self.formulas.get_sf_adduct_peaksn(),
                             self.db)

    def _copy_txt_to_hdfs(self, localpath, hdfspath):
        if not self.sm_config['fs']['local']:
            logger.info('Coping DS text file to HDFS...')
            return_code = cmd(hdfs_prefix() + '-test -e {}', hdfs_path(self.work_dir.path))
            if return_code:
                cmd_check(hdfs_prefix() + '-mkdir -p {}', hdfs_path(self.work_dir.path))
                cmd_check(hdfs_prefix() + '-copyFromLocal {} {}', local_path(localpath), hdfs_path(hdfspath))

    def _store_results(self, search_results):
        logger.info('Storing search results to the DB')
        search_results.clear_old_results()
        search_results.store_job_meta()
        search_results.store_sf_img_metrics()
        nrows, ncols = self.ds.get_dims()
        search_results.store_sf_iso_images(nrows, ncols)
