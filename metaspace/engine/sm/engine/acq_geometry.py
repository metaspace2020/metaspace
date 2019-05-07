
def make_ims_acq_geometry(ms_file_path):
    from pyimzml.ImzMLParser import ImzMLParser
    parser = ImzMLParser(ms_file_path)
    grid_props = parser.imzmldict
    return {
        'length_unit': 'nm',
        'acquisition_grid': {
            'regular_grid': True,
            'count_x': grid_props.get('max count of pixels x', 0),
            'count_y': grid_props.get('max count of pixels y', 0),
            'spacing_x': grid_props.get('pixel size x', 0.0),
            'spacing_y': grid_props.get('pixel size y', 0.0)
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': grid_props.get('pixel size x', 0.0),
            'size_y': grid_props.get('pixel size y', 0.0)
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
            'coord_list': pixel_coords
        },
        'pixel_size': {
            'regular_size': True,
            'size_x': 0,
            'size_y': 0,
        }
    }


def make_acq_geometry(type, ms_file_path):
    if type == 'ims':
        return make_ims_acq_geometry(ms_file_path)
    elif type == 'lcms':
        return make_lcms_acq_geometry(ms_file_path)
    else:
        raise ValueError('type')