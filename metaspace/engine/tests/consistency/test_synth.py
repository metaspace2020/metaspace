import numpy as np

from sm.engine.annotation.imzml_reader import FSImzMLReader
from tests.consistency.synth import (
    make_dense_arrays,
    make_formulas,
    make_image_cases,
    make_spectrum_set,
    write_imzml,
)


def test_formulas_deterministic_sorted_unique():
    first = make_formulas(100, seed=3)
    assert first == make_formulas(100, seed=3)
    assert first == sorted(first)
    assert len(set(first)) == len(first) == 100
    assert first != make_formulas(100, seed=4)


def test_formulas_cover_required_elements():
    joined = ' '.join(make_formulas(150))
    for element in ['Cl', 'Br', 'S', 'P', 'Cx']:
        assert element in joined


def test_image_cases_deterministic():
    for left, right in zip(make_image_cases(seed=1), make_image_cases(seed=1)):
        assert left.name == right.name
        assert left.flat.tobytes() == right.flat.tobytes()


def test_image_cases_names_and_edge_properties():
    cases = {case.name: case for case in make_image_cases()}
    assert set(cases) == {
        'dense',
        'sparse_blob',
        'single_pixel',
        'all_zero_peak',
        'missing_m3',
        'duplicate_coords',
    }
    assert cases['single_pixel'].images[0].nnz == 1
    dup = cases['duplicate_coords'].images[0]
    assert len(set(zip(dup.row, dup.col))) < dup.nnz
    assert any(img.nnz == 0 for img in cases['all_zero_peak'].images)
    assert cases['missing_m3'].images[3].nnz == 0
    for case in cases.values():
        assert len(case.images) == len(case.mz_images) == case.flat.shape[0] == 4
        assert case.theo_ints.shape == case.theo_mzs.shape == (4,)
        assert case.images[0].nnz > 0


def test_dense_arrays_include_degenerate():
    arrays = dict(make_dense_arrays())
    assert not arrays['all_zero'].any()
    assert np.ptp(arrays['constant']) == 0 and arrays['constant'][0, 0] != 0


def test_write_imzml_roundtrip_continuous_and_processed(tmp_path):
    mzs, ints, coords = make_spectrum_set()
    for mode in ['continuous', 'processed']:
        mode_dir = tmp_path / mode
        mode_dir.mkdir()
        imzml_path, ibd_path = write_imzml(str(mode_dir / 'ds.imzML'), mzs, ints, coords, mode=mode)
        assert imzml_path.endswith('.imzML') and ibd_path.endswith('.ibd')
        reader = FSImzMLReader(mode_dir)
        assert reader.n_spectra == len(coords)
        xs = sorted({c[0] for c in coords})
        assert reader.w == len(xs)
        assert reader.xs.tolist() == [c[0] - min(xs) for c in coords]


def test_scoring_frames_deterministic():
    from tests.consistency.synth import make_scoring_frames

    t1, d1 = make_scoring_frames(seed=2)
    t2, d2 = make_scoring_frames(seed=2)
    assert t1.equals(t2) and d1.equals(d2)
    assert (t1.chaos == 0).any() and (d1.chaos == 0).any()
    assert list(t1.columns) == ['chaos', 'spatial', 'spectral', 'mz_err_abs', 'mz_err_rel', 'msm']
