from traceback import format_exc

from pyimzml.ImzMLParser import ImzMLParser
from sm.engine.errors import ImzMLError

from sm.engine.util import find_file_by_ext


class ImzMLParserWrapper:
    def __init__(self, path):
        self.filename = find_file_by_ext(path, 'imzml')
        try:
            self._imzml_parser = ImzMLParser(self.filename, parse_lib='ElementTree')
        except Exception as e:
            raise ImzMLError(format_exc()) from e
        self.coordinates = [coord[:2] for coord in self._imzml_parser.coordinates]
        self.mz_precision = self._imzml_parser.mzPrecision

    def get_spectrum(self, idx):
        mzs, ints = self._imzml_parser.getspectrum(idx)
        nonzero_ints_mask = ints > 0
        return mzs[nonzero_ints_mask], ints[nonzero_ints_mask]
