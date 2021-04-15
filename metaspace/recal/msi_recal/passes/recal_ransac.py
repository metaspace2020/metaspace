import logging

import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from sklearn.linear_model import RANSACRegressor

from msi_recal.db_peak_match import get_recal_candidates
from msi_recal.math import peak_width, ppm_to_sigma_1
from msi_recal.params import RecalParams

logger = logging.getLogger(__name__)


class RecalRansac:
    def __init__(self, params: RecalParams, ppm='500'):
        self.params = params
        self.recal_sigma_1 = ppm_to_sigma_1(float(ppm), params.instrument, params.base_mz)

        self.instrument = params.instrument
        self.jitter_sigma_1 = params.jitter_sigma_1

        self.db_hits = None
        self.model = None

    def fit(self, X):
        missing_cols = {'sp', 'mz', 'ints'}.difference(X.columns)
        assert not missing_cols, f'X is missing columns: {", ".join(missing_cols)}'

        recal_candidates, self.db_hits, mean_spectrum = get_recal_candidates(
            X, self.params, self.recal_sigma_1
        )

        if len(recal_candidates) < 10:
            logger.warning(
                f'Too few peaks for recalibration ({len(recal_candidates)} < 10). Skipping.'
            )
            self.M_ = 1
            self.C_ = 0
            # Make a fake RANSACRegressor just in case
            linear_data = np.arange(3).reshape(-1, 1)
            self.model = RANSACRegressor(min_samples=2).fit(linear_data, linear_data)
            return self

        _X = np.array(recal_candidates.db_mz).reshape(-1, 1)
        _y = np.array(recal_candidates.mz)
        _weights = np.array(recal_candidates.weight)
        threshold = peak_width(recal_candidates.db_mz.values, self.instrument, self.jitter_sigma_1)

        bins = np.histogram_bin_edges(_X, 2)
        self.model = RANSACRegressor(
            max_trials=10000,
            # min_samples
            min_samples=max(0.05, 3 / len(X)),
            residual_threshold=threshold,
            # Require subsets include values from both the higher and lower end of the mass range
            is_data_valid=lambda X_subset, y_subset: np.histogram(X_subset, bins)[0].all(),
            loss='absolute_loss',
            stop_probability=1,
        )
        self.model.fit(_X, _y, _weights)
        y_pred = self.model.estimator_.predict(_X)
        pred_inliers = np.abs(_y - y_pred) < threshold

        logger.debug(f'RANSAC model hit {np.count_nonzero(pred_inliers)} inliers out of {len(_y)}')
        min_mz = np.floor(X.mz.min() / 10) * 10
        max_mz = np.ceil(X.mz.max() / 10) * 10
        new_min, new_max = self.model.predict([[min_mz], [max_mz]])
        logger.debug(f'Warping {min_mz:.6f} -> {new_min:.6f}')
        logger.debug(f'Warping {max_mz:.6f} -> {new_max:.6f}')
        return self

    def predict(self, X):
        return X.assign(mz=self.model.predict(np.array(X.mz).reshape(-1, 1)))

    def save_debug(self, spectra_df, path_prefix):
        self.db_hits.to_csv(f'{path_prefix}_db_hits.csv')

        fig: Figure = plt.figure(figsize=(10, 10))
        fig.suptitle('RANSAC recalibration')
        ax: Axes = fig.gca()

        candidates = self.db_hits[lambda df: df.used_for_recal].copy()
        candidates['mz_err'] = candidates.mz - candidates.db_mz
        sns.scatterplot(
            data=candidates,
            x='mz',
            y='mz_err',
            size='weight',
            hue='db',
            alpha=0.5,
            sizes=(0, 25),
            legend=True,
            ax=ax,
        )

        ax.set_ylim(*np.percentile(candidates.mz_err, [1, 99]))

        min_mz, max_mz = candidates.mz.min(), candidates.mz.max()
        min_move, max_move = self.model.predict([[min_mz], [max_mz]]) - [min_mz, max_mz]

        ax.plot(
            [min_mz, max_mz],
            [min_move, max_move],
            label='Recalibration shift',
        )

        fig.savefig(f'{path_prefix}_recal.png')
