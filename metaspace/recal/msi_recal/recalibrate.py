import logging
from multiprocessing import JoinableQueue, Process
from pathlib import Path
from typing import List, Iterable, Union

import numpy as np
import pandas as pd
from pyimzml.ImzMLParser import ImzMLParser
from pyimzml.ImzMLWriter import ImzMLWriter

from msi_recal.db_peak_match import get_recal_candidates
from msi_recal.mean_spectrum import (
    get_mean_spectrum_df_parallel,
    get_representative_spectrum,
    annotate_mean_spectrum,
    hybrid_mean_spectrum,
)
from msi_recal.params import RecalParams
from msi_recal.passes.align_msiwarp import AlignMsiwarp
from msi_recal.passes.align_ransac import AlignRansac
from msi_recal.passes.recal_msiwarp import RecalMsiwarp
from msi_recal.passes.recal_ransac import RecalRansac

logger = logging.getLogger(__name__)

PASSES = {
    'align_msiwarp': AlignMsiwarp,
    'align_ransac': AlignRansac,
    'recal_msiwarp': RecalMsiwarp,
    'recal_ransac': RecalRansac,
}


def get_spectra_df_from_parser(p: ImzMLParser, sp_idxs: Iterable[int]):
    peaks_dfs = []
    spectra = []

    for i in sp_idxs:
        mzs, ints = p.getspectrum(i)
        x, y, z = p.coordinates[i]
        mask = ints > 0
        mzs = mzs[mask]
        ints = ints[mask]
        peaks_dfs.append(pd.DataFrame({'sp': i, 'mz': mzs, 'ints': ints.astype(np.float32)}))
        spectra.append((i, x, y, z, np.min(mzs), np.max(mzs), np.sum(ints)))

    peaks_df = pd.concat(peaks_dfs)
    spectra_df = pd.DataFrame(
        spectra, columns=['sp', 'x', 'y', 'z', 'mz_lo', 'mz_hi', 'tic']
    ).set_index('sp')

    return peaks_df, spectra_df


def get_sample_spectra_df_from_parser(p: ImzMLParser, n_samples=200):
    sp_n = len(p.coordinates)
    sp_idxs = np.sort(np.random.choice(sp_n, min(n_samples, sp_n), False))
    return get_spectra_df_from_parser(p, sp_idxs)


def build_pipeline(sample_peaks_df: pd.DataFrame, params: RecalParams):
    limit_of_detection = np.percentile(sample_peaks_df.ints, 0.1)
    models = []
    for pass_name in params.passes:
        logger.debug(f'Fitting {pass_name} model')
        assert pass_name in PASSES, f'Unrecognized model "{pass_name}"'

        p = PASSES[pass_name](params)

        if 'align' in pass_name:
            mean_spectrum = hybrid_mean_spectrum(
                sample_peaks_df, params.instrument, params.align_sigma_1
            )

            spectrum = get_representative_spectrum(
                sample_peaks_df,
                mean_spectrum.mz.values,
                params.instrument,
                params.align_sigma_1,
                remove_bg=True,
            )
            p.fit(sample_peaks_df, spectrum)
        else:
            # mean_spectrum = get_mean_spectrum_df_parallel(
            #     sample_peaks_df, params.instrument, params.jitter_sigma_1
            # )
            # mean_spectrum = annotate_mean_spectrum(
            #     sample_peaks_df, mean_spectrum.mz, params.instrument, params.jitter_sigma_1
            # )
            mean_spectrum = hybrid_mean_spectrum(
                sample_peaks_df, params.instrument, params.jitter_sigma_1, 0
            )
            candidate_df = get_recal_candidates(mean_spectrum, params, params.recal_sigma_1)
            # __import__('__main__')._sample_peaks_df = sample_peaks_df
            # __import__('__main__').mean_spectrum = mean_spectrum
            # __import__('__main__').candidate_df = candidate_df
            # __import__('__main__')._p = p
            p.fit(sample_peaks_df, candidate_df)
        sample_peaks_df = p.predict(sample_peaks_df)
        logger.debug(f'Sample peaks: {sample_peaks_df.shape}')

        models.append(p)

    return models


def _imzml_writer_process(output_path, queue):
    with ImzMLWriter(output_path) as writer:
        while True:
            job = queue.get()
            queue.task_done()
            if job is not None:
                for mzs, ints, coord in job:
                    writer.addSpectrum(mzs, ints, coord)
            if job is None:
                return


def process_imzml_file(
    input_path: Union[str, Path], params: RecalParams, output_path: Union[str, Path, None] = None
):
    input_path = Path(input_path)
    if not output_path:
        output_path = Path(f'{input_path.parent}/{input_path.stem}_recal.imzML')

    p = ImzMLParser(str(input_path))
    sample_peaks_df, sample_spectra_df = get_sample_spectra_df_from_parser(p)
    models = build_pipeline(sample_peaks_df, params)
    __import__('__main__').models = models

    writer_queue = JoinableQueue(2)
    writer_process = Process(target=_imzml_writer_process, args=(output_path, writer_queue))
    writer_process.start()

    try:
        chunk_size = 1000
        for start_i in range(0, len(p.coordinates), chunk_size):
            end_i = min(start_i + chunk_size, len(p.coordinates))
            logger.debug(f'Reading peaks {start_i}-{end_i}')
            peaks_df, spectra_df = get_spectra_df_from_parser(p, np.arange(start_i, end_i))

            logger.debug(f'Transforming peaks {start_i}-{end_i}')
            for model in models:
                peaks_df = model.predict(peaks_df)

            writer_job = []
            for sp, grp in peaks_df.groupby('sp'):
                spectrum = spectra_df.loc[sp]
                writer_job.append((grp.mz, grp.ints, (spectrum.x, spectrum.y, spectrum.z)))

            logger.debug(f'Writing peaks {start_i}-{end_i}')
            writer_queue.put(writer_job)
    finally:
        writer_queue.put(None)
        writer_queue.close()
        writer_queue.join()
        writer_process.join()
    logger.info(f'Finished writing {output_path}')
