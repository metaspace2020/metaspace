import pandas as pd

from msi_recal.plot import save_spectrum_image


class Normalize:
    def __init__(self, params, intensity='median', ref='tic'):
        try:
            self.intensity = float(intensity)
        except ValueError:
            self.intensity = None
        self.ref = ref
        self.ref_vals = {}

    def fit(self, X):
        if self.intensity is None:
            if self.ref == 'tic':
                self.intensity = X.groupby('sp').ints.sum().median()
            else:
                self.intensity = X.groupby('sp').ints.max().median()

        return self

    def predict(self, X):
        assert self.intensity is not None, 'predict called before fit'

        if self.ref == 'tic':
            self.ref_vals.update(X.groupby('sp').ints.sum())
        else:
            self.ref_vals.update(X.groupby('sp').ints.max())

        ref_vals_s = pd.Series(self.ref_vals)
        return X.assign(ints=X.ints / ref_vals_s[X.sp].values * self.intensity)

    def save_debug(self, spectra_df, path_prefix):
        save_spectrum_image(
            spectra_df,
            self.ref_vals,
            f'{path_prefix}_{self.ref}_intensity.png',
            f'{self.ref} intensity',
        )
