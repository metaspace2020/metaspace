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
        """
        Get polarity from imzml file.

        Trying to find polariry information in the header of the file.
        Otherwise, we re-read the file with the option include_spectra_metadata='full'
        and try to find information in the body(`spectrumList`) section.
        Returned value:
          +1 - positive polarity
          -1 - negative polarity
           0 - polarity not set in file
        """
        in_header, polarity = self._check_polarity_in_header()
        if in_header:  # pylint: disable=no-else-return
            return polarity
        else:
            self._imzml_parser = ImzMLParser(
                self.filename, parse_lib='ElementTree', include_spectra_metadata='full'
            )
            in_spectrum, polarity = self._check_polarity_in_body()
            if in_spectrum:
                return polarity

            return 0

    def _check_polarity_in_header(self):
        """
        Check info about polarity in header of imzml file.

        Inside `referenceableParamGroupList`.
        """
        header = self._imzml_parser.metadata.referenceable_param_groups.get('spectrum1')
        if header:
            return self._check_and_convert_polarity(header)

        return False, 0

    def _check_polarity_in_body(self):
        """
        Check info about polarity in body of imzml file.

        Inside first `spectrum` of `spectrumList`.
        """
        spectrum_meta = self._imzml_parser.spectrum_full_metadata
        if spectrum_meta:
            return self._check_and_convert_polarity(spectrum_meta[0])

        return False, 0

    @classmethod
    def _check_and_convert_polarity(cls, meta):
        if meta.param_by_name.get('positive scan'):  # pylint: disable=no-else-return
            return True, 1
        elif meta.param_by_name.get('negative scan'):
            return True, -1
        else:
            return False, 0

    def get_spectrum(self, idx):
        mzs, ints = self._imzml_parser.getspectrum(idx)
        nonzero_ints_mask = ints > 0
        return mzs[nonzero_ints_mask], ints[nonzero_ints_mask]
