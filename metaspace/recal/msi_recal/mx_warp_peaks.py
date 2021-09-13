from typing import Protocol, List, Dict

import numpy as np
import pandas as pd


class WarpNode(Protocol):
    mz: float
    mz_shifts: List[float]
    slack: float


def nodes_to_lines(nodes, moves, flat_ends=True):
    src_mzs = [node.mz for node in nodes]
    dst_mzs = [node.mz + node.mz_shifts[move] for node, move in zip(nodes, moves)]
    if flat_ends:
        src_mzs = [src_mzs[0] - 1, *src_mzs, src_mzs[-1] + 1]
        dst_mzs = [dst_mzs[0] - 1, *dst_mzs, dst_mzs[-1] + 1]
    bin_edges = np.array(src_mzs[1:-1])
    M = np.diff(dst_mzs) / np.diff(src_mzs)
    C = np.array(dst_mzs[:-1]) - np.array(src_mzs[:-1]) * M

    return bin_edges, M, C


def warp_peaks(mzs: np.ndarray, nodes: List[WarpNode], moves: List[int], flat_ends=True, out=None):
    assert (np.diff(mzs) >= 0).all(), 'mzs must be monotonic increasing'

    bin_edges, M, C = nodes_to_lines(nodes, moves, flat_ends)
    bin_idxs = [0, *np.searchsorted(mzs, bin_edges), len(mzs)]
    if out is None:
        out = np.empty_like(mzs)

    for bin_lo, bin_hi, m, c in zip(bin_idxs, bin_idxs[1:], M, C):
        if bin_lo != bin_hi:
            out[bin_lo:bin_hi] = mzs[bin_lo:bin_hi] * m + c

    return out


def warp_peaks_df(
    df: pd.DataFrame, nodes: Dict[int, List[WarpNode]], moves: Dict[int, List[int]], flat_ends=True
):
    """Reimplementation of mx.warp_peaks with no marshalling overhead and a guarantee that the dataframe index will be preserved.
    Requires that peaks_df is sorted by sp, then by mz.
    :param flat_ends: How to handle peaks outside the range defined by nodes/moves.
        False - same linear equation as the nearest in-range peak - mass adjustment will continue to increase as m/z is further out of range
        True - same offset as the nearest in-range peak - mass adjustment will be constant outside of the defined range
    """
    assert df.sp.is_monotonic
    mzs = df.mz.values
    sps = df.sp.values
    new_mzs = np.empty_like(mzs)
    sp_segms = np.flatnonzero(np.diff(sps, prepend=np.nan, append=np.nan))
    for sp_lo, sp_hi in zip(sp_segms, sp_segms[1:]):
        segm_mzs = mzs[sp_lo:sp_hi]
        assert segm_mzs.is_monotonic
        sp = sps[sp_lo]
        bin_edges, M, C = nodes_to_lines(nodes[sp], moves[sp], flat_ends)
        bin_idxs = [sp_lo, *np.searchsorted(segm_mzs, bin_edges), sp_hi]
        for bin_lo, bin_hi, m, c in zip(bin_idxs, bin_idxs[1:], M, C):
            if bin_lo != bin_hi:
                new_mzs[sp_lo + bin_lo : sp_lo + bin_hi] = segm_mzs[bin_lo:bin_hi] * m + c

    return df.assign(mz=new_mzs)
