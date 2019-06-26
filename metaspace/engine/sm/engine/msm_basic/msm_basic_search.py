from shutil import rmtree
import numpy as np
import pandas as pd
import logging
from pyspark.files import SparkFiles
from pyspark.storagelevel import StorageLevel

from sm.engine.fdr import FDR
from sm.engine.formula_parser import generate_ion_formula, ParseFormulaError
from sm.engine.formula_centroids import CentroidsGenerator
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.util import SMConfig
from sm.engine.msm_basic.formula_imager import create_process_segment
from sm.engine.msm_basic.segmenter import define_ds_segments, segment_spectra, segment_centroids, clip_centroids_df, \
    calculate_centroids_segments_n, spectra_sample_gen, check_spectra_quality, calculate_chunk_sp_n

logger = logging.getLogger('engine')


def init_fdr(fdr_config, isotope_gen_config, moldbs):
    """ Randomly select decoy adducts for each moldb and target adduct
    """
    logger.info('Selecting decoy adducts')
    moldb_fdr_list = []
    for moldb in moldbs:
        fdr = FDR(fdr_config=fdr_config,
                  chem_mods=isotope_gen_config['chem_mods'], 
                  neutral_losses=isotope_gen_config['neutral_losses'], 
                  target_adducts=isotope_gen_config['adducts'])
        fdr.decoy_adducts_selection(moldb.formulas)
        moldb_fdr_list.append((moldb, fdr))
    return moldb_fdr_list


def collect_ion_formulas(moldb_fdr_list):
    """ Collect all ion formulas that need to be searched for
    """
    logger.info('Collecting ion formulas')
    ion_formula_map_list = []
    for moldb, fdr in moldb_fdr_list:
        for formula, adduct in fdr.ion_tuples():
            try:
                ion_formula = generate_ion_formula(formula, adduct)
                ion_formula_map_list.append((moldb.id, ion_formula, formula, adduct))
            except ParseFormulaError:
                pass
            except Exception as e:
                logger.debug(e)
    return pd.DataFrame(ion_formula_map_list,
                        columns=['moldb_id', 'ion_formula', 'formula', 'modifier'])


def compute_fdr(fdr, formula_metrics_df, formula_map_df, max_fdr=0.5):
    """ Compute fdr and filter formulas
    """
    moldb_ion_metrics_df = formula_metrics_df.join(formula_map_df.set_index('ion_formula'),
                                                   on='ion_formula', how='inner')
    formula_fdr_df = fdr.estimate_fdr(moldb_ion_metrics_df.set_index(['formula', 'modifier']).msm)
    moldb_ion_metrics_df = moldb_ion_metrics_df.join(formula_fdr_df, on=['formula', 'modifier'])
    moldb_ion_metrics_df = moldb_ion_metrics_df[moldb_ion_metrics_df.fdr <= max_fdr]

    return moldb_ion_metrics_df


def merge_results(results_rdd, formulas_df):
    formula_metrics_df = pd.concat(results_rdd.map(lambda t: t[0]).collect())
    formula_metrics_df = formula_metrics_df.join(formulas_df, how='left')
    formula_metrics_df = formula_metrics_df.rename({'formula': 'ion_formula'}, axis=1)  # needed for fdr

    formula_images_rdd = results_rdd.flatMap(lambda t: t[1].items())
    return formula_metrics_df, formula_images_rdd


class MSMSearch(object):

    def __init__(self, sc, imzml_parser, moldbs, ds_config, ds_data_path):
        self._sc = sc
        self._ds_config = ds_config
        self._imzml_parser = imzml_parser
        self._moldbs = moldbs
        self._sm_config = SMConfig.get_conf()
        self._ds_data_path = ds_data_path

        self._isotope_gen_config = self._ds_config['isotope_generation']
        self._fdr_config = ds_config['fdr']

    def _fetch_formula_centroids(self, ion_formula_map_df):
        """ Generate/load centroids for all ions formulas
        """
        logger.info('Fetching formula centroids')
        isocalc = IsocalcWrapper(self._isotope_gen_config)
        centroids_gen = CentroidsGenerator(sc=self._sc, isocalc=isocalc)
        ion_formulas = np.unique(ion_formula_map_df.ion_formula.values)
        formula_centroids = centroids_gen.generate_if_not_exist(formulas=ion_formulas.tolist())
        logger.debug(f'Formula centroids df size: {formula_centroids.centroids_df().shape}')
        return formula_centroids

    def process_segments(self, centr_segm_n, func):
        results_rdd = (self._sc.parallelize(range(centr_segm_n), numSlices=centr_segm_n)
                       .map(func)
                       .persist(storageLevel=StorageLevel.MEMORY_AND_DISK))
        return results_rdd

    def select_target_formula_ids(self, formulas_df, ion_formula_map_df, target_modifiers):
        logger.info('Selecting target formula ids')
        target_formulas_mask = ion_formula_map_df.modifier.isin(target_modifiers)
        target_formulas = set(ion_formula_map_df[target_formulas_mask].ion_formula.values)
        target_formula_inds = set(formulas_df[formulas_df.formula.isin(target_formulas)].index)
        return target_formula_inds

    def put_segments_to_workers(self, path):
        logger.debug(f'Adding segment files from local path {path}')
        for file_path in path.iterdir():
            self._sc.addFile(str(file_path))

    def remove_temp_files(self):
        logger.debug(f'Cleaning spark master temp dir {SparkFiles.getRootDirectory()}')
        rmtree(SparkFiles.getRootDirectory(), ignore_errors=True)

        temp_dir_rdd = (self._sc.parallelize(range(self._sc.defaultParallelism))
                        .map(lambda args: SparkFiles.getRootDirectory()))
        logger.debug(f'Cleaning spark workers temp dirs: {set(temp_dir_rdd.collect())}')
        (temp_dir_rdd
         .map(lambda path: rmtree(path, ignore_errors=True))
         .collect())

    def search(self):
        """ Search, score, and compute FDR for all MolDB formulas

        Returns
        -----
            tuple[sm.engine.mol_db.MolecularDB, pandas.DataFrame, pyspark.rdd.RDD]
            (moldb, ion metrics, ion images)
        """
        logger.info('Running molecule search')

        moldb_fdr_list = init_fdr(self._fdr_config, self._isotope_gen_config, self._moldbs)
        ion_formula_map_df = collect_ion_formulas(moldb_fdr_list)
        target_modifiers = set().union(*(fdr.target_modifiers() for moldb, fdr in moldb_fdr_list))

        formula_centroids = self._fetch_formula_centroids(ion_formula_map_df)
        centroids_df = formula_centroids.centroids_df()
        formulas_df = formula_centroids.formulas_df

        target_formula_inds = self.select_target_formula_ids(formulas_df, ion_formula_map_df, target_modifiers)

        logger.info('Reading spectra sample')
        ds_segm_size_mb = 5
        sample_ratio = 0.05
        spectra_sample = list(spectra_sample_gen(self._imzml_parser, sample_ratio))
        sample_mzs = np.concatenate([mzs for sp_id, mzs, ints in spectra_sample])
        sample_ints = np.concatenate([ints for sp_id, mzs, ints in spectra_sample])
        check_spectra_quality(sample_mzs, sample_ints)

        total_mz_n = sample_mzs.shape[0] / sample_ratio
        ds_segments = define_ds_segments(sample_mzs, total_mz_n,
                                         self._imzml_parser.mzPrecision, ds_segm_size_mb)

        sample_sp_n = int(len(self._imzml_parser.coordinates) * sample_ratio)
        chunk_sp_n = calculate_chunk_sp_n(sample_mzs.nbytes, sample_sp_n)

        ds_segments_path = self._ds_data_path / 'ds_segments'
        coordinates = [coo[:2] for coo in self._imzml_parser.coordinates]
        segment_spectra(self._imzml_parser, coordinates, chunk_sp_n, ds_segments, ds_segments_path)

        logger.info('Putting segments to workers')
        self.put_segments_to_workers(ds_segments_path)

        centr_df = clip_centroids_df(centroids_df, mz_min=ds_segments[0, 0], mz_max=ds_segments[-1, 1])

        centr_segments_path = self._ds_data_path / 'centr_segments'
        centr_segm_n = calculate_centroids_segments_n(centr_df, ds_segments, ds_segm_size_mb)
        segment_centroids(centr_df, centr_segm_n, centr_segments_path)

        logger.info('Putting centroids segments to workers')
        self.put_segments_to_workers(centr_segments_path)

        logger.info('Processing segments...')
        process_centr_segment = create_process_segment(ds_segments, coordinates,
                                                       self._ds_config, target_formula_inds)
        results_rdd = self.process_segments(centr_segm_n, process_centr_segment)
        formula_metrics_df, formula_images_rdd = merge_results(results_rdd, formula_centroids.formulas_df)

        self.remove_temp_files()

        # Compute fdr for each moldb search results
        for moldb, fdr in moldb_fdr_list:
            moldb_formula_map_df = (ion_formula_map_df[ion_formula_map_df.moldb_id == moldb.id]
                                    .drop('moldb_id', axis=1))
            moldb_fdrs_df = compute_fdr(fdr, formula_metrics_df, moldb_formula_map_df, max_fdr=0.5)
            moldb_ion_images_rdd = formula_images_rdd.filter(lambda kv: kv[0] in moldb_fdrs_df.index)
            moldb_ion_metrics_df = moldb_fdrs_df.merge(fdr.target_modifiers_df, left_on='modifier', right_index=True)

            yield moldb, moldb_ion_metrics_df, moldb_ion_images_rdd
