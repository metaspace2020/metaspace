import numpy as np


def _to_space_separated_string(arr):
    return np.array2string(
        np.array(arr),
        precision=9,
        threshold=2 ** 30,
        max_line_width=2 ** 30,
        formatter={'float_kind': lambda x: '%.9g' % x},
    )[1:-1]


def convert_imzml_to_txt(input_imzml, output_txt, output_coords_txt):
    from pyimzml.ImzMLParser import ImzMLParser

    with ImzMLParser(input_imzml, parse_lib='ElementTree') as parser:
        with open(output_txt, 'w') as spectra_file:
            for i in range(len(parser.coordinates)):
                mzs, ints = parser.getspectrum(i)
                mzs_formatted = _to_space_separated_string(mzs)
                ints_formatted = _to_space_separated_string(ints)
                spectra_file.write(f'{i}|{mzs_formatted}|{ints_formatted}\n')

        with open(output_coords_txt, 'w') as coord_file:
            coord_file.writelines(
                f'{i},{coord[0]},{coord[1]}\n' for i, coord in enumerate(parser.coordinates)
            )
