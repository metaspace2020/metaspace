from typing import Any, Dict, Iterator, List, Optional, Tuple

POSITIVE_SCAN = 'MS:1000130'
NEGATIVE_SCAN = 'MS:1000129'
CENTROID_SPECTRUM = 'MS:1000127'
PROFILE_SPECTRUM = 'MS:1000128'
CONTINUOUS = 'IMS:1000030'
PROCESSED = 'IMS:1000031'
UUID = 'IMS:1000080'
IBD_MD5 = 'IMS:1000090'
IBD_SHA1 = 'IMS:1000091'
PIXEL_SIZE_X = 'IMS:1000046'
PIXEL_SIZE_Y = 'IMS:1000047'
MAX_PIXELS_X = 'IMS:1000042'
MAX_PIXELS_Y = 'IMS:1000043'
MATRIX_SOLUTION = 'MS:1000834'
INSTRUMENT_MODEL = 'MS:1000031'

ANALYZER_FAMILIES = {
    'orbitrap': ('orbitrap',),
    'fticr': ('fticr', 'ft-icr', 'fourier transform', 'cyclotron'),
    'tof': ('tof', 'time-of-flight', 'time of flight'),
}

TO_MICROMETER = {'micrometer': 1.0, 'millimeter': 1000.0, 'nanometer': 0.001}

# (name, accession, parsed_value, raw_name, raw_value, unit_name, unit_accession)
CvParam = Tuple[Any, ...]


def _iter_groups(metadata) -> Iterator[Tuple[str, Any]]:
    yield 'file_content', metadata.file_description
    for src in metadata.file_description.subelements.get('source_files', {}).values():
        yield 'source_file', src
    for group in metadata.referenceable_param_groups.values():
        yield 'referenceable', group
    for group in metadata.samples.values():
        yield 'sample', group
    for group in metadata.softwares.values():
        yield 'software', group
    for group in metadata.scan_settings.values():
        yield 'scan_settings', group
        for target in group.subelements.get('targets', {}).values():
            yield 'target', target
    for group in metadata.instrument_configurations.values():
        yield 'instrument', group
        for comp in group.subelements.get('components', []):
            yield comp.type, comp
    for group in metadata.data_processings.values():
        yield 'data_processing', group


def _collect(metadata) -> List[Tuple[str, CvParam]]:
    return [(section, p) for section, group in _iter_groups(metadata) for p in group.cv_params]


def _first_value(params: List[Tuple[str, CvParam]], accession: str) -> Optional[CvParam]:
    for _, param in params:
        if param[1] == accession:
            return param
    return None


def _has(params: List[Tuple[str, CvParam]], accession: str) -> bool:
    return _first_value(params, accession) is not None


def _names(params: List[Tuple[str, CvParam]], section: str) -> List[str]:
    return sorted({str(p[0]) for s, p in params if s == section})


def _pixel_size_um(params, accession) -> Optional[float]:
    param = _first_value(params, accession)
    if param is None or not isinstance(param[2], (int, float)) or isinstance(param[2], bool):
        return None
    return float(param[2]) * TO_MICROMETER.get(str(param[5]), 1.0)


def _int_value(params, accession) -> Optional[int]:
    param = _first_value(params, accession)
    if param is None or not isinstance(param[2], (int, float)) or isinstance(param[2], bool):
        return None
    return int(param[2])


def _str_value(params, accession) -> Optional[str]:
    param = _first_value(params, accession)
    if param is None or param[2] in (None, True):
        return None
    return str(param[2])


def _polarity(params) -> Optional[str]:
    pos, neg = _has(params, POSITIVE_SCAN), _has(params, NEGATIVE_SCAN)
    if pos and neg:
        return 'mixed'
    if pos:
        return 'positive'
    if neg:
        return 'negative'
    return None


def _representation(params) -> Optional[str]:
    prof, cent = _has(params, PROFILE_SPECTRUM), _has(params, CENTROID_SPECTRUM)
    if prof and cent:
        return 'mixed'
    if prof:
        return 'profile'
    if cent:
        return 'centroid'
    return None


def _layout(params) -> Optional[str]:
    if _has(params, CONTINUOUS):
        return 'continuous'
    if _has(params, PROCESSED):
        return 'processed'
    return None


def extract_header_metadata(parser) -> Dict[str, Any]:
    """Summarise an ImzMLParser's header into a small plain dict. Never raises."""
    result: Dict[str, Any] = {
        'polarity': None,
        'representation': None,
        'layout': None,
        'pixel_size_x_um': None,
        'pixel_size_y_um': None,
        'max_pixels_x': None,
        'max_pixels_y': None,
        'uuid': None,
        'has_ibd_checksum': False,
        'instrument_models': [],
        'sources': [],
        'analyzers': [],
        'detectors': [],
        'matrix': None,
        'softwares': [],
        'cv_terms': [],
        'error': None,
    }
    try:
        params = _collect(parser.metadata)
        result.update(
            polarity=_polarity(params),
            representation=_representation(params),
            layout=_layout(params),
            pixel_size_x_um=_pixel_size_um(params, PIXEL_SIZE_X),
            pixel_size_y_um=_pixel_size_um(params, PIXEL_SIZE_Y),
            max_pixels_x=_int_value(params, MAX_PIXELS_X),
            max_pixels_y=_int_value(params, MAX_PIXELS_Y),
            uuid=_str_value(params, UUID),
            has_ibd_checksum=_has(params, IBD_MD5) or _has(params, IBD_SHA1),
            instrument_models=_names(params, 'instrument'),
            sources=_names(params, 'source'),
            analyzers=_names(params, 'analyzer'),
            detectors=_names(params, 'detector'),
            matrix=_str_value(params, MATRIX_SOLUTION),
            softwares=_names(params, 'software'),
            cv_terms=sorted({(str(p[1]), str(p[0]), str(p[3])) for _, p in params}),
        )
    except Exception as e:  # pylint: disable=broad-except
        result['error'] = repr(e)
    return result


def normalize_form_metadata(
    ds_metadata: Dict[str, Any], ds_config: Dict[str, Any]
) -> Dict[str, Any]:
    """Pick the comparable fields out of the submission form. Never raises."""
    ms_analysis = (ds_metadata or {}).get('MS_Analysis') or {}
    polarity = ms_analysis.get('Polarity')
    pixel = ms_analysis.get('Pixel_Size') or {}
    resolving_power = ms_analysis.get('Detector_Resolving_Power') or {}
    image_gen = (ds_config or {}).get('image_generation') or {}
    return {
        'polarity': polarity.lower() if isinstance(polarity, str) else None,
        'analyzer': ms_analysis.get('Analyzer'),
        'source': ms_analysis.get('Ionisation_Source'),
        'matrix': ((ds_metadata or {}).get('Sample_Preparation') or {}).get('MALDI_Matrix'),
        'pixel_size_x_um': pixel.get('Xaxis'),
        'pixel_size_y_um': pixel.get('Yaxis'),
        'resolving_power': resolving_power.get('Resolving_Power'),
        'resolving_power_mz': resolving_power.get('mz'),
        'ppm': image_gen.get('ppm'),
    }


def analyzer_family(text: Optional[str]) -> Optional[str]:
    lowered = (text or '').lower()
    for family, keywords in ANALYZER_FAMILIES.items():
        if any(k in lowered for k in keywords):
            return family
    return None
