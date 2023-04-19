# TODO: remove all make_*_acq_geometry functions except this one
def make_acq_geometry_lithops(metadata, dims, n_spectra):
    pixel_size = metadata.get('MS_Analysis', {}).get('Pixel_Size', {})
    row_n, col_n = dims

    return {
        'length_unit': 'nm',
        'pixel_count': n_spectra,
        'acquisition_grid': {'regular_grid': True, 'count_x': int(col_n), 'count_y': int(row_n)},
        'pixel_size': {
            'regular_size': True,
            'size_x': pixel_size.get('Xaxis'),
            'size_y': pixel_size.get('Yaxis'),
        },
    }


def make_ims_acq_geometry(metadata, dims):
    pixel_size = metadata.get('MS_Analysis', {}).get('Pixel_Size', {})
    row_n, col_n = dims

    return {
        'length_unit': 'nm',
        'acquisition_grid': {'regular_grid': True, 'count_x': int(col_n), 'count_y': int(row_n)},
        'pixel_size': {
            'regular_size': True,
            'size_x': pixel_size.get('Xaxis'),
            'size_y': pixel_size.get('Yaxis'),
        },
    }


def make_lcms_acq_geometry(ms_file_path):
    # pylint: disable=import-outside-toplevel
    from sm.engine.annotation.mzml_parser import MzMLParser

    ms_experiment = MzMLParser.read_ms1_experiment(ms_file_path)
    pixel_coords = [(spec.getRT(), 0.0) for spec in ms_experiment]
    return {
        'length_unit': 's',
        'acquisition_grid': {
            'regular_grid': False,
            'coord_list': pixel_coords,
            'count_x': len(pixel_coords),
            'count_y': 1,
        },
        'pixel_size': {'regular_size': True, 'size_x': 1, 'size_y': 1},
    }


def make_acq_geometry(data_type, ms_file_path, metadata, dims):
    if data_type == 'ims':
        return make_ims_acq_geometry(metadata, dims)

    if data_type == 'lcms':
        return make_lcms_acq_geometry(ms_file_path)

    raise ValueError('type')
