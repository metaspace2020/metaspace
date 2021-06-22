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
        self.polarity = self._get_polarity()

    def _get_polarity(self):
        """Trying to find polarity information in the header of the file.
        Otherwise, we re-read the file with the option include_spectra_metadata='full'
        and try to find information in the body(`spectrumList`) section.
        """
        # check in header
        in_header = self._imzml_parser.metadata.referenceable_param_groups.get('spectrum1')
        if in_header:
            return self._check_and_convert_polarity(in_header)

        # check in body
        self._imzml_parser = ImzMLParser(
            self.filename, parse_lib='ElementTree', include_spectra_metadata='full'
        )
        in_spectrum = self._imzml_parser.spectrum_full_metadata
        if in_spectrum:
            return self._check_and_convert_polarity(in_spectrum)

        return 'unspecified'

    @classmethod
    def _check_and_convert_polarity(cls, meta):
        if meta.param_by_name.get('positive scan'):
            return 'positive'
        elif meta.param_by_name.get('negative scan'):
            return 'negative'
        else:
            return 'unspecified'

    def get_spectrum(self, idx):
        mzs, ints = self._imzml_parser.getspectrum(idx)
        nonzero_ints_mask = ints > 0
        return mzs[nonzero_ints_mask], ints[nonzero_ints_mask]
