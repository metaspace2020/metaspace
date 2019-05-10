
def make_ims_acq_geometry(ms_file_path, metadata, dims):
    pixel_size = metadata.get('MS_Analysis', {}).get('Pixel_Size', {})

    # if ms_file_path is not None:
    #     from pyimzml.ImzMLParser import ImzMLParser
    #     parser = ImzMLParser(ms_file_path)
    #     grid_props = parser.imzmldict
    # else:
    #     grid_props = {}

    return {
        'length_unit': 'nm',
        'acquisition_grid': {
            'regular_grid': True,
            'count_x': int(dims[0]),
            'count_y': int(dims[1])
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': pixel_size.get('Xaxis'),
            'size_y': pixel_size.get('Yaxis')
        }
    }


def make_lcms_acq_geometry(ms_file_path):
    from sm.engine.mzml_reading import read_ms1_experiment
    ms_experiment = read_ms1_experiment(ms_file_path)
    pixel_coords = [(spec.getRT(), 0.0) for spec in ms_experiment]
    return {
        'length_unit': 's',
        'acquisition_grid': {
            'regular_grid': False,
            'coord_list': pixel_coords,
            'count_x': len(pixel_coords),
            'count_y': 1
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': 1,
            'size_y': 1,
        }
    }


def make_acq_geometry(type, ms_file_path, metadata, dims):
    if type == 'ims':
        return make_ims_acq_geometry(ms_file_path, metadata, dims)
    elif type == 'lcms':
        return make_lcms_acq_geometry(ms_file_path)
    else:
        raise ValueError('type')