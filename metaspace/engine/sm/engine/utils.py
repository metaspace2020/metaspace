import logging
import os
import sys
from shutil import rmtree
import numpy as np
import pandas as pd

from pyspark.conf import SparkConf
from pyspark.context import SparkContext
from pyspark.sql.session import SparkSession

from sm.engine.db import DB
from sm.engine.formula_centroids import CentroidsGenerator
from sm.engine.isocalc_wrapper import IsocalcWrapper
from sm.engine.mol_db import MolDBServiceWrapper, MolecularDB
from sm.engine.msm_basic.formula_imager_segm import gen_iso_images
from sm.engine.msm_basic.formula_img_validator import formula_image_metrics, make_compute_image_metrics
from sm.engine.util import init_loggers

init_loggers()
logger = logging.getLogger('annotate-daemon')


def create_spark_context(sc=None, cores='*'):
    os.environ.setdefault('PYSPARK_PYTHON', sys.executable)

    sconf = SparkConf()
    sconf.set('spark.sql.execution.arrow.enabled', True)
    sconf.set('spark.executor.memory', '2g')
    sconf.set('spark.driver.memory', '4g')
    sconf.set("spark.driver.maxResultSize", "3g")
    sconf.set("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
    sconf.set("spark.kryoserializer.buffer.max", "512m")
    sconf.set("spark.executor.pyspark.memory", "1g")
    sconf.set("spark.python.worker.memory", "1g")
    sconf.set("spark.rdd.compress", True)

    if sc:
        sc.stop()
    sc = SparkContext(master=f'local[{cores}]', appName='sm engine notebook', conf=sconf)
    spark_session = SparkSession(sc)
    return sc, spark_session


def fetch_moldbs(sm_config, iso_gen_config):
    db = DB(sm_config['db'])
    moldb_service = MolDBServiceWrapper(sm_config['services']['mol_db'])
    moldb_id = moldb_service.find_db_by_name_version('HMDB-v4')[0]['id']
    moldbs = [MolecularDB(id=moldb_id, db=db, iso_gen_config=iso_gen_config)]
    return moldbs


def gen_formula_centroids(sc, iso_gen_config, ion_formulas):
    isocalc = IsocalcWrapper(iso_gen_config)
    centroids_gen = CentroidsGenerator(sc=sc, isocalc=isocalc)
    formula_centroids = centroids_gen.generate_if_not_exist(formulas=ion_formulas.tolist())
    # centroids_df = formula_centroids.centroids_df()
    return formula_centroids


def ds_sample_gen(imzml_parser, sp_n, sample_ratio=0.05, max_sample_size=1000):
    sample_size = min(max_sample_size, int(sp_n * sample_ratio))
    sample_sp_inds = np.random.choice(np.arange(sp_n), sample_size)
    for sp_idx in sample_sp_inds:
        mzs, ints = imzml_parser.getspectrum(sp_idx)
        yield sp_idx, mzs, ints


def define_mz_segments(imzml_parser, centroids_df, sample_ratio=0.05, mz_overlap=8, ppm=3):

    def optimal_segm_n(total_n_mz, mz_per_segm, min_i, max_i):
        n = round(total_n_mz / mz_per_segm)
        i = np.argmin([abs(n - 2 ** i) for i in range(min_i, max_i)])
        return 2 ** (min_i + i)

    def bounds_to_segments(segm_bounds):
        mz_segments = []
        for i, (l, r) in enumerate(zip(segm_bounds[:-1],
                                       segm_bounds[1:])):
            l -= mz_overlap / 2 + l * ppm * 1e-6
            r += mz_overlap / 2 + r * ppm * 1e-6
            mz_segments.append((l, r))
        return mz_segments

    sp_n = len(imzml_parser.coordinates)
    sample_sp_gen = ds_sample_gen(imzml_parser, sp_n, sample_ratio)
    min_mzs, max_mzs, n_mzs = zip(*((mzs[0], mzs[-1], len(mzs)) for (sp_id, mzs, ints) in sample_sp_gen))
    min_mz, max_mz, n_mz = min(min_mzs), max(max_mzs), sum(n_mzs)

    total_n_mz = n_mz * 1 / sample_ratio
    segm_n = optimal_segm_n(total_n_mz, mz_per_segm=5e5, min_i=4, max_i=8)

    centr_mzs = centroids_df[(centroids_df.mz > min_mz) & (centroids_df.mz < max_mz)].mz.values

    segm_bounds_q = [i * 1 / segm_n for i in range(0, segm_n + 1)]
    segm_bounds = [np.quantile(centr_mzs, q) for q in segm_bounds_q]

    segments = bounds_to_segments(segm_bounds)
    logger.info(f'Generated {len(segments)} m/z segments: {segments[0]}...{segments[-1]}')
    return np.array(segments)


def segment_centroids(centr_df, mz_segments, centr_segm_path):
    logger.info(f'Segmenting centroids into {len(mz_segments)} segments')

    formula_segments = {}
    for segm_i in range(len(mz_segments))[::-1]:
        logger.debug(f'Segment {segm_i}')

        segm_min_mz, segm_max_mz = mz_segments[segm_i]

        segm_df = centr_df[(~centr_df.formula_i.isin(formula_segments))
                           & (centr_df.mz > segm_min_mz)
                           & (centr_df.mz < segm_max_mz)]

        by_fi = segm_df.groupby('formula_i').peak_i
        formula_min_peak = by_fi.min()
        formula_max_peak = by_fi.max()

        formula_inds = set(formula_min_peak[formula_min_peak == 0].index)
        formula_inds &= set(formula_max_peak[formula_max_peak > 0].index)

        for f_i in formula_inds:
            formula_segments[f_i] = segm_i

    rmtree(centr_segm_path, ignore_errors=True)
    centr_segm_path.mkdir(parents=True)

    logger.info(f'Saving segments to {centr_segm_path}')
    centr_segm_df = centr_df.join(pd.Series(formula_segments, name='segm'), on='formula_i', how='inner')
    for segm_i, df in centr_segm_df.groupby('segm'):
        df.to_msgpack(f'{centr_segm_path}/{segm_i}')


def ds_dims(coordinates):
    min_x, min_y = np.amin(coordinates, axis=0)
    max_x, max_y = np.amax(coordinates, axis=0)
    nrows, ncols = max_y - min_y + 1, max_x - min_x + 1
    return nrows, ncols


def determine_spectra_order(coordinates):
    _coord = np.array(coordinates)
    _coord = np.around(_coord, 5)  # correct for numerical precision
    _coord -= np.amin(_coord, axis=0)

    _, ncols = ds_dims(coordinates)
    pixel_indices = _coord[:, 1] * ncols + _coord[:, 0]
    pixel_indices = pixel_indices.astype(np.int32)
    return pixel_indices


def segment_spectra(imzml_parser, coordinates, mz_segments, ds_segments_path):

    def chunk_list(l, size=5000):
        n = (len(l) - 1) // size + 1
        for i in range(n):
            yield l[size * i:size * (i + 1)]

    def segment_spectra_chunk(sp_inds, mzs, ints):
        for segm_i, (l, r) in enumerate(mz_segments):
            mask = (mzs > l) & (mzs < r)
            n = mask.sum()
            a = np.zeros((n, 3))
            a[:, 0] = sp_inds[mask]
            a[:, 1] = mzs[mask]
            a[:, 2] = ints[mask]
            (pd.DataFrame(a, columns=['idx', 'mz', 'int'])
             .to_msgpack(ds_segments_path / f'{segm_i}', append=True))

    logger.info(f'Segmenting spectra into {len(mz_segments)} segments')

    rmtree(ds_segments_path, ignore_errors=True)
    ds_segments_path.mkdir(parents=True)

    sp_indices = determine_spectra_order(coordinates)

    chunk_size = 5000
    coord_chunk_it = chunk_list(coordinates, chunk_size)

    sp_i = 0
    sp_inds, mzs, ints = [], [], []
    for ch_i, coord_chunk in enumerate(coord_chunk_it):
        logger.debug(f'Segmenting chunk {ch_i}')

        for x, y in coord_chunk:
            mzs_, ints_ = map(np.array, imzml_parser.getspectrum(sp_i))
            sp_idx = sp_indices[sp_i]
            sp_inds.append(np.ones_like(mzs_) * sp_idx)
            mzs.append(mzs_)
            ints.append(ints_)
            sp_i += 1

        segment_spectra_chunk(np.concatenate(sp_inds),
                              np.concatenate(mzs),
                              np.concatenate(ints))
        sp_inds, mzs, ints = [], [], []


def make_sample_area_mask(coordinates):
    sp_indices = determine_spectra_order(coordinates)
    nrows, ncols = ds_dims(coordinates)
    sample_area_mask = np.zeros(ncols * nrows, dtype=bool)
    sample_area_mask[sp_indices] = True
    return sample_area_mask.reshape(nrows, ncols)


def create_process_segment(ds_segments_path, centr_segm_path,
                           coordinates, image_gen_conf, target_formula_inds):
    sample_area_mask = make_sample_area_mask(coordinates)
    nrows, ncols = ds_dims(coordinates)
    compute_metrics = make_compute_image_metrics(sample_area_mask, nrows, ncols, image_gen_conf)

    def process_segment(segm_i):
        logger.info(f'Processing segment {segm_i}')
        logger.info(f'Reading spectra data from {ds_segments_path / str(segm_i)}')
        data = pd.read_msgpack(ds_segments_path / f'{segm_i}')
        if type(data) == pd.DataFrame:
            sp_df = data
        else:
            sp_df = pd.concat(data)
        logger.info(f'Reading centroids data from {centr_segm_path / str(segm_i)}')
        centr_df = pd.read_msgpack(centr_segm_path / f'{segm_i}')

        formula_images_gen = gen_iso_images(sp_df.idx.values, sp_df.mz.values, sp_df.int.values,
                                            centr_df, nrows, ncols, ppm=3, min_px=1)
        formula_metrics_df, formula_images = \
            formula_image_metrics(formula_images_gen, compute_metrics, target_formula_inds)
        logger.info(f'Segment {segm_i} finished')
        return formula_metrics_df, formula_images

    return process_segment
