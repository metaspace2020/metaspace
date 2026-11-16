import logging
import time
from typing import Any, Callable, Dict, Optional

import numpy as np

from sm.engine.annotation.qc import array_checks, header_checks, sample_checks
from sm.engine.annotation.qc.layout import analyze_layout
from sm.engine.annotation.qc.metadata import normalize_form_metadata
from sm.engine.annotation.qc.report import CheckResult, Evidence, Mode, QCReport
from sm.engine.annotation.qc.sampling import DEFAULT_SEED, read_raw_spectra, sample_spectrum_indices

logger = logging.getLogger('engine')
DEFAULT_BIN_PPM = 3.0


def _mode(qc_conf: Dict[str, Any], name: str) -> Mode:
    return Mode(qc_conf['checks'].get(name, {}).get('mode', 'shadow'))


def run_check(
    report: QCReport, qc_conf: Dict[str, Any], tier: str, name: str, fn: Callable[[], CheckResult]
) -> CheckResult:
    """Run one check, record timing and mode, and never raise."""
    start = time.perf_counter()
    try:
        result = fn()
    except Exception as e:  # pylint: disable=broad-except
        logger.warning(f'QC check {name} failed', exc_info=True)
        result = CheckResult(name=name, tier=tier, evidence=Evidence.NOT_ASSESSABLE, error=repr(e))
    result.mode = _mode(qc_conf, name)
    result.runtime_ms = (time.perf_counter() - start) * 1000
    report.add(result)
    return result


def run_tier(report: QCReport, tier: str, fn: Callable[[], None]) -> None:
    """Guard a whole tier so that an unexpected failure only sets report.error."""
    start = time.perf_counter()
    try:
        fn()
    except Exception as e:  # pylint: disable=broad-except
        logger.warning(f'QC tier {tier} failed', exc_info=True)
        report.error = f'tier {tier}: {e!r}'
    report.timings[f'tier_{tier}'] = (time.perf_counter() - start) * 1000


def _cfg(qc_conf: Dict[str, Any], name: str) -> Dict[str, Any]:
    return qc_conf['checks'].get(name, {})


def run_tier_a(
    report: QCReport,
    reader,
    qc_inputs: Dict[str, Any],
    read_ibd_head: Optional[Callable[[], bytes]] = None,
) -> None:
    """Header-only checks. ``reader`` is an ImzMLReader exposing ``header_metadata``."""

    def body():
        qc_conf = qc_inputs['config']
        header = reader.header_metadata
        form = normalize_form_metadata(qc_inputs.get('ds_metadata'), qc_inputs.get('ds_config'))
        parser = reader.imzml_reader
        raw_max = reader.raw_coord_bounds[1]

        layout = analyze_layout(reader.xs + 1, reader.ys + 1)
        report.metrics['layout'] = layout
        report.metrics['header'] = {k: v for k, v in header.items() if k != 'cv_terms'}
        report.metrics['form'] = form
        report.metrics['file_mz_range'] = {
            'min': float(reader.min_mz) if np.isfinite(reader.min_mz) else None,
            'max': float(reader.max_mz) if np.isfinite(reader.max_mz) else None,
            'from_metadata': bool(reader.is_mz_from_metadata),
        }

        def ibd_head():
            return read_ibd_head() if read_ibd_head else None

        checks = {
            'metadata_form': lambda: header_checks.check_metadata_form(header, form, raw_max),
            'profile_term': lambda: header_checks.check_profile_term(header),
            'ontology': lambda: header_checks.check_ontology(header),
            'declared_layout': lambda: header_checks.check_declared_layout(
                header, parser.mzOffsets
            ),
            'ibd_uuid': lambda: header_checks.check_ibd_uuid(header, ibd_head()),
            'declared_peak_count': lambda: header_checks.check_declared_peak_count(
                parser.mzLengths, _cfg(qc_conf, 'declared_peak_count')
            ),
            'empty_spectra': lambda: header_checks.check_empty_spectra(
                parser.mzLengths, _cfg(qc_conf, 'empty_spectra')
            ),
            'layout_dense_size': lambda: header_checks.check_layout_dense_size(
                layout, _cfg(qc_conf, 'layout_dense_size')
            ),
            'layout_coordinates': lambda: header_checks.check_layout_coordinates(layout),
        }
        for name, fn in checks.items():
            run_check(report, qc_conf, header_checks.TIER, name, fn)

    run_tier(report, header_checks.TIER, body)


def run_tier_b(report: QCReport, reader, qc_inputs: Dict[str, Any], storage) -> None:
    """Checks on a small seeded sample of unprocessed spectra, read before the full load."""

    def body():
        qc_conf = qc_inputs['config']
        form = normalize_form_metadata(qc_inputs.get('ds_metadata'), qc_inputs.get('ds_config'))
        indices = sample_spectrum_indices(reader.n_spectra, qc_conf['sample_size'], DEFAULT_SEED)
        spectra = read_raw_spectra(reader, storage, indices)
        report.metrics['sample'] = {'n_spectra': len(spectra), 'seed': DEFAULT_SEED}

        checks = {
            'profile_likeness': lambda: sample_checks.check_profile_likeness(
                spectra, form, _cfg(qc_conf, 'profile_likeness')
            ),
            'mz_order': lambda: sample_checks.check_mz_order(spectra, _cfg(qc_conf, 'mz_order')),
            'saturation': lambda: sample_checks.check_saturation(
                spectra, _cfg(qc_conf, 'saturation')
            ),
            'intensity_transform': lambda: sample_checks.check_intensity_transform(spectra),
            'near_floor': lambda: sample_checks.check_near_floor(
                spectra, _cfg(qc_conf, 'near_floor')
            ),
            'sample_values': lambda: sample_checks.check_sample_values(spectra),
        }
        for name, fn in checks.items():
            run_check(report, qc_conf, sample_checks.TIER, name, fn)

    run_tier(report, sample_checks.TIER, body)


def run_tier_c1(report: QCReport, reader, qc_inputs: Dict[str, Any], mzs, ints, sp_lens) -> None:
    """Full-array checks on the loaded, still unsorted arrays."""

    def body():
        qc_conf = qc_inputs['config']
        representation = reader.header_metadata.get('representation')
        declared = reader.imzml_reader.mzLengths
        checks = {
            'array_validity': lambda: array_checks.check_array_validity(mzs, ints),
            'zero_fraction': lambda: array_checks.check_zero_fraction(
                sp_lens, declared, representation, _cfg(qc_conf, 'zero_fraction')
            ),
            'peak_count': lambda: array_checks.check_peak_count(
                sp_lens, _cfg(qc_conf, 'peak_count')
            ),
            'tic': lambda: array_checks.check_tic(
                array_checks.spectrum_tic(ints, sp_lens), _cfg(qc_conf, 'tic')
            ),
        }
        for name, fn in checks.items():
            run_check(report, qc_conf, array_checks.TIER_C1, name, fn)

    run_tier(report, array_checks.TIER_C1, body)


def run_tier_c2(report: QCReport, reader, qc_inputs: Dict[str, Any], mzs, ints, sp_idxs) -> None:
    """Occupancy and spatial checks on the sorted arrays, before they are uploaded."""

    def body():
        qc_conf = qc_inputs['config']
        form = normalize_form_metadata(qc_inputs.get('ds_metadata'), qc_inputs.get('ds_config'))
        occupancy_cfg = _cfg(qc_conf, 'low_occupancy')
        bin_ppm = float(occupancy_cfg.get('bin_ppm') or form.get('ppm') or DEFAULT_BIN_PPM)

        start = time.perf_counter()
        bins = array_checks.build_bins(mzs, bin_ppm, occupancy_cfg['max_bins'])
        report.timings['c2_binning'] = (time.perf_counter() - start) * 1000

        low = run_check(
            report,
            qc_conf,
            array_checks.TIER_C2,
            'low_occupancy',
            lambda: array_checks.check_low_occupancy(bins, occupancy_cfg),
        )
        coherence = run_check(
            report,
            qc_conf,
            array_checks.TIER_C2,
            'spatial_coherence',
            lambda: array_checks.check_spatial_coherence(
                {'sp_idxs': sp_idxs, 'ints': ints},
                bins,
                reader.mask,
                _cfg(qc_conf, 'spatial_coherence'),
            ),
        )
        run_check(
            report,
            qc_conf,
            array_checks.TIER_C2,
            'noise_combined',
            lambda: array_checks.check_noise_combined(
                low, coherence, _cfg(qc_conf, 'noise_combined')
            ),
        )

    run_tier(report, array_checks.TIER_C2, body)
