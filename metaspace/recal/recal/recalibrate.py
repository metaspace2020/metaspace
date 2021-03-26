from multiprocessing import Process, JoinableQueue
from pathlib import Path
import logging

import numpy as np
import pandas as pd
from pyimzml.ImzMLWriter import ImzMLWriter
import msiwarp as mx
from msiwarp.util.warp import to_mz, to_height, to_mx_peaks, generate_mean_spectrum
from pyimzml.ImzMLParser import ImzMLParser

logger = logging.getLogger(__name__)


#%% Build reference spectrum for alignment


def get_alignment_peaks(mean_spectrum):
    # Align only - use up to 100 most intense peaks from each quarter of the m/z range as reference
    mzs = to_mz(mean_spectrum)
    intss = to_height(mean_spectrum)
    chunk_edges = np.linspace(np.min(mzs), np.max(mzs), 5)
    s_ref = []
    for chunk_lo, chunk_hi in zip(chunk_edges[:-1], chunk_edges[1:]):
        chunk_mask = (mzs > chunk_lo) * (mzs <= chunk_hi)
        chunk_intss = intss[chunk_mask]
        n_samples = min(100, np.count_nonzero(chunk_mask) // 2)
        top_idxs = np.argsort(chunk_intss)[::-1][:n_samples]
        s_ref.extend(mean_spectrum[chunk_mask][top_idxs])

    return np.array(s_ref)[np.argsort(to_mz(s_ref))]


# ref_spectrum = get_alignment_peaks(mean_spectrum)


def get_warp_nodes(mz_lo, mz_hi, slack, n_steps=33, n_nodes=2):
    node_mzs = np.linspace(mz_lo, mz_hi, n_nodes)
    node_slacks = np.array([slack * sigma_1 * mz ** (3 / 2) for mz in node_mzs])
    nodes = mx.initialize_nodes(node_mzs, node_slacks, n_steps)
    return nodes


def get_aligned_mean_spectrum(spectra, mz_lo, mz_hi, tics, nodes):
    # Get ref peaks from unaligned mean spectrum
    mean_spectrum = generate_mean_spectrum(
        spectra, 2000000, sigma_1, mz_lo, mz_hi, tics, instrument, stride=1
    )
    ref_mzs = get_alignment_peaks(mean_spectrum)

    optimal_moves = mx.find_optimal_spectra_warpings(spectra, ref_mzs, nodes, epsilon)
    aligned_spectra = [
        mx.warp_peaks(spectrum, nodes, warping_func)
        for spectrum, warping_func in zip(spectra, optimal_moves)
    ]

    aligned_mean_spectrum = generate_mean_spectrum(
        aligned_spectra, 2000000, sigma_1, mz_lo, mz_hi, tics, instrument, stride=1
    )

    return aligned_mean_spectrum, ref_mzs


#%% Recalibrate dataset


# candidates_df = get_recal_candidates(mean_spectrum, mz_lo, mz_hi, adducts, charge)
# ref_spectrum = get_recal_peaks(candidate_df)


#%%


def imzml_writer_process(output_path, charge, queue):
    polarity = {1: 'positive', -1: 'negative'}.get(charge)
    with ImzMLWriter(output_path, polarity=polarity) as writer:
        while True:
            job = queue.get()
            queue.task_done()
            if job is not None:
                for mzs, ints, coord in job:
                    writer.addSpectrum(mzs, ints, coord)
            if job is None:
                return


def run_recal(input_path, adducts, charge, output_path=None):
    input_path = Path(input_path)
    p = ImzMLParser(input_path)
    output_path = Path(output_path or f'{input_path.parent}/{input_path.stem}_recal_8.imzML')

    # Get an aligned mean spectrum from sample spectra
    spectra, mz_lo, mz_hi, tics = get_sample_spectra(p)
    align_nodes = get_warp_nodes(mz_lo, mz_hi, slack=0.5, n_steps=33, n_nodes=2)
    aligned_mean_spectrum, align_peaks = get_aligned_mean_spectrum(
        spectra, mz_lo, mz_hi, tics, align_nodes
    )
    align_ppm = 5
    logger.info(f'Building align_peaks_df')
    align_peaks_df = get_hybrid_group_stats(
        pd.DataFrame(
            {
                'mz': to_mz(align_peaks),
                'ints': to_height(align_peaks),
                'sp': [p.id for p in align_peaks],
            }
        ),
        ppm=align_ppm,
        instrument='orbitrap',
        min_coverage=0.3,
    )
    logger.info(f'Built align_peaks_df {len(align_peaks_df)} peaks')

    # Get a global recalibration factor (to apply after individual spectra alignment)
    candidate_df = get_recal_candidates(aligned_mean_spectrum, mz_lo, mz_hi, adducts, charge)
    n_recal_nodes = 6  # Number of warp points, i.e. number of RANSAC lines + 1
    recal_peaks = get_recal_peaks(candidate_df, n_recal_nodes)
    recal_nodes = get_warp_nodes(mz_lo, mz_hi, slack=0.5, n_steps=101, n_nodes=n_recal_nodes)
    recal_move = mx.find_optimal_spectrum_warping(
        aligned_mean_spectrum, recal_peaks, recal_nodes, epsilon
    )
    for node, move in zip(recal_nodes, recal_move):
        print(f'Recal {node.mz:.6f} -> {node.mz + node.mz_shifts[move]:.6f}')

    writer_queue = JoinableQueue(2)
    writer_process = Process(target=imzml_writer_process, args=(output_path, charge, writer_queue))
    writer_process.start()

    chunk_size = 1000
    for start_i in range(0, len(p.coordinates), chunk_size):
        end_i = min(start_i + chunk_size, len(p.coordinates))
        spectra, _, _, _ = get_mx_spectra(p, range(start_i, end_i))

        logger.info(f'Aligning peaks {start_i}-{end_i} out of {len(p.coordinates)}')
        align_moves = mx.find_optimal_spectra_warpings(spectra, align_peaks, align_nodes, epsilon)

        logger.info(f'Warping peaks {start_i}-{end_i}')
        writer_job = []
        for coord, spectrum, align_move in zip(p.coordinates[start_i:end_i], spectra, align_moves):
            spectrum = mx.warp_peaks(spectrum, align_nodes, align_move)
            spectrum = mx.warp_peaks(spectrum, recal_nodes, recal_move)
            writer_job.append((to_mz(spectrum), to_height(spectrum), coord))

        writer_queue.put(writer_job)

    writer_queue.put(None)
    writer_queue.close()
    writer_queue.join()
    writer_process.join()
