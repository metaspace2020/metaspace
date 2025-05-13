from pyimzml.ImzMLParser import ImzMLParser


WATERS_ACCESSION = 'MS:1000126'


def check_if_waters(imzml_parser: ImzMLParser) -> bool:
    """
    Check if the imzML file contains a Waters instrument configuration.

    Args:
        imzml_parser: The ImzMLParser instance

    Returns:
        bool: True if Waters instrument is detected, False otherwise
    """

    try:
        # Get the instrument configuration list
        for instrument_config in imzml_parser.root.findall(
            './/{http://psi.hupo.org/ms/mzml}instrumentConfiguration'
        ):
            for cv_param in instrument_config.findall('.//{http://psi.hupo.org/ms/mzml}cvParam'):
                if cv_param.get('accession') == WATERS_ACCESSION:
                    return True
        return False
    except Exception:
        return False
