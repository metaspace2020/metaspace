import logging
from multiprocessing import JoinableQueue, Process
from pathlib import Path
from typing import Iterable, Union, Optional

import numpy as np
import pandas as pd
from pyimzml.ImzMLParser import ImzMLParser
from pyimzml.ImzMLWriter import ImzMLWriter

from msi_recal.evaluate import EvalPeaksCollector
from msi_recal.params import RecalParams
from msi_recal.passes.align_msiwarp import AlignMsiwarp
from msi_recal.passes.align_ransac import AlignRansac
from msi_recal.passes.normalize import Normalize
from msi_recal.passes.recal_msiwarp import RecalMsiwarp
from msi_recal.passes.recal_ransac import RecalRansac

try:
    from typing import Literal
except ImportError:
    from typing_extensions import Literal

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
        mzs = mzs[mask].astype(np.float64)
        ints = ints[mask].astype(np.float32)
        peaks_dfs.append(pd.DataFrame({'sp': i, 'mz': mzs, 'ints': ints}))
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


def build_pipeline(sample_peaks_df: pd.DataFrame, params: RecalParams, cache_path: Optional[Path]):
    models = []
    stages = [
        ('initial', sample_peaks_df),
    ]
    for tf_name, *tf_args in params.transforms:
        logger.info(f'Fitting {tf_name} model')
        assert tf_name in TRANSFORM, f'Unrecognized transform "{tf_name}"'

        tf = TRANSFORM[tf_name](params, *tf_args)
        loaded_cache = False
        if cache_path is not None:
            try:
                tf.load_cache(f'{cache_path}/{tf_name}')
                loaded_cache = True
                logger.debug(f'{tf_name} loaded from cache')
            except (IOError, EOFError):
                logger.debug(f'{tf_name} not cached')
        if not loaded_cache:
            tf.fit(sample_peaks_df)
        sample_peaks_df = tf.predict(sample_peaks_df)

        models.append(tf)
        stages.append((tf_name, sample_peaks_df))

    # Hacky progress report
    eval = EvalPeaksCollector(sample_peaks_df, params)
    for stage_name, stage_df in stages:
        eval.collect_peaks(stage_df, stage_name)

    logger.debug(
        pd.DataFrame(
            {stage_name: eval.get_stats(stage_name).abs().mean() for stage_name, stage_df in stages}
        )
    )

    eval.reset()

    return models, eval


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


def _null_writer_process(output_path, queue):
    while queue.get() is not None:
        queue.task_done()
    queue.task_done()


def process_imzml_file(
    input_path: Union[str, Path],
    params: RecalParams,
    output_path: Union[str, Path, None, Literal['infer']] = 'infer',
    debug_path: Union[str, Path, None, Literal['infer']] = 'infer',
    cache_path: Union[str, Path, None, Literal['infer']] = 'infer',
    samples: int = 100,
    limit: int = None,
):
    input_path = Path(input_path)
    if output_path == 'infer':
        output_path = Path(f'{input_path.parent}/{input_path.stem}_recal.imzML')
    if debug_path == 'infer':
        debug_path = Path(f'{input_path.parent}/{input_path.stem}_debug/')
    if cache_path == 'infer':
        cache_path = Path(f'{input_path.parent}/{input_path.stem}_cache/')
        cache_path.mkdir(parents=True, exist_ok=True)
    cache_path = Path(cache_path) if cache_path is not None else None

    p = ImzMLParser(str(input_path), parse_lib="ElementTree")
    sample_peaks_df, sample_spectra_df = get_sample_spectra_df_from_parser(p, n_samples=samples)

    models, eval = build_pipeline(sample_peaks_df, params, cache_path)

    writer_queue = JoinableQueue(2)
    writer_func = _imzml_writer_process if output_path else _null_writer_process
    writer_process = Process(target=writer_func, args=(output_path, writer_queue))
    writer_process.start()

    all_spectra_dfs = []

    try:
        chunk_size = 1000
        if limit:
            skip = max(0, (len(p.coordinates) - limit) // 2)
            sp_n = min(limit, len(p.coordinates) - skip)
        else:
            skip = 0
            sp_n = len(p.coordinates)

        for start_i in range(skip, skip + sp_n, chunk_size):
            end_i = min(start_i + chunk_size, len(p.coordinates))
            if start_i >= end_i:
                continue
            logger.debug(f'Reading spectra {start_i}-{end_i} out of {len(p.coordinates)}')
            peaks_df, spectra_df = get_spectra_df_from_parser(p, np.arange(start_i, end_i))
            eval.collect_peaks(peaks_df, 'before')
            # Convert to tuples, because spectra_df.loc coalesces everything into floats
            spectra_dict = {row[0]: row for row in spectra_df.itertuples()}
            all_spectra_dfs.append(spectra_df)

            logger.info(f'Transforming spectra {start_i}-{end_i}')
            for model in models:
                peaks_df = model.predict(peaks_df)

            eval.collect_peaks(peaks_df, 'after')

            writer_job = []
            for sp, grp in peaks_df.groupby('sp'):
                spectrum = spectra_dict[sp]
                writer_job.append((grp.mz, grp.ints, (spectrum.x, spectrum.y, spectrum.z)))

            logger.debug(f'Writing spectra {start_i}-{end_i}')
            writer_queue.put(writer_job)

        if cache_path:
            for model in models:
                model.save_cache()
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

        (debug_path / 'params.txt').open('wt').write(repr(params))

        all_spectra_df = pd.concat(all_spectra_dfs)

        for i, ((transform_name, *_), model) in enumerate(zip(params.transforms, models)):
            try:
                if hasattr(model, 'save_debug'):
                    model.save_debug(all_spectra_df, str(debug_path / f'{i}_{transform_name}'))
            except:
                logger.warning(f'{transform_name} error', exc_info=True)

        eval.get_report().to_csv(debug_path / 'evaluation_peaks.csv')

    return eval
