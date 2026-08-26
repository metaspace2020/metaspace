import re
from pathlib import Path

from setuptools import setup, find_packages


def _read_version():
    """Read __version__ from sm/engine/__init__.py without importing the package.

    Importing sm.engine here would trigger sm/engine/__init__.py's own imports
    (e.g. sm.engine.isotope_labels -> pyMSpec), which aren't installed yet in a
    PEP 517 build-isolation environment, causing pip install -e . to fail.
    """
    init_path = Path(__file__).parent / 'sm' / 'engine' / '__init__.py'
    init_contents = init_path.read_text()
    match = re.search(r"^__version__\s*=\s*['\"]([^'\"]+)['\"]", init_contents, re.MULTILINE)
    if not match:
        raise RuntimeError(f'Unable to find __version__ in {init_path}')
    return match.group(1)


setup(
    name='sm',
    version=_read_version(),
    description='High throughput molecules annotation for imaging mass spectrometry data sets',
    url='https://github.com/metaspace2020/metaspace/tree/master/metaspace/engine',
    author='Alexandrov Team, EMBL',
    author_email='vitaly.kovalev@embl.de',
    packages=find_packages(),
    install_requires=[],
    python_requires='>=3.14',
)
