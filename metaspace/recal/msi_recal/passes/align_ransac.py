import logging
import os
import pickle
from concurrent.futures.process import ProcessPoolExecutor
from multiprocessing import Process, JoinableQueue
from pathlib import Path

import cpyMSpec
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pyimzml.ImzMLWriter import ImzMLWriter
from sklearn.linear_model import RANSACRegressor, TheilSenRegressor
from sklearn.metrics import r2_score
import msiwarp as mx
from msiwarp.util.warp import to_mz, to_height, to_mx_peaks, generate_mean_spectrum
from pyimzml.ImzMLParser import ImzMLParser

from msi_recal.db_peak_match import join_by_mz
from msi_recal.math import peak_width

logger = logging.getLogger(__name__)


class SpectrumAlignerRansac:
    def __init__(self, align_sigma_1, tol_sigma_1, instrument, mz_lo, mz_hi):
        self.align_sigma_1 = align_sigma_1
        self.tol_sigma_1 = tol_sigma_1
        self.instrument = instrument
        self.mz_lo = mz_lo
        self.mz_hi = mz_hi
        self.coef_ = {}
        self.lo_warp_ = {}
        self.hi_warp_ = {}
        self.target_spectrum = None

    def fit(self, X, y):
        missing_cols = {'mz', 'coverage'}.difference(y.columns)
        assert not missing_cols, f'y is missing columns: {", ".join(missing_cols)}'
        self.target_spectrum = y[['mz', 'ints', 'coverage']].sort_values('mz')
        logger.info(f'Alignment spectrum has {len(y)} peaks')
        return self

    def _align_ransac_inner(self, sp, mzs, ints):
        # threshold = self.align_ppm * 200 * 1e-6
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

            hits['weight'] = hits.coverage * np.log(hits.sample_ints) * ints_accuracy
            hits = hits.sort_values('weight', ascending=False, ignore_index=True).iloc[:100]
            X = hits.sample_mz.values.reshape(-1, 1)
            y = hits.mz.values
            bins = np.histogram_bin_edges(X, 2)
            threshold = peak_width(X[:, 0], self.instrument, self.tol_sigma_1)
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
        results = pmap(
            self._align_ransac_inner,
            [(sp, grp.mz, grp.ints) for sp, grp in X.groupby('sp') if sp not in self.coef_],
        )

        for result in results:
            sp = result['sp']
            self.coef_[sp] = result
            self.lo_warp_[sp] = result['M'] * self.mz_lo + result['C']
            self.hi_warp_[sp] = result['M'] * self.mz_hi + result['C']

        sp_to_M = pd.Series({sp: result['M'] for sp, result in self.coef_.items()})
        sp_to_C = pd.Series({sp: result['C'] for sp, result in self.coef_.items()})

        new_peak_mzs = sp_to_M[X.sp].values * X.mz + sp_to_C[X.sp].values
        return X.assign(mz=new_peak_mzs)
