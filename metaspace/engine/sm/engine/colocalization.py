import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from traceback import format_exc
import numpy as np
import pandas as pd
import pyspark.rdd
from sklearn.decomposition import PCA
from sklearn.metrics.pairwise import pairwise_kernels
from sklearn.cluster import spectral_clustering
from scipy.stats import spearmanr, pearsonr

from sm.engine.dataset import Dataset
from sm.engine.ion_mapping import get_ion_id_mapping
from sm.engine.mol_db import MolecularDB
from sm.engine.util import SMConfig
from sm.engine.png_generator import ImageStoreServiceWrapper

COLOC_JOB_DEL = ('DELETE FROM graphql.coloc_job ' 
                 'WHERE ds_id = %s AND mol_db = %s')

COLOC_JOB_INS = ('INSERT INTO graphql.coloc_job (ds_id, mol_db, fdr, algorithm, start, finish, error, sample_ion_ids) ' 
                 'VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ' 
                 'RETURNING id')

COLOC_ANN_INS = ('INSERT INTO graphql.coloc_annotation(coloc_job_id, ion_id, coloc_ion_ids, coloc_coeffs) ' 
                 'VALUES (%s, %s, %s, %s)')

ANNOTATIONS_SEL = ('SELECT iso_image_ids[1], sf, adduct, fdr '
                   'FROM iso_image_metrics m '
                   'JOIN job j ON j.id = m.job_id '
                   'WHERE j.ds_id = %s AND j.db_id = %s')

DATASET_CONFIG_SEL = ("SELECT mol_dbs, config #>> '{isotope_generation,charge,polarity}' "
                      "FROM dataset "
                      "WHERE id = %s")

logger = logging.getLogger('engine')


class ColocalizationJob(object):
    def __init__(self, ds_id, mol_db, fdr, algorithm_name=None, start=None, finish=None,
                 error=None, ion_ids=None, sample_ion_ids=None, coloc_annotations=None):
        """
        Args
        ----------
        ds_id: str
        mol_db: str
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
        assert error or all((algorithm_name, ion_ids is not None, sample_ion_ids is not None,
                             coloc_annotations is not None))

        self.ds_id = ds_id
        self.mol_db = mol_db
        self.fdr = fdr
        self.algorithm_name = algorithm_name or 'error'
        self.start = start or datetime.now()
        self.finish = finish or datetime.now()
        self.error = error
        self.ion_ids = ion_ids
        self.sample_ion_ids = sample_ion_ids
        self.coloc_annotations = coloc_annotations


def _preprocess_images(imgs):
    """ Clips the top 1% (if more than 1% of pixels are populated),
    scales all pixels to the range 0...1,
    and ensures that no image is completely zero.
    """
    max_clipped, max_unclipped = np.percentile(imgs, [99, 100], axis=1, keepdims=True)
    scale = np.select([max_clipped != 0, max_unclipped != 0], [max_clipped, max_unclipped], 1)
    imgs = np.clip(imgs / scale, 0, 1)
    imgs[(max_unclipped == 0)[:, 0], :] = 0.01
    return imgs


def _labels_to_clusters(labels, scores):
    """ Converts from [0,1,0,1,2] form (mapping sample idx to cluster idx)
    to [[0,2],[1,3],[4]] form (mapping cluster idx to sample idx's).
    Each cluster is sorted based on items' distance from the cluster's mean
    """
    assert labels.shape[0] == scores.shape[0] == scores.shape[1]

    in_same_cluster_mask = labels[:, np.newaxis] == labels[np.newaxis, :]
    typicalness = np.average(scores * scores, axis=1, weights=in_same_cluster_mask)
    clusters = [np.argwhere(labels == cid).ravel() for cid in np.unique(labels) if cid != -1]
    return [sorted(cluster, key=lambda i: -typicalness[i]) for cluster in clusters]


def _label_clusters(scores):
    min_clusters = 2
    max_clusters = 20
    n_samples = scores.shape[0]
    if n_samples <= min_clusters:
        return [[i] for i in range(n_samples)]

    results = []
    last_error = None
    for n_clusters in range(min_clusters, min(n_samples, max_clusters)):
        try:
            labels = spectral_clustering(affinity=scores, n_clusters=n_clusters, random_state=1, n_init=100)
            cluster_score = np.mean([scores[a, b] for a, b in enumerate(labels)])
            results.append((n_clusters, cluster_score, labels))
        except Exception as err:
            last_error = err

    if not results:
        raise last_error
    elif last_error:
        logger.warning('Warning: clustering failed on some cluster sizes', last_error)

    # Find the best cluster, subtracting n/1000 to add a slight preference to having fewer clusters
    best_cluster_idx = np.argmax([cs - n / 1000 for n, cs, l in results])
    best_n, best_cluster_score, best_labels = results[best_cluster_idx]
    logger.debug(f'best with {best_n} clusters (scores: {[(r[0], r[1]) for r in results]})')
    return best_labels


def _get_best_colocs(scores, labels, max_samples, min_score):
    coloc_idxs = []
    for i, cluster_id in enumerate(labels):
        pairing_scores = scores[i, :].copy()
        pairing_scores[labels == cluster_id] = 1 # Give preference to items in the same cluster
        pairing_scores[pairing_scores < min_score] = 0 # Discard scores below threshold
        pairing_scores[i] = 0 # Ignore self-correlation

        num_in_cluster = np.count_nonzero(labels == cluster_id)
        num_above_min_score = np.count_nonzero(pairing_scores)
        num_to_keep = np.clip(num_above_min_score, num_in_cluster, max_samples)

        coloc_idxs.append(list(np.argsort(pairing_scores)[::-1][:num_to_keep]))

    return coloc_idxs


def _format_coloc_annotations(ion_ids, scores, colocs):
    for i, js in enumerate(colocs):
        sorted_js = sorted(js, key=lambda j: -scores[i, j])
        base_ion_id = ion_ids[i].item()
        other_ion_ids = [ion_ids[j].item() for j in sorted_js]
        other_ion_scores = [scores[i, j].item() for j in sorted_js]

        yield base_ion_id, other_ion_ids, other_ion_scores


def analyze_colocalization(ds_id, mol_db, annotations):
    """ Calculate co-localization of ion images for all algorithms and yield results

    Args
    ----------
    ds_id: str
    mol_db: str
    annotations: list[tuple[np.ndarray, int, float]]
        list of tuples of (raw_image, ion_id, fdr)
    """
    start = datetime.now()

    filtered_annotations = [a for a in annotations if a[0] is not None]
    if len(filtered_annotations) < 1:
        logger.info('Not enough annotations to perform colocalization')
        return

    logger.debug('Preprocessing images')
    images = _preprocess_images(np.array([a[0] for a in filtered_annotations], ndmin=2, dtype=np.float32))
    ion_ids = np.array([a[1] for a in filtered_annotations])
    fdrs = np.array([a[2] for a in filtered_annotations])

    pca_images = PCA(min(20, *images.shape)).fit_transform(images)
    cos_scores = pairwise_kernels(images, metric='cosine')
    pca_cos_scores = pairwise_kernels(pca_images, metric='cosine')
    pca_pear_scores = pairwise_kernels(pca_images, metric=lambda a, b: pearsonr(a, b)[0])
    pca_sper_scores = spearmanr(pca_images.transpose())[0]  # TODO: Discard low p-value entries?

    for fdr in [0.05, 0.1, 0.2, 0.5]:
        fdr_mask = np.array(fdrs) <= fdr + 0.001
        masked_ion_ids = np.array(ion_ids)[fdr_mask].tolist()

        if len(masked_ion_ids) > 1:

            # NOTE: Keep labels/clusters between algorithms so that if any algorithm fails to cluster,
            # it can use the labels/clusters from a previous successful run.
            # Usually cosine succeeds at clustering and PCA data fails clustering.
            labels = [0] * len(fdr_mask)
            clusters = []

            def run_alg(algorithm, scores, cluster):
                nonlocal labels, clusters
                masked_scores = scores[fdr_mask, :][:, fdr_mask]
                if cluster:
                    logger.debug(f'Clustering {algorithm} at {fdr} FDR with {len(masked_ion_ids)} annotations')
                    try:
                        labels = _label_clusters(masked_scores)
                        clusters = _labels_to_clusters(labels, masked_scores)
                    except Exception as err:
                        logger.warning(f'Failed to cluster {algorithm}: {err}')

                colocs = _get_best_colocs(masked_scores, labels, 50, 0.3)

                sample_ion_ids = [masked_ion_ids[c[0]] for c in clusters] # This could be done better
                coloc_annotations = list(_format_coloc_annotations(ion_ids, scores, colocs))
                return ColocalizationJob(ds_id, mol_db, fdr, algorithm, start, datetime.now(),
                                         ion_ids=masked_ion_ids, sample_ion_ids=sample_ion_ids,
                                         coloc_annotations=coloc_annotations)

            yield run_alg('cosine', cos_scores, True)
            yield run_alg('pca_cosine', pca_cos_scores, False)
            yield run_alg('pca_pearson', pca_pear_scores, False)
            yield run_alg('pca_spearman', pca_sper_scores, False)


class Colocalization(object):

    def __init__(self, db):
        self._db = db
        self._sm_config = SMConfig.get_conf()
        self._img_store = ImageStoreServiceWrapper(self._sm_config['services']['img_service_url'])

    def _save_job_to_db(self, job):

        job_id, = self._db.insert_return(COLOC_JOB_INS,
            [[job.ds_id, job.mol_db, job.fdr, job.algorithm_name, job.start, job.finish, job.error, job.sample_ion_ids]])

        annotations = [(job_id, *ann) for ann in job.coloc_annotations]
        self._db.insert(COLOC_ANN_INS, annotations)

    def _analyze_and_save(self, ds_id, mol_db, annotations):
        try:
            # Clear old jobs from DB
            self._db.alter(COLOC_JOB_DEL, [ds_id, mol_db])

            for job in analyze_colocalization(ds_id, mol_db, annotations):
                self._save_job_to_db(job)
        except Exception:
            logger.warning('Colocalization job failed', exc_info=True)
            self._save_job_to_db(ColocalizationJob(ds_id, mol_db, 0, error=format_exc()))
            raise

    def _get_existing_ds_annotations(self, ds_id, mol_db_name, image_storage_type, polarity):
        def get_ion_image(id):
            if id is not None:
                im = self._img_store.get_image_by_id(image_storage_type, 'iso_image', id)
                data = np.asarray(im)
                return np.where(data[:, :, 3] != 0, data[:, :, 0], 0).ravel()
            return None

        mol_db = MolecularDB(name=mol_db_name)
        annotation_rows = self._db.select(ANNOTATIONS_SEL, [ds_id, mol_db.id])
        sf_adducts = [(formula, adduct) for image, formula, adduct, fdr in annotation_rows]
        ion_id_mapping = get_ion_id_mapping(sf_adducts, polarity)
        ion_ids = [ion_id_mapping[sf_adduct] for sf_adduct in sf_adducts]
        fdrs = [fdr for image, formula, adduct, fdr in annotation_rows]

        with ThreadPoolExecutor() as ex:
            logger.debug(f'Getting {len(annotation_rows)} images for "{ds_id}" {mol_db_name}')
            ion_images = ex.map(get_ion_image, [row[0] for row in annotation_rows])
            logger.debug(f'Finished getting images for "{ds_id}" {mol_db_name}')
        return list(zip(ion_images, ion_ids, fdrs))

    def run_coloc_job_for_existing_ds(self, ds_id):
        """ Analyze colocalization for a previously annotated dataset, querying the dataset's annotations from the db,
        and downloading the exported ion images
        Args
        ====
        ds_id: str
        """

        image_storage_type = Dataset(ds_id).get_ion_img_storage_type(self._db)
        mol_dbs, polarity = self._db.select_one(DATASET_CONFIG_SEL, [ds_id])

        for mol_db_name in mol_dbs:
            annotations = self._get_existing_ds_annotations(ds_id, mol_db_name, image_storage_type, polarity)
            self._analyze_and_save(ds_id, mol_db_name, annotations)

    def run_coloc_job_for_new_ds(self, ds, mol_db_name, ion_metrics_df, ion_iso_images, alpha_channel):
        """ Analyze colocalization as part of an annotation job, using dataframes from the annotation job as a datasource
        Args
        ====
        ds: Dataset
        mol_db_name: str
        ion_metrics_df: pd.DataFrame
        ion_iso_images: pyspark.rdd.RDD
        alpha_channel: np.ndarray
        """

        logger.info('Running colocalization job')
        polarity = ds.config['isotope_generation']['charge']['polarity']
        mols = list(ion_metrics_df[['formula','adduct']].itertuples(index=False, name=None))
        ion_id_mapping = get_ion_id_mapping(self._db, mols, polarity)

        def extract_image(imgs):
            if imgs[0] is not None:
                return (imgs[0].toarray() * alpha_channel).ravel()
            return None

        image_map = ion_iso_images.mapValues(extract_image).collectAsMap()
        annotations = [(image_map.get(i), ion_id_mapping[(item.formula, item.adduct)], item.fdr)
                       for i, item in ion_metrics_df.iterrows()]

        self._analyze_and_save(ds.id, mol_db_name, annotations)

