import logging
from multiprocessing import JoinableQueue, Process
from pathlib import Path
from typing_extensions import Literal
from typing import Iterable, Union

import numpy as np
import pandas as pd
from pyimzml.ImzMLParser import ImzMLParser
from pyimzml.ImzMLWriter import ImzMLWriter

from msi_recal.params import RecalParams
from msi_recal.passes.align_msiwarp import AlignMsiwarp
from msi_recal.passes.align_ransac import AlignRansac
from msi_recal.passes.normalize import Normalize
from msi_recal.passes.recal_msiwarp import RecalMsiwarp
from msi_recal.passes.recal_ransac import RecalRansac

logger = logging.getLogger(__name__)

TRANSFORM = {
    'align_msiwarp': AlignMsiwarp,
    'align_ransac': AlignRansac,
    'recal_msiwarp': RecalMsiwarp,
    'recal_ransac': RecalRansac,
    'normalize': Normalize,
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
    models = []
    for tf_name, *tf_args in params.transforms:
        logger.info(f'Fitting {tf_name} model')
        assert tf_name in TRANSFORM, f'Unrecognized transform "{tf_name}"'

        tf = TRANSFORM[tf_name](params, *tf_args)
        tf.fit(sample_peaks_df)
        sample_peaks_df = tf.predict(sample_peaks_df)

        models.append(tf)

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
    input_path: Union[str, Path],
    params: RecalParams,
    output_path: Union[str, Path, None] = None,
    debug_path: Union[str, Path, None, Literal['infer']] = 'infer',
    samples: int = 100,
    limit: int = None,
):
    input_path = Path(input_path)
    if not output_path:
        output_path = Path(f'{input_path.parent}/{input_path.stem}_recal.imzML')
    if debug_path == 'infer':
        debug_path = Path(f'{input_path.parent}/{input_path.stem}_debug/')

    p = ImzMLParser(str(input_path))
    sample_peaks_df, sample_spectra_df = get_sample_spectra_df_from_parser(p, n_samples=samples)

    models = build_pipeline(sample_peaks_df, params)

    writer_queue = JoinableQueue(2)
    writer_process = Process(target=_imzml_writer_process, args=(output_path, writer_queue))
    writer_process.start()

    all_spectra_dfs = []

    try:
        chunk_size = 1000
        sp_n = min(limit, len(p.coordinates)) if limit else len(p.coordinates)

        for start_i in range(0, sp_n, chunk_size):
            end_i = min(start_i + chunk_size, sp_n)
            logger.debug(f'Reading spectra {start_i}-{end_i} out of {sp_n}')
            peaks_df, spectra_df = get_spectra_df_from_parser(p, np.arange(start_i, end_i))
            # Convert to tuples, because spectra_df.loc coalesces everything into floats
            spectra_dict = {row[0]: row for row in spectra_df.itertuples()}
            all_spectra_dfs.append(spectra_df)

            logger.info(f'Transforming spectra {start_i}-{end_i}')
            for model in models:
                peaks_df = model.predict(peaks_df)

            writer_job = []
            for sp, grp in peaks_df.groupby('sp'):
                spectrum = spectra_dict[sp]
                writer_job.append((grp.mz, grp.ints, (spectrum.x, spectrum.y, spectrum.z)))

            logger.debug(f'Writing spectra {start_i}-{end_i}')
            writer_queue.put(writer_job)
    except KeyboardInterrupt:
        pass  # Don't rethrow - save the debug data if possible
    finally:
        writer_queue.put(None)
        writer_queue.close()
        writer_queue.join()
        writer_process.join()
    logger.info(f'Finished writing {output_path}')

    if debug_path:
        debug_path.mkdir(parents=True, exist_ok=True)
        existing_debug_files = [p for p in debug_path.iterdir() if p.is_file()]
        if existing_debug_files:
            logger.info(f'Cleaning debug output directory')
            for file in existing_debug_files:
                file.unlink()
        logger.info(f'Writing debug output to {debug_path}')

        all_spectra_df = pd.concat(all_spectra_dfs)

        for i, ((transform_name, *_), model) in enumerate(zip(params.transforms, models)):
            try:
                if hasattr(model, 'save_debug'):
                    model.save_debug(all_spectra_df, str(debug_path / f'{i}_{transform_name}'))
            except:
                logger.warning(f'{transform_name} error', exc_info=True)
