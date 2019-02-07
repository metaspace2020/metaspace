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
from sm.engine.mol_db import MolecularDB
from sm.engine.util import SMConfig
from sm.engine.png_generator import ImageStoreServiceWrapper

logger = logging.getLogger('engine')

ANNOTATIONS_SEL = ('SELECT iso_image_ids[1], sf, adduct, fdr '
                   'FROM iso_image_metrics m '
                   'JOIN job j ON j.id = m.job_id '
                   'WHERE j.ds_id = %s AND j.db_id = %s')

DATASET_CONFIG_SEL = "SELECT mol_dbs, config #>> '{isotope_generation,charge,polarity}' FROM dataset WHERE id = %s"

class Colocalization(object):

    def __init__(self, db):
        self._db = db
        self._sm_config = SMConfig.get_conf()
        self._img_store = ImageStoreServiceWrapper(self._sm_config['services']['img_service_url'])

    def _preprocess_images(self, imgs):
        """Clips the top 1% (if more than 1% of pixels are populated),
           scales all pixels to the range 0...1,
           and ensures that no image is completely zero."""
        max_clipped, max_unclipped = np.percentile(imgs, [99, 100], axis=1, keepdims=True)
        scale = np.select([max_clipped != 0, max_unclipped != 0], [max_clipped, max_unclipped], 1)
        imgs = np.clip(imgs / scale, 0, 1)
        imgs[(max_unclipped == 0)[:, 0], :] = 0.01
        return imgs

    def _labels_to_clusters(self, labels, scores):
        """
        Converts from [0,1,0,1,2] form (mapping sample idx to cluster idx)
        to [[0,2],[1,3],[4]] form (mapping cluster idx to sample idx's).
        Each cluster is sorted based on items' distance from the cluster's mean
        """
        assert labels.shape[0] == scores.shape[0] == scores.shape[1]

        in_same_cluster_mask = labels[:, np.newaxis] == labels[np.newaxis, :]
        typicalness = np.average(scores * scores, axis=1, weights=in_same_cluster_mask)
        clusters = [np.argwhere(labels == cid).ravel() for cid in np.unique(labels) if cid != -1]
        return [sorted(cluster, key=lambda i: -typicalness[i]) for cluster in clusters]

    def _label_clusters(self, scores):
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

    def _get_ion_id_mapping(self, mols, polarity):
        """Get a mapping of ions to ion ids, adding missing ions to the database if necessary
        Args
        ------------
        mols : list[tuple[str, str]]
            (formula, adduct) tuples
        polarity : str
            'Positive' or 'Negative'
        Returns
        ------------
        dict[tuple[str, str], int]

        """
        if polarity in ('Positive', '+'):
            charge = 1
            charge_sign = '+'
        elif polarity in ('Negative', '-'):
            charge = -1
            charge_sign = '-'
        else:
            raise TypeError("polarity must be 'Positive', 'Negative', '+' or '-'")

        ions = [formula + adduct + charge_sign for formula, adduct in mols]
        ion_to_mol = dict(zip(ions, mols))
        ion_to_id = dict(self._db.select("SELECT ion, id FROM graphql.ion WHERE ion = ANY(%s)", [ions]))
        missing_ions = sorted(set(ions).difference(ion_to_id.keys()))

        if missing_ions:
            rows = [(ion, *ion_to_mol[ion], charge) for ion in missing_ions]
            ids = self._db.insert_return('INSERT INTO graphql.ion (ion, formula, adduct, charge) VALUES (%s, %s, %s, %s) RETURNING id',
                                   rows)
            ion_to_id.update((row[0], id) for id, row in zip(ids, rows))

        return dict((ion_to_mol[ion], ion_to_id[ion]) for ion in ions)

    def _save_job_to_db(self, ds_id, fdr, mol_db, algorithm_name, start, finish, error, ion_ids, scores, clusters, colocs):
        assert len(ion_ids) == scores.shape[0] == scores.shape[1] == len(colocs)
        # Extract data for DB
        sample_ion_ids = [ion_ids[c[0]] for c in clusters]
        grouped_ion_ids = dict()
        grouped_scores = dict()
        for i, js in enumerate(colocs):
            sorted_js = sorted(js, key = lambda j: -scores[i, j])
            grouped_ion_ids[ion_ids[i]] = [ion_ids[j] for j in sorted_js]
            grouped_scores[ion_ids[i]] = [np.asscalar(scores[i, j]) for j in sorted_js]

        # Insert into DB
        job_id, = self._db.insert_return(
            "INSERT INTO graphql.coloc_job (ds_id, fdr, mol_db, algorithm, start, finish, error, sample_ion_ids) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
            [[ds_id, fdr, mol_db, algorithm_name, start, finish, error, sample_ion_ids]])

        self._db.insert(
            "INSERT INTO graphql.coloc_annotation(coloc_job_id, ion_id, coloc_ion_ids, coloc_coeffs) VALUES (%s, %s, %s, %s)",
            [(job_id, ion_id, grouped_ion_ids[ion_id], grouped_scores[ion_id])
             for i, ion_id in enumerate(ion_ids)])

        # Clear old jobs from DB
        self._db.alter(
            "DELETE FROM graphql.coloc_job WHERE ds_id = %s AND fdr = %s AND mol_db = %s AND algorithm = %s AND id != %s",
            [ds_id, fdr, mol_db, algorithm_name, job_id])

    def _get_best_colocs(self, scores, labels, max_samples, min_score):
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

    def run_coloc_job(self, ds_id, mol_db, annotations):
        """ Calculate co-localization of ion images for a search job and save the results to DB

        Args
        ----------
        ds_id: str
        mol_db: str
        annotations: list[tuple[np.ndarray, int, float]]
            list of tuples of (raw_image, ion_id, fdr)
        """
        start = datetime.now()

        # Clear old errors
        self._db.alter("DELETE FROM graphql.coloc_job WHERE ds_id = %s AND mol_db = %s AND algorithm = 'error'", [ds_id, mol_db])

        try:
            logger.debug('Preprocessing images')
            filtered_annotations = [a for a in annotations if a[0] is not None]
            if not filtered_annotations:


            images = self._preprocess_images(np.array([a[0] for a in filtered_annotations], ndmin=2, dtype=np.float32))
            ion_ids = np.array([a[1] for a in filtered_annotations])
            fdrs = np.array([a[2] for a in filtered_annotations])
            pca_images = PCA(min(20, images.shape[1])).fit_transform(images)

            logger.debug('Running cosine comparison')
            cos_scores = pairwise_kernels(images, metric='cosine')
            logger.debug('Running pca-cosine comparison')
            pca_cos_scores = pairwise_kernels(pca_images, metric='cosine')
            logger.debug('Running pca-pearson comparison')
            pca_pear_scores = pairwise_kernels(pca_images, metric=lambda a, b: pearsonr(a, b)[0])
            logger.debug('Running pca-spearman comparison')
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
                                labels = self._label_clusters(masked_scores)
                                clusters = self._labels_to_clusters(labels, masked_scores)
                            except Exception as err:
                                logger.warning(f'Failed to cluster {algorithm}: {err}')

                        colocs = self._get_best_colocs(masked_scores, labels, 50, 0.3)
                        logger.debug(f'Saving {algorithm} at {fdr} FDR')
                        self._save_job_to_db(ds_id, fdr, mol_db, algorithm, start, datetime.now(), None,
                                             masked_ion_ids, masked_scores, clusters, colocs)

                    run_alg('cosine', cos_scores, True)
                    run_alg('pca_cosine', pca_cos_scores, False)
                    run_alg('pca_pearson', pca_pear_scores, False)
                    run_alg('pca_spearman', pca_sper_scores, False)

        except Exception:
            logger.warning('Colocalization job failed', exc_info=True)
            self._save_job_to_db(ds_id, 0, mol_db, 'error', start, datetime.now(), format_exc(), [], np.array([[]]), [], [])
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
        ion_id_mapping = self._get_ion_id_mapping(sf_adducts, polarity)
        ion_ids = [ion_id_mapping[sf_adduct] for sf_adduct in sf_adducts]
        fdrs = [fdr for image, formula, adduct, fdr in annotation_rows]

        with ThreadPoolExecutor() as ex:
            logger.debug(f'Getting {len(annotation_rows)} images for "{ds_id}" {mol_db_name}')
            ion_images = ex.map(get_ion_image, [row[0] for row in annotation_rows])
            logger.debug(f'Finished getting images for "{ds_id}" {mol_db_name}')
        return list(zip(ion_images, ion_ids, fdrs))

    def run_coloc_job_for_existing_ds(self, ds_id):
        image_storage_type = Dataset(ds_id).get_ion_img_storage_type(self._db)
        mol_dbs, polarity = self._db.select_one(DATASET_CONFIG_SEL, [ds_id])

        for mol_db_name in mol_dbs:
            annotations = self._get_existing_ds_annotations(ds_id, mol_db_name, image_storage_type, polarity)
            self.run_coloc_job(ds_id, mol_db_name, annotations)

    def run_coloc_job_for_new_ds(self, ds, mol_db_name, ion_metrics_df, ion_iso_images, alpha_channel):
        """
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
        ion_id_mapping = self._get_ion_id_mapping(mols, polarity)

        def extract_image(imgs):
            if imgs[0]:
                return (imgs[0].toarray() * alpha_channel).ravel()
            return None
        image_map = ion_iso_images.mapValues(extract_image).collectAsMap()
        annotations = [(image_map.get(i), ion_id_mapping[(item.formula, item.adduct)], item.fdr)
                       for i, item in ion_metrics_df.iterrows()]

        self.run_coloc_job(ds.id, mol_db_name, annotations)

