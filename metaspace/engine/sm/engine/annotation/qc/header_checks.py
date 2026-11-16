from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from sm.engine.annotation.qc.metadata import analyzer_family
from sm.engine.annotation.qc.report import CheckResult, Evidence

TIER = 'A'
MAX_LISTED = 20
PIXEL_SIZE_REL_TOL = 0.01


def _result(name: str, **kwargs) -> CheckResult:
    return CheckResult(name=name, tier=TIER, **kwargs)


def _is_desi(text: str) -> bool:
    lowered = text.lower()
    return 'desi' in lowered or 'desorption electrospray' in lowered


def _row(field: str, file_val: Any, form_val: Any, status: str, confidence: str) -> Dict[str, Any]:
    return {
        'field': field,
        'file': file_val,
        'form': form_val,
        'status': status,
        'confidence': confidence,
    }


def _compare(file_val: Any, form_val: Any, equal) -> str:
    if file_val is None:
        return 'missing_file'
    if form_val is None:
        return 'missing_form'
    return 'match' if equal(file_val, form_val) else 'mismatch'


def _close(left: Any, right: Any) -> bool:
    left, right = float(left), float(right)
    return abs(left - right) <= PIXEL_SIZE_REL_TOL * max(abs(left), abs(right), 1e-9)


def _grid_status(header: Dict[str, Any], raw_max: Sequence[int]) -> Dict[str, Any]:
    row = {}
    for axis, key, idx in (('x', 'max_pixels_x', 0), ('y', 'max_pixels_y', 1)):
        declared = header.get(key)
        row[axis] = {'declared': declared, 'max_coordinate': int(raw_max[idx])}
        row[axis]['contradiction'] = declared is not None and int(raw_max[idx]) > declared
    return row


def _missing_field_count(header: Dict[str, Any]) -> int:
    keys = (
        'polarity',
        'representation',
        'layout',
        'pixel_size_x_um',
        'pixel_size_y_um',
        'max_pixels_x',
        'max_pixels_y',
        'uuid',
        'instrument_models',
        'sources',
        'analyzers',
    )
    return sum(1 for k in keys if not header.get(k))


def check_metadata_form(
    header: Dict[str, Any], form: Dict[str, Any], raw_max_coord: Sequence[int]
) -> CheckResult:
    rows: List[Dict[str, Any]] = []
    file_polarity = header.get('polarity')
    rows.append(
        _row(
            'polarity',
            file_polarity,
            form.get('polarity'),
            _compare(file_polarity, form.get('polarity'), lambda a, b: a == b),
            'high',
        )
    )
    for axis in ('x', 'y'):
        file_val, form_val = header.get(f'pixel_size_{axis}_um'), form.get(f'pixel_size_{axis}_um')
        status = _compare(file_val, form_val, _close)
        rows.append(_row(f'pixel_size_{axis}_um', file_val, form_val, status, 'high'))

    grid = _grid_status(header, raw_max_coord)
    for axis, info in grid.items():
        status = 'missing_file' if info['declared'] is None else 'match'
        if info['contradiction']:
            status = 'contradiction'
        rows.append(_row(f'grid_{axis}', info['declared'], info['max_coordinate'], status, 'high'))

    file_family = analyzer_family(
        ' '.join(header.get('instrument_models', []) + header.get('analyzers', []))
    )
    form_family = analyzer_family(form.get('analyzer'))
    if file_family is None or form_family is None:
        status = 'unknown'
    else:
        status = 'match' if file_family == form_family else 'mismatch'
    rows.append(_row('instrument_family', file_family, form_family, status, 'medium'))

    sources = ' '.join(header.get('sources', []))
    form_matrix = (form.get('matrix') or '').strip()
    conflict = bool(sources) and _is_desi(sources) and bool(form_matrix)
    rows.append(
        _row(
            'source_vs_matrix',
            sources or None,
            form_matrix or None,
            'conflict' if conflict else 'ok',
            'medium',
        )
    )

    rows.append(_row('source_text', header.get('sources'), form.get('source'), 'recorded', 'low'))
    rows.append(
        _row('analyzer_text', header.get('analyzers'), form.get('analyzer'), 'recorded', 'low')
    )
    rows.append(_row('matrix_text', header.get('matrix'), form_matrix or None, 'recorded', 'low'))

    mismatches = [
        r['field'] for r in rows if r['status'] in ('mismatch', 'conflict', 'contradiction')
    ]
    contradiction = any(info['contradiction'] for info in grid.values())
    return _result(
        'metadata_form',
        value=len(mismatches),
        evidence=Evidence.DIRECT,
        would_block=contradiction,
        details={
            'rows': rows,
            'mismatches': mismatches,
            'softwares': header.get('softwares', []),
            'missing_fields': _missing_field_count(header),
        },
    )


def check_profile_term(header: Dict[str, Any]) -> CheckResult:
    representation = header.get('representation')
    return _result(
        'profile_term',
        value=representation,
        threshold='profile',
        evidence=Evidence.DIRECT if representation else Evidence.NOT_ASSESSABLE,
        would_block=representation == 'profile',
    )


def check_ontology(header: Dict[str, Any]) -> CheckResult:
    # pylint: disable=import-outside-toplevel # pyimzml ontology tables are large
    from pyimzml.ontology.ontology import all_terms

    unknown, renamed = [], []
    for accession, name, raw_name in header.get('cv_terms', []):
        if accession not in all_terms:
            unknown.append(accession)
        elif raw_name not in ('None', name):
            renamed.append({'accession': accession, 'name': name, 'raw_name': raw_name})
    return _result(
        'ontology',
        value=len(unknown) + len(renamed),
        evidence=Evidence.DIRECT,
        details={
            'n_terms': len(header.get('cv_terms', [])),
            'unknown_accessions': unknown[:MAX_LISTED],
            'renamed': renamed[:MAX_LISTED],
        },
    )


def check_declared_layout(header: Dict[str, Any], mz_offsets: Sequence[int]) -> CheckResult:
    declared = header.get('layout')
    identical = bool(len(mz_offsets)) and len(set(mz_offsets)) == 1
    if declared is None:
        return _result('declared_layout', evidence=Evidence.NOT_ASSESSABLE)
    return _result(
        'declared_layout',
        value=declared,
        evidence=Evidence.DIRECT,
        would_block=declared == 'continuous' and not identical,
        details={'identical_mz_offsets': identical, 'n_unique_offsets': len(set(mz_offsets))},
    )


def _normalise_uuid(text: str) -> str:
    return text.strip().strip('{}').replace('-', '').lower()


def check_ibd_uuid(header: Dict[str, Any], ibd_head: Optional[bytes]) -> CheckResult:
    declared = header.get('uuid')
    details = {'checksum_declared': header.get('has_ibd_checksum'), 'checksum_verified': False}
    if not declared or ibd_head is None or len(ibd_head) < 16:
        return _result('ibd_uuid', evidence=Evidence.NOT_ASSESSABLE, details=details)
    matches = _normalise_uuid(declared) == bytes(ibd_head[:16]).hex()
    return _result(
        'ibd_uuid',
        value=matches,
        evidence=Evidence.DIRECT,
        would_block=not matches,
        details=details,
    )


def check_declared_peak_count(mz_lengths: Sequence[int], cfg: Dict[str, Any]) -> CheckResult:
    lengths = np.asarray(mz_lengths)
    pct = dict(zip((5, 25, 50, 95), np.percentile(lengths, [5, 25, 50, 95])))
    median = pct[50]
    fail_below, warn_below = cfg.get('fail_below'), cfg.get('warn_below')
    return _result(
        'declared_peak_count',
        value=float(median),
        threshold={'warn_below': warn_below, 'fail_below': fail_below},
        evidence=Evidence.DIRECT,
        would_block=fail_below is not None and median < fail_below,
        details={
            'p5': float(pct[5]),
            'p25': float(pct[25]),
            'p95': float(pct[95]),
            'warn': warn_below is not None and bool(median < warn_below),
        },
    )


def check_empty_spectra(mz_lengths: Sequence[int], cfg: Dict[str, Any]) -> CheckResult:
    lengths = np.asarray(mz_lengths)
    empty = np.flatnonzero(lengths == 0)
    fraction = float(len(empty) / max(len(lengths), 1))
    max_fraction = cfg.get('max_fraction')
    return _result(
        'empty_spectra',
        value=fraction,
        threshold=max_fraction,
        evidence=Evidence.DIRECT,
        would_block=max_fraction is not None and fraction > max_fraction,
        details={'n_empty': int(len(empty)), 'first_indices': empty[:MAX_LISTED].tolist()},
    )


def check_layout_dense_size(layout: Dict[str, Any], cfg: Dict[str, Any]) -> CheckResult:
    dense_size = layout.get('dense_size')
    if dense_size is None:
        return _result('layout_dense_size', evidence=Evidence.NOT_ASSESSABLE)
    too_dense = dense_size > cfg['max_pixels'] or layout['n_spectra'] > cfg['max_spectra']
    fill = layout['fill_fraction']
    return _result(
        'layout_dense_size',
        value=int(dense_size),
        threshold={'max_pixels': cfg['max_pixels'], 'max_spectra': cfg['max_spectra']},
        evidence=Evidence.DIRECT,
        would_block=too_dense,
        details={
            'n_spectra': layout['n_spectra'],
            'fill_fraction': fill,
            'low_fill': fill < cfg['low_fill_warn'],
        },
    )


def check_layout_coordinates(layout: Dict[str, Any]) -> CheckResult:
    n_bad = layout.get('n_invalid', 0) + layout.get('n_duplicates', 0)
    return _result(
        'layout_coordinates',
        value=n_bad,
        threshold=0,
        evidence=Evidence.DIRECT,
        would_block=n_bad > 0,
        details={
            'n_invalid': layout.get('n_invalid', 0),
            'n_duplicates': layout.get('n_duplicates', 0),
            'empty_columns': layout.get('empty_columns'),
            'empty_rows': layout.get('empty_rows'),
        },
    )
