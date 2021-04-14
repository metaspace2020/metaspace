import logging

import numpy as np
from sklearn.linear_model import RANSACRegressor

from msi_recal.math import peak_width
from msi_recal.params import RecalParams

logger = logging.getLogger(__name__)


class RecalRansac:
    def __init__(self, params: RecalParams):
        self.instrument = params.instrument
        self.jitter_sigma_1 = params.jitter_sigma_1
        self.model = None
        self.M_ = None
        self.C_ = None

    def fit(self, X, y):
        missing_cols = {'mz', 'ints', 'db_mz', 'weight'}.difference(y.columns)
        assert not missing_cols, f'y is missing columns: {", ".join(missing_cols)}'

        if len(y) < 10:
            logger.warning(f'Too few peaks for recalibration ({len(y) < 10}). Skipping.')
            self.M_ = 1
            self.C_ = 0
            # Make a fake RANSACRegressor just in case
            linear_data = np.arange(3).reshape(-1, 1)
            self.model = RANSACRegressor(min_samples=2).fit(linear_data, linear_data)
            return self

        _X = np.array(y.db_mz).reshape(-1, 1)
        _y = np.array(y.mz)
        _weights = np.array(y.weight)
        threshold = peak_width(y.db_mz.values, self.instrument, self.jitter_sigma_1)

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

        self.M_ = (self.model.estimator_.coef_[0],)
        self.C_ = (self.model.estimator_.intercept_,)
        logger.debug(
            f'RANSAC model caught {np.count_nonzero(pred_inliers)} inliers out of {len(X)} samples'
        )
        return self

    def predict(self, X):
        return X.assign(mz=self.model.predict(np.array(X.mz).reshape(-1, 1)))
