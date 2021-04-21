import logging
from typing import Union, List

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.figure import Figure
import seaborn as sns

from msi_recal import RecalParams
from msi_recal.math import mass_accuracy_bounds

logger = logging.getLogger(__name__)


def save_spectrum_image(
    spectra_df: pd.DataFrame, values: Union[dict, pd.Series], path: str, title: str, **kwargs
):
    values = pd.Series(values)
    values = values[values.index.isin(spectra_df.index)]

    base_y = spectra_df.y.min()
    base_x = spectra_df.x.min()
    im_height = spectra_df.y.max() + 1 - base_y
    im_width = spectra_df.x.max() + 1 - base_x
    im = np.zeros((im_height, im_width))
    im[spectra_df.y[values.index] - base_y, spectra_df.x[values.index] - base_x] = values.values

    fig_height = im_height
    fig_width = im_width
    while fig_height < 720 and fig_width < 1080:
        fig_height *= 2
        fig_width *= 2

    dpi = 100
    fig_width = max(fig_width / 0.8, 500) / dpi
    fig_height = max(fig_width / 0.7, 500) / dpi

    # print(im_height, im_width, fig_height, fig_width)

    fig: Figure = plt.figure(figsize=(fig_height, fig_width))
    fig.suptitle(title)
    ax: Axes = fig.add_axes([0.1, 0.1, 0.7, 0.8], frameon=False, xticks=[], yticks=[])
    artist = ax.imshow(im, aspect='equal', interpolation='nearest', **kwargs)
    cb_ax = fig.add_axes([0.85, 0.1, 0.1, 0.8], frameon=False, xticks=[], yticks=[])
    fig.colorbar(artist, cb_ax)

    fig.savefig(path, dpi=dpi)
    plt.close(fig)


def save_mma_image(
    mz: float,
    params: RecalParams,
    align_sigma_1: float,
    before_mzs: List[float],
    after_mzs: List[float],
    path: str,
):
    if len(before_mzs) <= 2 or len(after_mzs) <= 2:
        logger.warn(f'Skipping MMA debug plot for {mz:.6f} as not enough peaks were found')
        return

    fig: Figure = plt.figure(figsize=(1080 / 100, 720 / 100))
    ax: Axes = fig.gca()
    ax.set_title(f'Mass Measurement Accuracy @ {mz:.6f}')
    df = pd.DataFrame(
        [
            *(('Before alignment', mz) for mz in before_mzs),
            *(('After alignment', mz) for mz in after_mzs),
        ],
        columns=['set', 'mz'],
    )

    jitter_mz_lo, jitter_mz_hi = mass_accuracy_bounds(mz, params.instrument, params.jitter_sigma_1)
    ax.axvline(jitter_mz_lo, c='#0008')
    ax.axvline(jitter_mz_hi, c='#0008')

    align_mz_lo, align_mz_hi = mass_accuracy_bounds(mz, params.instrument, align_sigma_1)
    ax.set_xlim(align_mz_lo, align_mz_hi)

    sns.kdeplot(data=df, x='mz', hue='set', common_grid=True, ax=ax, bw_adjust=0.25)

    fig.savefig(path, dpi=100)
    plt.close(fig)
