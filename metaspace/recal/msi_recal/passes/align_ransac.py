import logging
from concurrent.futures.process import ProcessPoolExecutor

import numpy as np
import pandas as pd
from sklearn.linear_model import RANSACRegressor

from msi_recal.join_by_mz import join_by_mz
from msi_recal.math import peak_width, ppm_to_sigma_1
from msi_recal.mean_spectrum import representative_spectrum, hybrid_mean_spectrum
from msi_recal.params import RecalParams

logger = logging.getLogger(__name__)


class AlignRansac:
    def __init__(self, params: RecalParams, ppm='20'):
        self.align_sigma_1 = ppm_to_sigma_1(float(ppm), params.instrument, params.base_mz)
        self.jitter_sigma_1 = params.jitter_sigma_1
        self.instrument = params.instrument
        self.min_mz = None
        self.max_mz = None
        self.coef_ = {}
        self.lo_warp_ = {}
        self.hi_warp_ = {}
        self.target_spectrum = None

    def fit(self, X):
        missing_cols = {'mz', 'ints', 'mz'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        mean_spectrum = hybrid_mean_spectrum(X, self.instrument, self.align_sigma_1)
        spectrum = representative_spectrum(
            X,
            mean_spectrum,
            self.instrument,
            self.align_sigma_1,
            denoise=True,
        )

        self.target_spectrum = spectrum[['mz', 'ints']].sort_values('mz')
        logger.info(f'Alignment spectrum has {len(spectrum)} peaks')

        self.min_mz = np.round(X.mz.min(), -1)
        self.max_mz = np.round(X.mz.max(), -1)

        return self

    def _align_ransac_inner(self, sp, mzs, ints):
        hits = join_by_mz(
            self.target_spectrum,
            'mz',
            pd.DataFrame({'sample_mz': mzs, 'sample_ints': ints}),
            'sample_mz',
            self.instrument,
            self.align_sigma_1,
        )
        if len(hits) > 10:
            ints = hits.sample_ints * np.median(hits.ints / hits.sample_ints)
            ints_accuracy = 0.5 - (ints / (ints + 1))

            hits['weight'] = np.log(hits.sample_ints) * ints_accuracy
            hits = hits.sort_values('weight', ascending=False, ignore_index=True).iloc[:100]
            X = hits.sample_mz.values.reshape(-1, 1)
            y = hits.mz.values
            bins = np.histogram_bin_edges(X, 2)
            threshold = peak_width(X[:, 0], self.instrument, self.jitter_sigma_1)
            ransac = RANSACRegressor(
                # max_trials=10000,
                min_samples=max(0.1, 3 / len(X)),
                residual_threshold=threshold,
                # Require subsets include values from both the higher and lower end of the mass range
                is_data_valid=lambda X_subset, y_subset: np.histogram(X_subset, bins)[0].all(),
                loss='absolute_loss',
                stop_probability=1,
            )
            ransac.fit(X, y)
            return {
                'sp': sp,
                'M': ransac.estimator_.coef_[0],
                'C': ransac.estimator_.intercept_,
                'score': ransac.score(X, y),
                'inliers': np.count_nonzero(ransac.inlier_mask_),
                'align_peaks': len(hits),
                'align_min': hits.mz.min(),
                'align_max': hits.mz.max(),
            }
        else:
            return {'sp': sp, 'M': 1, 'C': 0, 'score': 0}

    def predict(self, X):
        assert self.target_spectrum is not None, 'predict called before fit'
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'
        with ProcessPoolExecutor() as ex:
            args = [(sp, grp.mz, grp.ints) for sp, grp in X.groupby('sp') if sp not in self.coef_]
            for result in ex.map(self._align_ransac_inner, *zip(*args)):
                sp = result['sp']
                self.coef_[sp] = result
                self.lo_warp_[sp] = result['M'] * self.min_mz + result['C']
                self.hi_warp_[sp] = result['M'] * self.max_mz + result['C']

        sp_to_M = pd.Series({sp: result['M'] for sp, result in self.coef_.items()})
        sp_to_C = pd.Series({sp: result['C'] for sp, result in self.coef_.items()})

        new_peak_mzs = sp_to_M[X.sp].values * X.mz + sp_to_C[X.sp].values
        return X.assign(mz=new_peak_mzs)
