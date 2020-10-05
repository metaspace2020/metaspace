from lithops import FunctionExecutor
from lithops.storage import Storage
from pyimzml.ImzMLParser import PortableSpectrumReader
from typing import List, Dict, Tuple

import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix
from concurrent.futures import ThreadPoolExecutor

from sm.engine.dataset import DSConfigImageGeneration
from sm.engine.annotation_lithops.utils import (
    ds_dims,
    get_pixel_indices,
    PipelineStats,
    logger,
)
from sm.engine.annotation_lithops.io import save_cobj, load_cobj, CObj
from sm.engine.annotation_lithops.validate import make_compute_image_metrics, formula_image_metrics

ISOTOPIC_PEAK_N = 4

ImageDict = Dict[int, List[coo_matrix]]


class ImagesManager:
    min_memory_allowed = 64 * 1024 ** 2  # 64MB

    def __init__(self, storage: Storage, max_formula_images_size: int):
        if max_formula_images_size < self.__class__.min_memory_allowed:
            raise Exception(
                f'There isn\'t enough memory to generate images, consider increasing Lithops\'s memory.'
            )

        self._formula_metrics: Dict[int, Dict] = {}
        self._formula_images: ImageDict = {}
        self._cloud_objs = []

        self._formula_images_size = 0
        self._max_formula_images_size = max_formula_images_size
        self._storage = storage
        self._partition = 0

    def __call__(self, f_i: int, f_metrics: Dict, f_images: List[coo_matrix]):
        self._add_f_metrics(f_i, f_metrics)
        self._add_f_images(f_i, f_images)

    @staticmethod
    def images_size(f_images):
        return sum(
            img.data.nbytes + img.row.nbytes + img.col.nbytes for img in f_images if img is not None
        )

    def _add_f_images(self, f_i: int, f_images: List[coo_matrix]):
        self._formula_images[f_i] = f_images
        self._formula_images_size += ImagesManager.images_size(f_images)
        if self._formula_images_size > self._max_formula_images_size:
            self._save_images()
            self._formula_images.clear()
            self._formula_images_size = 0

    def _add_f_metrics(self, f_i: int, f_metrics: Dict):
        self._formula_metrics[f_i] = f_metrics

    def _save_images(self):
        if self._formula_images:
            print(f'Saving {len(self._formula_images)} images')
            cloud_obj = save_cobj(self._storage, self._formula_images)
            self._cloud_objs.append(cloud_obj)
            self._partition += 1
        else:
            print(f'No images to save')

    def finish(self) -> Tuple[pd.DataFrame, List[CObj[ImageDict]]]:
        self._save_images()
        self._formula_images.clear()
        self._formula_images_size = 0
        formula_metrics_df = pd.DataFrame.from_dict(self._formula_metrics, orient='index')
        formula_metrics_df.index.name = 'formula_i'
        return formula_metrics_df, self._cloud_objs


def gen_iso_images(sp_inds, sp_mzs, sp_ints, centr_df, nrows, ncols, ppm=3, min_px=1):
    # assume sp data is sorted by mz order ascending
    # assume centr data is sorted by mz order ascending

    centr_f_inds = centr_df.formula_i.values
    centr_p_inds = centr_df.peak_i.values
    centr_mzs = centr_df.mz.values
    centr_ints = centr_df.int.values

    def yield_buffer(buffer):
        while len(buffer) < ISOTOPIC_PEAK_N:
            buffer.append((buffer[0][0], len(buffer) - 1, 0, None))
        buffer = np.array(buffer)
        buffer = buffer[buffer[:, 1].argsort()]  # sort order by peak ascending
        buffer = pd.DataFrame(buffer, columns=['formula_i', 'peak_i', 'centr_ints', 'image'])
        buffer.sort_values('peak_i', inplace=True)
        return buffer.formula_i[0], buffer.centr_ints, buffer.image

    if len(sp_inds) > 0:
        lower = centr_mzs - centr_mzs * ppm * 1e-6
        upper = centr_mzs + centr_mzs * ppm * 1e-6
        lower_idx = np.searchsorted(sp_mzs, lower, 'l')
        upper_idx = np.searchsorted(sp_mzs, upper, 'r')
        ranges_df = pd.DataFrame(
            {'formula_i': centr_f_inds, 'lower_idx': lower_idx, 'upper_idx': upper_idx}
        ).sort_values('formula_i')

        buffer = []
        for df_index, df_row in ranges_df.iterrows():
            if len(buffer) != 0 and buffer[0][0] != centr_f_inds[df_index]:
                yield yield_buffer(buffer)
                buffer = []

            l, u = df_row['lower_idx'], df_row['upper_idx']
            m = None
            if u - l >= min_px:
                data = sp_ints[l:u]
                inds = sp_inds[l:u]
                row_inds = inds / ncols
                col_inds = inds % ncols
                m = coo_matrix((data, (row_inds, col_inds)), shape=(nrows, ncols), copy=True)
            buffer.append((centr_f_inds[df_index], centr_p_inds[df_index], centr_ints[df_index], m))

        if len(buffer) != 0:
            yield yield_buffer(buffer)


def read_ds_segment(cobject, storage):
    data = load_cobj(storage, cobject)

    if isinstance(data, list):
        if isinstance(data[0], np.ndarray):
            data = np.concatenate(data)
        else:
            data = pd.concat(data, ignore_index=True, sort=False)

    if isinstance(data, np.ndarray):
        data = pd.DataFrame({'mz': data[:, 1], 'int': data[:, 2], 'sp_i': data[:, 0],})

    return data


def read_ds_segments(
    ds_segms_cobjects, ds_segms_len, pw_mem_mb, ds_segm_size_mb, ds_segm_dtype, storage,
):

    ds_segms_mb = len(ds_segms_cobjects) * ds_segm_size_mb
    safe_mb = 512
    read_memory_mb = ds_segms_mb + safe_mb
    if read_memory_mb > pw_mem_mb:
        raise Exception(
            f'There isn\'t enough memory to read dataset segments, consider increasing Lithops\'s memory for at least {read_memory_mb} mb.'
        )

    safe_mb = 1024
    concat_memory_mb = ds_segms_mb * 2 + safe_mb
    if concat_memory_mb > pw_mem_mb:
        print('Using pre-allocated concatenation')
        segm_len = sum(ds_segms_len)
        sp_df = pd.DataFrame(
            {
                'mz': np.zeros(segm_len, dtype=ds_segm_dtype),
                'int': np.zeros(segm_len, dtype=np.float32),
                'sp_i': np.zeros(segm_len, dtype=np.uint32),
            }
        )
        row_start = 0
        for cobject in ds_segms_cobjects:
            sub_sp_df = read_ds_segment(cobject, storage)
            row_end = row_start + len(sub_sp_df)
            sp_df.iloc[row_start:row_end] = sub_sp_df
            row_start += len(sub_sp_df)

    else:
        with ThreadPoolExecutor(max_workers=128) as pool:
            sp_df = list(pool.map(lambda co: read_ds_segment(co, storage), ds_segms_cobjects))
        sp_df = pd.concat(sp_df, ignore_index=True, sort=False)

    return sp_df


def make_sample_area_mask(coordinates):
    pixel_indices = get_pixel_indices(coordinates)
    nrows, ncols = ds_dims(coordinates)
    sample_area_mask = np.zeros(ncols * nrows, dtype=bool)
    sample_area_mask[pixel_indices] = True
    return sample_area_mask.reshape(nrows, ncols)


def choose_ds_segments(ds_segments_bounds, centr_df, ppm):
    centr_segm_min_mz, centr_segm_max_mz = centr_df.mz.agg([np.min, np.max])
    centr_segm_min_mz -= centr_segm_min_mz * ppm * 1e-6
    centr_segm_max_mz += centr_segm_max_mz * ppm * 1e-6

    ds_segm_n = len(ds_segments_bounds)
    first_ds_segm_i = np.searchsorted(ds_segments_bounds[:, 0], centr_segm_min_mz, side='right') - 1
    first_ds_segm_i = max(0, first_ds_segm_i)
    last_ds_segm_i = np.searchsorted(
        ds_segments_bounds[:, 1], centr_segm_max_mz, side='left'
    )  # last included
    last_ds_segm_i = min(ds_segm_n - 1, last_ds_segm_i)
    return first_ds_segm_i, last_ds_segm_i


def process_centr_segments(
    fexec: FunctionExecutor,
    ds_segms_cobjects: List[CObj[pd.DataFrame]],
    ds_segments_bounds,
    ds_segms_len: np.ndarray,
    db_segms_cobjects: List[CObj[pd.DataFrame]],
    imzml_reader: PortableSpectrumReader,
    image_gen_config: DSConfigImageGeneration,
    ds_segm_size_mb: float,
    is_intensive_dataset: bool,
):
    ds_segm_dtype = imzml_reader.mzPrecision
    sample_area_mask = make_sample_area_mask(imzml_reader.coordinates)
    nrows, ncols = ds_dims(imzml_reader.coordinates)
    compute_metrics = make_compute_image_metrics(sample_area_mask, nrows, ncols, image_gen_config)
    ppm = image_gen_config['ppm']
    pw_mem_mb = 2048 if is_intensive_dataset else 1024

    def process_centr_segment(
        db_segm_cobject: CObj[pd.DataFrame], segm_id: int, storage: Storage
    ) -> Tuple[pd.DataFrame, List[CObj[ImageDict]]]:
        print(f'Reading centroids segment {segm_id}')
        # read database relevant part
        centr_df = load_cobj(storage, db_segm_cobject)

        # find range of datasets
        first_ds_segm_i, last_ds_segm_i = choose_ds_segments(ds_segments_bounds, centr_df, ppm)
        print(f'Reading dataset segments {first_ds_segm_i}-{last_ds_segm_i}')
        # read all segments in loop from COS
        sp_arr = read_ds_segments(
            ds_segms_cobjects[first_ds_segm_i : last_ds_segm_i + 1],
            ds_segms_len[first_ds_segm_i : last_ds_segm_i + 1],
            pw_mem_mb,
            ds_segm_size_mb,
            ds_segm_dtype,
            storage,
        )

        formula_images_it = gen_iso_images(
            sp_inds=sp_arr.sp_i.values,
            sp_mzs=sp_arr.mz.values,
            sp_ints=sp_arr.int.values,
            centr_df=centr_df,
            nrows=nrows,
            ncols=ncols,
            ppm=ppm,
            min_px=1,
        )
        safe_mb = pw_mem_mb // 2
        max_formula_images_mb = (
            pw_mem_mb - safe_mb - (last_ds_segm_i - first_ds_segm_i + 1) * ds_segm_size_mb
        ) // 3
        print(f'Max formula_images size: {max_formula_images_mb} mb')
        images_manager = ImagesManager(storage, max_formula_images_mb * 1024 ** 2)
        formula_image_metrics(formula_images_it, compute_metrics, images_manager)
        formula_metrics_df, images_cloud_objs = images_manager.finish()

        print(f'Centroids segment {segm_id} finished')
        return formula_metrics_df, images_cloud_objs

    logger.info('Annotating...')
    futures = fexec.map(process_centr_segment, db_segms_cobjects, runtime_memory=pw_mem_mb)
    formula_metrics_list, images_cloud_objs = zip(*fexec.get_result(futures))
    formula_metrics_df = pd.concat(formula_metrics_list)
    images_cloud_objs = [cobj for cobjs in images_cloud_objs for cobj in cobjs]
    PipelineStats.append_pywren(
        futures, memory_mb=pw_mem_mb, cloud_objects_n=len(images_cloud_objs)
    )

    return formula_metrics_df, images_cloud_objs
