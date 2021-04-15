from typing import Union

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.figure import Figure


def save_spectrum_image(
    spectra_df: pd.DataFrame, values: Union[dict, pd.Series], path: str, title: str, **kwargs
):
    values = pd.Series(values)
    base_y = spectra_df.y.min()
    base_x = spectra_df.x.min()
    im_height = spectra_df.y.max() + 1 - base_y
    im_width = spectra_df.x.max() + 1 - base_x
    im = np.zeros((im_height, im_width))
    im[spectra_df.y[values.index] - base_y, spectra_df.x[values.index] - base_x] = values.values

    fig_height = im_height
    fig_width = im_width
    while fig_height < 500 and fig_width < 500:
        fig_height *= 2
        fig_width *= 2

    # print(im_height, im_width, fig_height, fig_width)

    fig: Figure = plt.figure(figsize=(fig_height / 0.8 / 100, fig_width / 0.7 / 100))
    fig.suptitle(title)
    ax: Axes = fig.add_axes([0.1, 0.1, 0.7, 0.8], frameon=False, xticks=[], yticks=[])
    artist = ax.imshow(im, interpolation='none', **kwargs)
    cb_ax = fig.add_axes([0.85, 0.1, 0.1, 0.8], frameon=False, xticks=[], yticks=[])
    fig.colorbar(artist, cb_ax)

    fig.savefig(path, dpi=100)
