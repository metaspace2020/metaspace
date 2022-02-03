import logging
import warnings
from datetime import datetime
from traceback import format_exc
from typing import List, Tuple

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import pairwise_kernels
from sklearn.cluster import spectral_clustering
from scipy.ndimage import zoom, median_filter

from sm.engine.annotation_lithops.executor import Executor
from sm.engine.annotation_lithops.io import save_cobj, iter_cobjs_with_prefetch
from sm.engine.dataset import Dataset
from sm.engine.ion_mapping import get_ion_id_mapping
from sm.engine.config import SMConfig
from sm.engine.image_storage import ImageStorage

COLOC_JOB_DEL = 'DELETE FROM graphql.coloc_job WHERE ds_id = %s AND moldb_id = %s'

COLOC_JOB_INS = (
    'INSERT INTO graphql.coloc_job ('
    '   ds_id, moldb_id, fdr, algorithm, start, finish, error, sample_ion_ids'
    ') '
    'VALUES (%s, %s, %s, %s, %s, %s, %s, %s) '
    'RETURNING id'
)

COLOC_ANN_INS = (
    'INSERT INTO graphql.coloc_annotation(coloc_job_id, ion_id, coloc_ion_ids, coloc_coeffs) '
    'VALUES (%s, %s, %s, %s)'
)

SUCCESSFUL_COLOC_JOB_SEL = (
    'SELECT moldb_id FROM graphql.coloc_job '
    'WHERE ds_id = %s '
    'GROUP BY moldb_id '
    'HAVING not bool_or(error IS NOT NULL)'
)

ANNOTATIONS_SEL = (
    'SELECT iso_image_ids[1], formula, chem_mod, neutral_loss, adduct, fdr '
    'FROM annotation m '
    'WHERE m.job_id = ('
    '    SELECT id FROM job j '
    '    WHERE j.ds_id = %s AND j.moldb_id = %s '
    '    ORDER BY start DESC '
    '    LIMIT 1) AND iso_image_ids[1] IS NOT NULL '
    'ORDER BY msm DESC'
)

DATASET_CONFIG_SEL = (
    "SELECT config #> '{database_ids}', config #> '{isotope_generation,charge}' "
    "FROM dataset "
    "WHERE id = %s"
)

logger = logging.getLogger('engine')


class ColocalizationJob:
    # pylint: disable=too-many-arguments
    def __init__(
        self,
        ds_id,
        moldb_id,
        fdr,
        algorithm_name=None,
        start=None,
        finish=None,
        error=None,
        ion_ids=None,
        sample_ion_ids=None,
        coloc_annotations=None,
    ):
        """
        Args
        ----------
        ds_id: str
        moldb_id: int
        fdr: float
        algorithm_name: str
        start: datetime
        finish: datetime
        error: str
        ion_ids: list[int]
        sample_ion_ids: list[int]
            ids of ions that show distinctive localizations
        coloc_annotations: list[tuple[int, list[int], list[float]]]
            list of (base_ion_id, list(other_ion_ids), list(other_ion_scores))
        """
        assert error or all(
            (
                algorithm_name,
                ion_ids is not None,
                sample_ion_ids is not None,
                coloc_annotations is not None,
            )
        )

        self.ds_id = ds_id
        self.moldb_id = moldb_id
        self.fdr = fdr
        self.algorithm_name = algorithm_name or 'error'
        self.start = start or datetime.now()
        self.finish = finish or datetime.now()
        self.error = error
        self.ion_ids = ion_ids
        self.sample_ion_ids = sample_ion_ids or []
        self.coloc_annotations = coloc_annotations or []


class FreeableRef:
    def __init__(self, ref):
        self._ref = ref
        self._freed = False

    def free(self):
        self._ref = None
        self._freed = True

    @property
    def ref(self):
        if self._freed:
            raise ReferenceError('FreeableRef is already freed')

        return self._ref


def _labels_to_clusters(labels, scores):
    """Converts from [0,1,0,1,2] form (mapping sample idx to cluster idx)
    to [[0,2],[1,3],[4]] form (mapping cluster idx to sample idx's).
    Each cluster is sorted based on items' distance from the cluster's mean
    """
    assert labels.shape[0] == scores.shape[0] == scores.shape[1], (labels.shape, scores.shape)

    in_same_cluster_mask = labels[:, np.newaxis] == labels[np.newaxis, :]
    typicalness = np.average(scores * scores, axis=1, weights=in_same_cluster_mask)
    clusters = [np.argwhere(labels == cid).ravel() for cid in np.unique(labels) if cid != -1]
    return [sorted(cluster, key=lambda i: -typicalness[i]) for cluster in clusters]


def _label_clusters(scores):
    n_samples = scores.shape[0]
    min_clusters = min(int(np.round(np.sqrt(n_samples))), 20)
    max_clusters = min(n_samples, 20)

    results = []
    last_error = None

    with warnings.catch_warnings():
        warnings.filterwarnings(
            'ignore',
            '.*Graph is not fully connected, spectral embedding may not work as expected.*',
        )
        for n_clusters in range(min_clusters, max_clusters + 1):
            try:
                labels = spectral_clustering(
                    affinity=scores, n_clusters=n_clusters, random_state=1, n_init=100
                )
                cluster_score = np.mean([scores[a, b] for a, b in enumerate(labels)])
                results.append((n_clusters, cluster_score, labels))
            except Exception as e:
                last_error = e

    if not results:
        raise last_error

    if last_error:
        logger.warning(f'Clustering failed on some cluster sizes: {last_error}')

    # Find the best cluster, subtracting n/1000 to add a slight preference to having fewer clusters
    best_cluster_idx = np.argmax([cs - n / 1000 for n, cs, l in results])
    best_n, _, best_labels = results[best_cluster_idx]
    logger.debug(f'Best with {best_n} clusters (scores: {[(r[0], r[1]) for r in results]})')
    return best_labels


def _get_best_colocs(scores, max_samples, min_score):
    coloc_idxs = []
    for i in range(scores.shape[0]):
        pairing_scores = scores[i, :].copy()
        pairing_scores[pairing_scores < min_score] = 0  # Discard scores below threshold
        pairing_scores[i] = 0  # Ignore self-correlation

        num_above_min_score = np.count_nonzero(pairing_scores)
        num_to_keep = np.minimum(num_above_min_score, max_samples)

        coloc_idxs.append(list(np.argsort(pairing_scores)[::-1][:num_to_keep]))

    return coloc_idxs


def _format_coloc_annotations(ion_ids, scores, colocs):
    for i, js in enumerate(colocs):  # pylint: disable=invalid-name
        sorted_js = sorted(js, key=lambda j: -scores[i, j])  # pylint: disable=cell-var-from-loop
        base_ion_id = ion_ids.item(i)
        other_ion_ids = [ion_ids.item(j) for j in sorted_js]
        other_ion_scores = [scores.item((i, j)) for j in sorted_js]

        yield base_ion_id, other_ion_ids, other_ion_scores


def _downscale_image_if_required(img, num_annotations):
    # Aim for a maximum of 0.5 gigapixel (=2GB) total across the whole dataset,
    # as multiple copies are created during processing
    max_pixels = int(512 * 1024 * 1024 / num_annotations)

    zoom_factor = (max_pixels / (img.shape[0] * img.shape[1])) ** 0.5
    if zoom_factor > 1:
        return img
    with warnings.catch_warnings():
        # ignore "UserWarning: From scipy 0.13.0, the output shape of zoom() is calculated
        # with round() instead of int()
        # - for these inputs the size of the returned array has changed."
        warnings.filterwarnings('ignore', '.*the output shape of zoom.*')
        return zoom(img, zoom_factor)


def _median_thresholded_cosine(images, h, w):
    cnt = images.shape[0]
    images[images < np.quantile(images, 0.5, axis=1, keepdims=True)] = 0
    images = median_filter(images.reshape((cnt, h, w)), (1, 3, 3)).reshape((cnt, h * w))
    return pairwise_kernels(images, metric='cosine')


def _get_sample_ion_ids(scores, cluster_max_images, trunc_fdr_mask, trunc_masked_ion_ids):
    try:
        trunc_scores = scores[:cluster_max_images, :cluster_max_images]
        trunc_masked_scores = trunc_scores[trunc_fdr_mask, :][:, trunc_fdr_mask]
        logger.debug(f'Clustering with ' f'{trunc_masked_scores.shape[0]} annotations')
        labels = _label_clusters(trunc_masked_scores)
        clusters = _labels_to_clusters(labels, trunc_masked_scores)
        # This could be done better, e.g. by returning medoids
        return [trunc_masked_ion_ids.item(c[0]) for c in clusters]
    except Exception as e:
        logger.warning(f'Failed to cluster: {e}', exc_info=True)
        return []


# pylint: disable=cell-var-from-loop
def analyze_colocalization(ds_id, moldb_id, images, ion_ids, fdrs, h, w, cluster_max_images=5000):
    """Calculate co-localization of ion images for all algorithms and yield results

    Args
    ----------
    ds_id: str
    moldb_id: int
    images: FreeableRef[np.ndarray]
        2D array where each row contains the pixels from one image
        WARNING: This FreeableRef is released during use to save memory
    ion_ids: np.ndarray
        1D array where each item is the ion_id for the corresponding row in images
    fdrs: np.ndarray
        1D array where each item is the fdr for the corresponding row in images
    cluster_max_images: int
        maximum number of images used for clustering
    """
    assert images.ref.shape[0] == ion_ids.shape[0] == fdrs.shape[0], (
        images.ref.shape,
        ion_ids.shape,
        fdrs.shape,
    )
    start = datetime.now()

    if images.ref.shape[1] < 3:
        logger.warning('Not enough pixels per image to perform colocalization.')
        return
    if len(ion_ids) < 2:
        logger.info('Not enough annotations to perform colocalization')
        return

    logger.debug('Calculating colocalization metrics')
    cos_scores = pairwise_kernels(images.ref, metric='cosine')
    med_cos_scores = _median_thresholded_cosine(images.ref, h, w)
    images.free()

    trunc_ion_ids = ion_ids[:cluster_max_images]
    trunc_fdrs = fdrs[:cluster_max_images]

    for fdr in [0.05, 0.1, 0.2, 0.5]:
        fdr_mask = fdrs <= fdr + 0.001
        masked_ion_ids = ion_ids[fdr_mask]

        trunc_fdr_mask = trunc_fdrs <= fdr + 0.001
        trunc_masked_ion_ids = trunc_ion_ids[trunc_fdr_mask]

        if len(masked_ion_ids) > 1:
            sample_ion_ids = _get_sample_ion_ids(
                med_cos_scores, cluster_max_images, trunc_fdr_mask, trunc_masked_ion_ids
            )

            def run_alg(algorithm, scores):
                logger.debug(
                    f'Finding best colocalizations with {algorithm} at FDR {fdr} '
                    f'({len(masked_ion_ids)} annotations)'
                )
                masked_scores = scores if fdr_mask.all() else scores[fdr_mask, :][:, fdr_mask]
                colocs = _get_best_colocs(masked_scores, max_samples=100, min_score=0.3)
                coloc_annotations = list(
                    _format_coloc_annotations(masked_ion_ids, masked_scores, colocs)
                )
                return ColocalizationJob(
                    ds_id,
                    moldb_id,
                    fdr,
                    algorithm,
                    start,
                    datetime.now(),
                    ion_ids=masked_ion_ids.tolist(),
                    sample_ion_ids=sample_ion_ids,
                    coloc_annotations=coloc_annotations,
                )

            yield run_alg('median_thresholded_cosine', med_cos_scores)
            yield run_alg('cosine', cos_scores)
        else:
            logger.debug(
                f'Skipping FDR {fdr} as there are only {len(masked_ion_ids)} annotation(s)'
            )


def _get_images(
    image_storage: ImageStorage, ds_id: str, image_ids: List[str]
) -> Tuple[FreeableRef, int, int]:
    if image_ids:
        logger.debug(f'Getting {len(image_ids)} images')
        images, _, (h, w) = image_storage.get_ion_images_for_analysis(ds_id, image_ids)
        logger.debug(f'Finished getting images. Image size: {h}x{w}')
    else:
        images = np.zeros((0, 0), dtype=np.float32)
        h, w = 1, 1

    return FreeableRef(images), h, w


class Colocalization:
    def __init__(self, db):
        self._db = db
        self._sm_config = SMConfig.get_conf()

    def _save_job_to_db(self, job):
        (job_id,) = self._db.insert_return(
            COLOC_JOB_INS,
            [
                [
                    job.ds_id,
                    job.moldb_id,
                    job.fdr,
                    job.algorithm_name,
                    job.start,
                    job.finish,
                    job.error,
                    job.sample_ion_ids,
                ]
            ],
        )

        annotations = [(job_id, *ann) for ann in job.coloc_annotations]
        self._db.insert(COLOC_ANN_INS, annotations)

    def _get_ion_annotations(self, ds_id, moldb_id, charge):
        annotation_rows = self._db.select(ANNOTATIONS_SEL, [ds_id, moldb_id])
        num_annotations = len(annotation_rows)
        if num_annotations != 0:
            ion_tuples = [
                (formula, chem_mod, neutral_loss, adduct)
                for image, formula, chem_mod, neutral_loss, adduct, fdr in annotation_rows
            ]
            ion_id_mapping = get_ion_id_mapping(self._db, ion_tuples, charge)
            ion_ids = np.array([ion_id_mapping[ion_tuple] for ion_tuple in ion_tuples])
            fdrs = np.array([row[5] for row in annotation_rows])

            image_ids = [row[0] for row in annotation_rows]

        else:
            image_ids = []
            ion_ids = np.zeros((0,), dtype=np.int64)
            fdrs = np.zeros((0,), dtype=np.float32)

        return image_ids, ion_ids, fdrs

    def _iter_pending_coloc_tasks(self, ds_id: str, reprocess: bool = False):
        moldb_ids, charge = self._db.select_one(DATASET_CONFIG_SEL, [ds_id])
        existing_moldb_ids = set(self._db.select_onecol(SUCCESSFUL_COLOC_JOB_SEL, [ds_id]))

        for moldb_id in moldb_ids:
            if reprocess or moldb_id not in existing_moldb_ids:
                # Clear old jobs from DB
                self._db.alter(COLOC_JOB_DEL, [ds_id, moldb_id])

                image_ids, ion_ids, fdrs = self._get_ion_annotations(ds_id, moldb_id, charge)
                if len(ion_ids) > 2:
                    # Technically `len(ion_ids) == 2` is enough,
                    # but spearmanr returns a scalar instead of a matrix
                    # when there are only 2 items, and it's not worth handling this edge case
                    yield moldb_id, image_ids, ion_ids, fdrs
                else:
                    logger.debug(f'Not enough annotations in {ds_id} on {moldb_id}')
            else:
                logger.info(f'Skipping colocalization job for {ds_id} on {moldb_id}')

    def run_coloc_job(self, ds: Dataset, reprocess: bool = False):
        """Analyze colocalization for a previously annotated dataset.

        Querying the dataset's annotations from the db, and downloading the exported ion images.

        Args:
            ds: dataset instance
            reprocess: Whether to re-run colocalization jobs against databases
                that have already successfully run
        """
        for moldb_id, image_ids, ion_ids, fdrs in self._iter_pending_coloc_tasks(ds.id, reprocess):
            logger.info(f'Running colocalization job for {ds.id} on {moldb_id}')
            images, h, w = _get_images(ImageStorage(), ds.id, image_ids)
            try:
                for job in analyze_colocalization(ds.id, moldb_id, images, ion_ids, fdrs, h, w):
                    self._save_job_to_db(job)
            except Exception:
                logger.warning('Colocalization job failed', exc_info=True)
                self._save_job_to_db(ColocalizationJob(ds.id, moldb_id, 0, error=format_exc()))
                raise

    def run_coloc_job_lithops(self, fexec: Executor, ds: Dataset, reprocess: bool = False):
        # Extract required fields to avoid pickling Dataset, because unpickling Dataset tries to
        # import psycopg2 and fails inside Functions
        ds_id = ds.id
        sm_config = self._sm_config

        def run_coloc_job(moldb_id, image_ids, ion_ids, fdrs, *, storage):
            # Use web_app_url to get the publicly-exposed storage server address, because
            # Functions can't use the private address
            images, h, w = _get_images(ImageStorage(sm_config), ds_id, image_ids)
            cobjs = []
            for job in analyze_colocalization(ds_id, moldb_id, images, ion_ids, fdrs, h, w):
                cobjs.append(save_cobj(storage, job))
            return cobjs

        tasks = list(self._iter_pending_coloc_tasks(ds.id, reprocess))
        cost_factors = pd.DataFrame({'n_images': [len(task[1]) for task in tasks]})
        job_cobjs = fexec.map_concat(
            run_coloc_job, tasks, cost_factors=cost_factors, runtime_memory=4096
        )

        for job in iter_cobjs_with_prefetch(fexec.storage, job_cobjs):
            self._save_job_to_db(job)
